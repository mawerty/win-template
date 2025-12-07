import json
import asyncio
import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_db
from app.models.analysis import AnalysisSession, Topic, Scenario, ScenarioHistory, ArticleSummary
from app.services import gemini
from app.services.sources import generate_search_queries, generate_all_topic_sources
from app.services.scraper import fetch_urls_for_topic, fetch_urls_for_all_topics
from app.utils.logger import StepLogger, timed_step

router = APIRouter()


class CreateSessionRequest(BaseModel):
    country_profile: dict
    situation_description: str
    criteria: str | None = None
    name: str = ""
    analysis_mode: str = "forecast"  # "forecast" | "backcast"
    backcast_target_state: str | None = None
    backcast_target_year: int = 2028


class TopicSelection(BaseModel):
    topic_ids: list[int]


class TopicWeightUpdate(BaseModel):
    topic_id: int
    weight: int


class TopicWeightsUpdate(BaseModel):
    weights: list[TopicWeightUpdate]


class TopicResponse(BaseModel):
    id: int
    name: str
    keywords: list[str]
    weight: int
    rationale: str
    selected: bool
    has_cached_urls: bool = False


class ScenarioResponse(BaseModel):
    id: int
    timeframe: str
    variant: str
    content: str
    chain_of_thought: str


class SessionResponse(BaseModel):
    id: int
    name: str
    country_profile: dict
    situation_description: str
    topics: list[TopicResponse]
    scenarios: list[ScenarioResponse]


class RegenerateTopicsRequest(BaseModel):
    feedback: str  # User feedback like "więcej o energetyce, mniej o handlu"


class AddCustomTopicRequest(BaseModel):
    name: str  # Topic name, we'll generate keywords


class FinalReportSection(BaseModel):
    type: str  # "situation", "positive_12m", "negative_12m", etc.
    title: str
    content: str
    sources: list[dict]  # Citations used


class FinalReportResponse(BaseModel):
    sections: list[FinalReportSection]
    topics_used: list[dict]
    generated_at: str


def _serialize_topic(t: Topic) -> dict:
    return {
        "id": t.id, 
        "session_id": t.session_id,
        "name": t.name, 
        "keywords": json.loads(t.keywords), 
        "weight": t.weight,
        "rationale": t.rationale,
        "selected": t.selected,
        "has_cached_urls": t.has_cached_urls,
        "urls_cached_at": t.urls_cached_at.isoformat() if t.urls_cached_at else None,
        "synthesis": t.synthesis is not None,
        "synthesis_generated_at": t.synthesis_generated_at.isoformat() if t.synthesis_generated_at else None,
    }


def _serialize_scenario(s: Scenario) -> dict:
    return {
        "id": s.id,
        "timeframe": s.timeframe,
        "variant": s.variant,
        "content": s.content,
        "chain_of_thought": s.chain_of_thought,
        "reasoning_steps": s.get_reasoning_steps(),
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "version": s.version,
    }


@router.post("/sessions")
async def create_session(req: CreateSessionRequest, db: Session = Depends(get_db)):
    """Create new analysis session and generate topics."""
    
    mode_label = "Backcasting" if req.analysis_mode == "backcast" else "Prognozowanie"
    logger = StepLogger(f"Tworzenie nowej sesji ({mode_label})")
    
    # Generate session name if not provided
    if req.name:
        session_name = req.name
    elif req.analysis_mode == "backcast":
        session_name = f"Backcast {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    else:
        session_name = f"Analysis {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    
    # Create session
    async with timed_step(logger, "Saving session to database"):
        session = AnalysisSession(
            country_profile=json.dumps(req.country_profile, ensure_ascii=False),
            situation_description=req.situation_description,
            criteria=req.criteria or "",
            name=session_name,
            analysis_mode=req.analysis_mode,
            backcast_target_state=req.backcast_target_state if req.analysis_mode == "backcast" else None,
            backcast_target_year=req.backcast_target_year if req.analysis_mode == "backcast" else 2028,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        logger.substep(f"Sesja ID: {session.id}, Tryb: {mode_label}")
    
    # Parse user facts from situation description (ground truth with weights)
    async with timed_step(logger, "Parsowanie faktów bazowych z opisu sytuacji"):
        try:
            user_facts = await gemini.parse_user_facts(req.situation_description)
            session.set_user_facts(user_facts)
            db.commit()
            logger.substep(f"Wyekstrahowano {len(user_facts)} faktów z wagami")
        except Exception as e:
            logger.warning(f"Błąd parsowania faktów: {str(e)[:100]}")
    
    # Generate topics using Gemini
    async with timed_step(logger, "Generating topics via Gemini AI"):
        try:
            topics_data = await gemini.generate_topics(
                req.country_profile, 
                req.situation_description,
                req.criteria
            )
            logger.success(f"Generated {len(topics_data)} topics")
        except Exception as e:
            logger.warning(f"Gemini API error: {str(e)[:100]}")
            logger.substep("Using fallback data")
            topics_data = _get_fallback_topics()
    
    # Save topics
    async with timed_step(logger, "Saving topics to database"):
        for t in topics_data:
            topic = Topic(
                session_id=session.id,
                name=t["name"],
                keywords=json.dumps(t["keywords"], ensure_ascii=False),
                weight=t.get("weight", 50),
                rationale=t.get("rationale", ""),
                situation_factor=t.get("situation_factor", ""),
                selected=False
            )
            db.add(topic)
        
        db.commit()
        db.refresh(session)
        logger.substep(f"Saved {len(topics_data)} topics")
    
    logger.finish(f"Sesja {session.id} z {len(session.topics)} tematami")
    
    return {
        "id": session.id,
        "name": session.name,
        "analysis_mode": session.analysis_mode,
        "backcast_target_state": session.backcast_target_state,
        "backcast_target_year": session.backcast_target_year,
        "topics": [_serialize_topic(t) for t in session.topics]
    }


@router.get("/sessions/{session_id}")
async def get_session(session_id: int, db: Session = Depends(get_db)):
    """Get session with topics, scenarios, and user facts."""
    
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {
        "id": session.id,
        "name": session.name,
        "analysis_mode": session.analysis_mode,
        "backcast_target_state": session.backcast_target_state,
        "backcast_target_year": session.backcast_target_year,
        "country_profile": json.loads(session.country_profile),
        "situation_description": session.situation_description,
        "created_at": session.created_at.isoformat(),
        "current_scenario_version": session.current_scenario_version,
        "topics": [_serialize_topic(t) for t in session.topics],
        "scenarios": [_serialize_scenario(s) for s in session.scenarios],
        # User-provided facts with citations [USER-a], [USER-b], etc.
        "user_facts": session.get_user_facts(),
    }


@router.get("/sessions")
async def list_sessions(db: Session = Depends(get_db)):
    """List all analysis sessions with recent topics."""
    from sqlmodel import select
    
    sessions = db.exec(select(AnalysisSession).order_by(AnalysisSession.created_at.desc())).all()
    
    # Collect all topics across all sessions for "recent topics" section
    all_topics = []
    for s in sessions:
        for t in s.topics:
            all_topics.append({
                "id": t.id,
                "name": t.name,
                "weight": t.weight,
                "selected": t.selected,
                "has_synthesis": t.has_synthesis,
                "has_cached_urls": t.has_cached_urls,
                "session_id": s.id,
                "session_name": s.name or f"Sesja #{s.id}",
            })
    
    # Sort by weight (most important first) and take top 10
    recent_topics = sorted(all_topics, key=lambda x: -x["weight"])[:10]
    
    return {
        "sessions": [
            {
                "id": s.id,
                "name": s.name or f"Sesja #{s.id}",
                "created_at": s.created_at.isoformat(),
                "analysis_mode": s.analysis_mode,
                "backcast_target_state": s.backcast_target_state,
                "backcast_target_year": s.backcast_target_year,
                "topics_count": len(s.topics),
                "scenarios_count": len(s.scenarios),
                "has_scenarios": len(s.scenarios) > 0,
                "selected_topics_count": len([t for t in s.topics if t.selected]),
                # Include recent topics for quick access
                "recent_topics": [
                    {
                        "id": t.id,
                        "name": t.name,
                        "weight": t.weight,
                        "selected": t.selected,
                        "has_synthesis": t.has_synthesis,
                        "has_cached_urls": t.has_cached_urls,
                    }
                    for t in sorted(s.topics, key=lambda x: -x.weight)[:5]  # Top 5 by weight
                ],
            }
            for s in sessions
        ],
        # Global recent topics (across all sessions)
        "recent_topics": recent_topics,
    }


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: int, db: Session = Depends(get_db)):
    """Delete a session and all related data."""
    
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Delete related data
    for topic in session.topics:
        db.delete(topic)
    for scenario in session.scenarios:
        db.delete(scenario)
    
    db.delete(session)
    db.commit()
    
    return {"success": True, "deleted_session_id": session_id}


@router.post("/sessions/{session_id}/select-topics")
async def select_topics(session_id: int, selection: TopicSelection, db: Session = Depends(get_db)):
    """Update selected topics for a session."""
    
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    for topic in session.topics:
        topic.selected = topic.id in selection.topic_ids
    
    db.commit()
    
    return {"success": True, "selected_count": len(selection.topic_ids)}


@router.post("/sessions/{session_id}/update-weights")
async def update_topic_weights(session_id: int, update: TopicWeightsUpdate, db: Session = Depends(get_db)):
    """Update weights for multiple topics."""
    
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    updated_count = 0
    for weight_update in update.weights:
        topic = db.get(Topic, weight_update.topic_id)
        if topic and topic.session_id == session_id:
            topic.weight = max(1, min(100, weight_update.weight))
            updated_count += 1
    
    db.commit()
    
    return {"success": True, "updated_count": updated_count}


@router.get("/topics/{topic_id}")
async def get_topic(topic_id: int, db: Session = Depends(get_db)):
    """Get a single topic with all its data including cached URLs."""
    
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    result = _serialize_topic(topic)
    
    # Include cached data if available
    if topic.cached_sources:
        result["sources"] = topic.get_cached_sources()
    if topic.cached_urls:
        result["fetched_urls"] = topic.get_cached_urls()
    
    return result


@router.get("/topics/{topic_id}/sources")
async def get_topic_sources(topic_id: int, force_refresh: bool = False, db: Session = Depends(get_db)):
    """Get source URLs for a specific topic. Uses cache if available."""
    
    logger = StepLogger(f"Pobieranie źródeł dla tematu #{topic_id}")
    
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    # Check cache first
    if topic.cached_sources and not force_refresh:
        logger.step("Używam cache'owanych źródeł")
        sources = topic.get_cached_sources()
        logger.finish("Źródła z cache")
    else:
        # Generate new sources
        async with timed_step(logger, "Generowanie zapytań źródłowych"):
            keywords = json.loads(topic.keywords)
            sources = await generate_search_queries(topic.name, keywords)
            
            # Cache the sources
            topic.set_cached_sources(sources)
            db.commit()
        
        logger.finish("Nowe źródła wygenerowane i zcache'owane")
    
    return {
        "topic_id": topic.id,
        "topic_name": topic.name,
        "keywords": json.loads(topic.keywords),
        "weight": topic.weight,
        "sources": sources,
        "selection_reasoning": sources.get("selection_reasoning", ""),
        "sources_count": {
            "ministries": len(sources.get("ministries", [])),
            "institutions": len(sources.get("institutions", [])),
            "total": len(sources.get("ministries", [])) + len(sources.get("institutions", [])),
        },
        "cached": topic.cached_sources is not None and not force_refresh,
    }


@router.get("/topics/{topic_id}/fetch-urls")
async def fetch_topic_urls(topic_id: int, force_refresh: bool = False, db: Session = Depends(get_db)):
    """Fetch real URLs for a topic. Uses cache if available."""
    
    logger = StepLogger(f"Pobieranie URLi dla tematu #{topic_id}")
    
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    # Check URL cache first
    if topic.cached_urls and not force_refresh:
        logger.step("Używam cache'owanych URLi")
        fetched_urls = topic.get_cached_urls()
        logger.finish(f"URLe z cache ({fetched_urls.get('stats', {}).get('total_urls', 0)} linków)")
        
        return {
            "topic_id": topic.id,
            "topic_name": topic.name,
            "keywords": json.loads(topic.keywords),
            "weight": topic.weight,
            "fetched_urls": fetched_urls,
            "cached": True,
            "cached_at": topic.urls_cached_at.isoformat() if topic.urls_cached_at else None,
        }
    
    # Get or generate sources first
    if topic.cached_sources and not force_refresh:
        sources = topic.get_cached_sources()
    else:
        async with timed_step(logger, "Generowanie zapytań źródłowych"):
            keywords = json.loads(topic.keywords)
            sources = await generate_search_queries(topic.name, keywords)
            topic.set_cached_sources(sources)
    
    # Fetch real URLs - 4 queries per country, 5 results each = up to 20 URLs per country
    async with timed_step(logger, "Pobieranie URLi z wyszukiwarek"):
        fetched_urls = await fetch_urls_for_topic(sources, max_per_source=5)
        
        # Cache the URLs
        topic.set_cached_urls(fetched_urls)
        db.commit()
    
    logger.finish(f"Pobrano i zcache'owano {fetched_urls.get('stats', {}).get('total_urls', 0)} URLi")
    
    return {
        "topic_id": topic.id,
        "topic_name": topic.name,
        "keywords": json.loads(topic.keywords),
        "weight": topic.weight,
        "fetched_urls": fetched_urls,
        "cached": False,
    }


@router.post("/sessions/{session_id}/fetch-all-urls")
async def fetch_session_urls(session_id: int, force_refresh: bool = False, db: Session = Depends(get_db)):
    """Fetch real URLs for all selected topics. Uses cache when available."""
    
    logger = StepLogger("Pobieranie URLi dla sesji")
    
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    selected_topics = [t for t in session.topics if t.selected]
    if not selected_topics:
        raise HTTPException(status_code=400, detail="No topics selected")
    
    logger.step(f"Wybrano {len(selected_topics)} tematów")
    
    results = []
    cached_count = 0
    fetched_count = 0
    
    for i, topic in enumerate(selected_topics):
        # Check cache
        if topic.cached_urls and not force_refresh:
            logger.substep(f"[CACHE] {topic.name[:40]}...")
            fetched_urls = topic.get_cached_urls()
            cached_count += 1
        else:
            logger.substep(f"[FETCH] {topic.name[:40]}...")
            
            # Get or generate sources
            if topic.cached_sources and not force_refresh:
                sources = topic.get_cached_sources()
            else:
                keywords = json.loads(topic.keywords)
                sources = await generate_search_queries(topic.name, keywords)
                topic.set_cached_sources(sources)
            
            # Fetch URLs - 4 queries per country
            fetched_urls = await fetch_urls_for_topic(sources, max_per_source=5)
            topic.set_cached_urls(fetched_urls)
            fetched_count += 1
        
        results.append({
            "id": topic.id,
            "name": topic.name,
            "keywords": json.loads(topic.keywords),
            "weight": topic.weight,
            "fetched_urls": fetched_urls,
            "cached": topic.cached_urls is not None and not force_refresh,
        })
    
    db.commit()
    
    logger.finish(f"{cached_count} z cache, {fetched_count} nowych")
    
    return {
        "session_id": session_id,
        "topics_with_urls": results,
        "stats": {
            "cached": cached_count,
            "fetched": fetched_count,
            "total": len(selected_topics),
        }
    }


@router.get("/sessions/{session_id}/history")
async def get_scenario_history(session_id: int, db: Session = Depends(get_db)):
    """Get history of all scenario generations for a session."""
    from sqlmodel import select
    
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    history = db.exec(
        select(ScenarioHistory)
        .where(ScenarioHistory.session_id == session_id)
        .order_by(ScenarioHistory.version.desc())
    ).all()
    
    return {
        "session_id": session_id,
        "current_version": session.current_scenario_version,
        "history": [
            {
                "version": h.version,
                "created_at": h.created_at.isoformat(),
                "topic_ids": h.get_topic_ids(),
                "scenarios_preview": [
                    {"timeframe": s["timeframe"], "variant": s["variant"]}
                    for s in h.get_scenarios()
                ]
            }
            for h in history
        ]
    }


@router.get("/sessions/{session_id}/history/{version}")
async def get_scenario_version(session_id: int, version: int, db: Session = Depends(get_db)):
    """Get a specific version of scenarios from history."""
    from sqlmodel import select
    
    history = db.exec(
        select(ScenarioHistory)
        .where(ScenarioHistory.session_id == session_id)
        .where(ScenarioHistory.version == version)
    ).first()
    
    if not history:
        raise HTTPException(status_code=404, detail="Version not found")
    
    return {
        "session_id": session_id,
        "version": history.version,
        "created_at": history.created_at.isoformat(),
        "topic_ids": history.get_topic_ids(),
        "scenarios": history.get_scenarios(),
    }


@router.post("/sessions/{session_id}/generate-scenarios")
async def generate_scenarios_endpoint(session_id: int, db: Session = Depends(get_db)):
    """Generate scenarios based on selected topics. Supports both forecast and backcast modes."""
    
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Determine mode
    is_backcast = session.is_backcast
    mode_label = "Backcasting" if is_backcast else "Prognozowanie"
    
    logger = StepLogger(f"Generowanie: {mode_label}")
    
    selected_topics = [t for t in session.topics if t.selected]
    if not selected_topics:
        raise HTTPException(status_code=400, detail="No topics selected")
    
    logger.step(f"Wybrane tematy: {len(selected_topics)}")
    for t in selected_topics:
        logger.substep(f"[waga {t.weight}] {t.name[:50]}")
    
    # Get user-provided facts (ground truth)
    user_facts = session.get_user_facts()
    if user_facts:
        logger.substep(f"Załadowano {len(user_facts)} faktów bazowych [USER-a..z]")
    
    # Save current scenarios to history before deleting
    if session.scenarios:
        async with timed_step(logger, "Zapisywanie historii"):
            history = ScenarioHistory(
                session_id=session.id,
                version=session.current_scenario_version,
                scenarios_json=json.dumps([_serialize_scenario(s) for s in session.scenarios], ensure_ascii=False),
                topic_ids_used=json.dumps([t.id for t in selected_topics]),
            )
            db.add(history)
    
    # Delete existing scenarios
    async with timed_step(logger, "Usuwanie poprzednich scenariuszy"):
        for s in session.scenarios:
            db.delete(s)
        db.commit()
    
    # Increment version
    session.current_scenario_version += 1
    
    # Generate new scenarios
    country_profile = json.loads(session.country_profile)
    topics_data = [
        {
            "name": t.name, 
            "keywords": json.loads(t.keywords),
            "weight": t.weight
        } 
        for t in selected_topics
    ]
    
    if is_backcast:
        # BACKCAST MODE - generate backcast analysis
        async with timed_step(logger, f"Generowanie backcastu do roku {session.backcast_target_year}"):
            try:
                backcast_result = await gemini.generate_backcast(
                    country_profile,
                    session.situation_description,
                    topics_data,
                    target_state=session.backcast_target_state,
                    target_year=session.backcast_target_year,
                )
                
                # Convert backcast to scenario format for storage
                # We store backcast as a single "scenario" with special timeframe
                scenarios_data = [{
                    "timeframe": "backcast",
                    "variant": "target",
                    "content": json.dumps(backcast_result["backcast_steps"], ensure_ascii=False),
                    "chain_of_thought": backcast_result.get("chain_of_thought", ""),
                    "reasoning_steps": [
                        {
                            "fact": f"Target: {session.backcast_target_state}",
                            "source_weight": 100,
                            "inference": f"Backcast to year {session.backcast_target_year}",
                            "impact": "positive",
                            "confidence": "high"
                        }
                    ],
                    # Store full backcast data
                    "backcast_data": backcast_result,
                }]
                evolution_stats = {}
                
                feasibility = backcast_result.get("feasibility_assessment", {})
                logger.success(f"Backcast: {len(backcast_result.get('backcast_steps', []))} kroków, wykonalność: {feasibility.get('score', 'N/A')}%")
            except Exception as e:
                logger.warning(f"Gemini API error: {str(e)[:100]}")
                raise HTTPException(status_code=500, detail=f"Backcast generation failed: {str(e)[:200]}")
    else:
        # FORECAST MODE - traditional scenario generation
        async with timed_step(logger, "Generowanie scenariuszy przez Gemini AI (z ewolucją AlphaEvolve)"):
            try:
                # generate_scenarios now returns {"scenarios": [...], "evolution_stats": {...}}
                result = await gemini.generate_scenarios(
                    country_profile, 
                    session.situation_description,
                    topics_data,
                    use_evolution=True,  # Enable AlphaEvolve-style evolution
                    user_facts=user_facts,  # Include ground truth facts with [USER-X] citations
                )
                scenarios_data = result["scenarios"]
                evolution_stats = result.get("evolution_stats", {})
                
                # Log evolution improvements
                for key, stats in evolution_stats.items():
                    improvement = stats.get("improvement", 0)
                    logger.substep(f"🧬 {key}: +{improvement:.0f} score")
                
                logger.success(f"Wygenerowano {len(scenarios_data)} scenariuszy z ewolucją")
            except Exception as e:
                logger.warning(f"Gemini API error: {str(e)[:100]}")
                logger.substep("Używam danych zastępczych")
                scenarios_data = _get_fallback_scenarios()
                evolution_stats = {}
    
    # Save scenarios with topic IDs
    async with timed_step(logger, "Zapisywanie scenariuszy"):
        topic_ids_json = json.dumps([t.id for t in selected_topics])
        for s in scenarios_data:
            # For backcast, store the full backcast_data in content
            content = s["content"]
            if is_backcast and "backcast_data" in s:
                content = json.dumps(s["backcast_data"], ensure_ascii=False)
            
            scenario = Scenario(
                session_id=session.id,
                timeframe=s["timeframe"],
                variant=s["variant"],
                content=content,
                chain_of_thought=s["chain_of_thought"],
                version=session.current_scenario_version,
                topic_ids_used=topic_ids_json,
                reasoning_steps=json.dumps(s.get("reasoning_steps", []), ensure_ascii=False),
            )
            db.add(scenario)
        
        db.commit()
        db.refresh(session)
    
    # Get or fetch URLs for topics
    topics_with_urls = []
    async with timed_step(logger, "Pobieranie źródeł (z cache lub nowych)"):
        for topic in selected_topics:
            if topic.cached_urls:
                logger.substep(f"[CACHE] {topic.name[:30]}...")
                fetched_urls = topic.get_cached_urls()
            else:
                logger.substep(f"[FETCH] {topic.name[:30]}...")
                # Generate sources if needed
                if not topic.cached_sources:
                    keywords = json.loads(topic.keywords)
                    sources = await generate_search_queries(topic.name, keywords)
                    topic.set_cached_sources(sources)
                else:
                    sources = topic.get_cached_sources()
                
                # Fetch URLs - 4 queries per country
                fetched_urls = await fetch_urls_for_topic(sources, max_per_source=5)
                topic.set_cached_urls(fetched_urls)
            
            topics_with_urls.append({
                "id": topic.id,
                "name": topic.name,
                "keywords": json.loads(topic.keywords),
                "weight": topic.weight,
                "sources": topic.get_cached_sources(),
                "fetched_urls": fetched_urls,
            })
    
    db.commit()
    
    logger.finish(f"v{session.current_scenario_version}: {len(session.scenarios)} scenariuszy")
    
    return {
        "scenarios": [_serialize_scenario(s) for s in session.scenarios],
        "sources": topics_with_urls,
        "version": session.current_scenario_version,
        "evolution": evolution_stats,  # AlphaEvolve evolution history
    }


def _get_fallback_topics():
    """Return fallback topics when Gemini API fails."""
    return [
        {
            "name": "Wpływ embarga na chipy na przemysł AI Atlantis",
            "keywords": ["chip embargo impact", "semiconductor sanctions", "AI industry", "processor shortage"],
            "weight": 85,
            "rationale": "Bezpośrednio związane z wagą 25 dla 'kryzysu dostaw GPU'"
        },
        {
            "name": "Transformacja motoryzacji UE a eksport Atlantis",
            "keywords": ["EU automotive crisis", "EV transition", "component exports", "car industry"],
            "weight": 75,
            "rationale": "Kluczowe dla przemysłu ciężkiego - waga 20"
        },
        {
            "name": "Skutki rozejmu na Ukrainie dla regionu",
            "keywords": ["Ukraine ceasefire", "Eastern Europe stability", "post-war reconstruction"],
            "weight": 80,
            "rationale": "Wysoka waga 30 w opisie sytuacji - bezpieczeństwo regionalne"
        },
        {
            "name": "Niskie ceny ropy a gospodarka Rosji",
            "keywords": ["oil price crash Russia", "Russian budget crisis", "energy revenue"],
            "weight": 70,
            "rationale": "Waga 15 - wpływ na zagrożenia ze strony Rosji"
        },
        {
            "name": "Rewolucja OZE 2028 - szanse dla Atlantis",
            "keywords": ["renewable energy boom 2028", "green energy investment", "clean tech"],
            "weight": 65,
            "rationale": "Powiązane z ambicjami energetycznymi Atlantis"
        },
        {
            "name": "Inwestycje USA w surowce krytyczne Ukrainy",
            "keywords": ["US Ukraine minerals", "rare earth investment", "critical resources"],
            "weight": 60,
            "rationale": "Waga 10 w opisie - możliwości kooperacji"
        },
    ]


def _get_fallback_scenarios():
    """Return fallback scenario data when Gemini API fails."""
    return [
        {
            "timeframe": "12_months", 
            "variant": "positive", 
            "content": """W perspektywie 12 miesięcy Atlantis może skorzystać z kilku pozytywnych trendów. Spadek cen procesorów GPU po odbudowie mocy produkcyjnych TSMC pozwoli na przyspieszenie inwestycji w centra danych i infrastrukturę AI.

Transformacja energetyczna w UE stworzy popyt na komponenty produkowane przez przemysł ciężki Atlantis. Niskie ceny ropy (30-35 USD) obniżą koszty produkcji przemysłowej, zwiększając konkurencyjność eksportu.

Rozejm na Ukrainie stabilizuje region, otwierając możliwości udziału firm z Atlantis w odbudowie infrastruktury.""",
            "chain_of_thought": """Analiza opiera się na korelacjach:
1. Spadek cen GPU → inwestycje w infrastrukturę cyfrową
2. Niskie ceny ropy → wzrost konkurencyjności przemysłu
3. Rozejm na Ukrainie → możliwości handlowe""",
            "reasoning_steps": [
                {"fact": "GPU production recovery by end of 2028", "source_weight": 30, "inference": "AI infrastructure investment accelerates", "impact": "positive", "confidence": "high"},
                {"fact": "Oil prices 30-35 USD", "source_weight": 25, "inference": "Lower production costs, higher competitiveness", "impact": "positive", "confidence": "high"},
                {"fact": "Ukraine ceasefire ongoing", "source_weight": 10, "inference": "Regional stability enables trade expansion", "impact": "positive", "confidence": "medium"},
            ]
        },
        {
            "timeframe": "12_months", 
            "variant": "negative", 
            "content": """Scenariusz negatywny zakłada eskalację kilku ryzyk jednocześnie. Przedłużający się kryzys dostaw GPU może opóźnić projekty AI i cyfryzacji.

Kryzys europejskiego przemysłu motoryzacyjnego uderzy w eksport Atlantis. Zagrożenia hybrydowe mogą się zintensyfikować.

Niepewność co do trwałości rozejmu na Ukrainie utrzyma napięcie w regionie.""",
            "chain_of_thought": """Negatywny scenariusz wynika z kumulacji ryzyk:
1. Kryzys GPU → zahamowanie rozwoju AI
2. Kryzys motoryzacji → spadek eksportu
3. Zagrożenia hybrydowe → destabilizacja""",
            "reasoning_steps": [
                {"fact": "GPU shortage 60% capacity loss", "source_weight": 30, "inference": "AI projects delayed, tech sector stagnates", "impact": "negative", "confidence": "high"},
                {"fact": "EU automotive profits at 30%", "source_weight": 15, "inference": "Atlantis automotive exports decline sharply", "impact": "negative", "confidence": "high"},
                {"fact": "Hybrid attacks ongoing", "source_weight": 20, "inference": "Critical infrastructure at risk", "impact": "negative", "confidence": "medium"},
            ]
        },
        {
            "timeframe": "36_months", 
            "variant": "positive", 
            "content": """W perspektywie 36 miesięcy Atlantis może osiągnąć pozycję regionalnego lidera. Pełna odbudowa mocy produkcyjnych GPU do końca 2028 zbiegnie się z dojrzałością projektów AI.

Rewolucja OZE od 2028 roku stworzy ogromne możliwości. Atlantis może stać się eksporterem czystej energii.

Odbudowa Ukrainy stanie się jednym z największych projektów infrastrukturalnych w Europie.""",
            "chain_of_thought": """Długoterminowy scenariusz pozytywny:
1. 2028: Odbudowa produkcji GPU + rozkwit OZE
2. Niskie ceny ropy → osłabienie Rosji
3. Odbudowa Ukrainy → możliwości dla przemysłu""",
            "reasoning_steps": [
                {"fact": "GPU recovery complete by 2028", "source_weight": 30, "inference": "Atlantis becomes regional AI hub", "impact": "positive", "confidence": "high"},
                {"fact": "OZE boom from 2028", "source_weight": 25, "inference": "Atlantis exports clean energy", "impact": "positive", "confidence": "medium"},
                {"fact": "Oil 30-35 USD weakens Russia", "source_weight": 25, "inference": "Reduced hybrid threat, military budget pressure on Russia", "impact": "positive", "confidence": "high"},
            ]
        },
        {
            "timeframe": "36_months", 
            "variant": "negative", 
            "content": """Scenariusz negatywny w perspektywie 36 miesięcy zakłada trwałą destabilizację. Kryzys dostaw procesorów może przedłużyć się poza 2028 rok.

Rozpad UE na grupy "różnych prędkości" może zepchnąć Atlantis do drugiej ligi integracji.

Rozejm na Ukrainie może się załamać, prowadząc do nowej eskalacji.""",
            "chain_of_thought": """Negatywny scenariusz długoterminowy:
1. Przedłużający się kryzys technologiczny
2. Fragmentacja UE → marginalizacja Atlantis
3. Załamanie rozejmu → militaryzacja budżetu""",
            "reasoning_steps": [
                {"fact": "GPU crisis extends beyond 2028", "source_weight": 30, "inference": "Long-term tech disadvantage vs Asia", "impact": "negative", "confidence": "medium"},
                {"fact": "EU fragmentation risk", "source_weight": 15, "inference": "Atlantis pushed to second tier of integration", "impact": "negative", "confidence": "medium"},
                {"fact": "Ceasefire collapse risk", "source_weight": 10, "inference": "Military budget increase, economic strain", "impact": "negative", "confidence": "low"},
            ]
        },
    ]


# ============================================================================
# TOPIC REGENERATION & CUSTOM TOPICS
# ============================================================================

@router.post("/sessions/{session_id}/regenerate-topics")
async def regenerate_topics(
    session_id: int,
    req: RegenerateTopicsRequest,
    db: Session = Depends(get_db)
):
    """Regenerate topics based on user feedback."""
    
    logger = StepLogger(f"Regeneracja tematów dla sesji #{session_id}")
    
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    country_profile = json.loads(session.country_profile)
    
    # Enhanced prompt with feedback
    async with timed_step(logger, "Generowanie nowych tematów z feedbackiem"):
        topics_data = await gemini.generate_topics_with_feedback(
            country_profile=country_profile,
            situation=session.situation_description,
            feedback=req.feedback
        )
        logger.success(f"Wygenerowano {len(topics_data)} nowych tematów")
    
    # Delete old topics (that are not processed)
    async with timed_step(logger, "Usuwanie starych tematów"):
        old_topics = [t for t in session.topics if not t.synthesis]
        deleted_count = 0
        for t in old_topics:
            db.delete(t)
            deleted_count += 1
        db.commit()
        logger.substep(f"Usunięto {deleted_count} nieużywanych tematów")
    
    # Save new topics
    async with timed_step(logger, "Zapisywanie nowych tematów"):
        new_topics = []
        for t in topics_data:
            topic = Topic(
                session_id=session.id,
                name=t["name"],
                keywords=json.dumps(t["keywords"], ensure_ascii=False),
                weight=t.get("weight", 50),
                rationale=t.get("rationale", ""),
                selected=True  # Auto-select new topics
            )
            db.add(topic)
            new_topics.append(topic)
        db.commit()
        
        for t in new_topics:
            db.refresh(t)
    
    logger.finish(f"Regeneracja zakończona - {len(new_topics)} nowych tematów")
    
    return {
        "message": f"Wygenerowano {len(new_topics)} nowych tematów",
        "topics": [_serialize_topic(t) for t in new_topics],
        "feedback_used": req.feedback
    }


@router.post("/sessions/{session_id}/add-topic")
async def add_custom_topic(
    session_id: int,
    req: AddCustomTopicRequest,
    db: Session = Depends(get_db)
):
    """Add a custom topic - we generate keywords for it."""
    
    logger = StepLogger(f"Dodawanie własnego tematu do sesji #{session_id}")
    
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Generate keywords for the topic
    async with timed_step(logger, "Generowanie słów kluczowych"):
        keywords = await gemini.generate_keywords_for_topic(req.name)
        logger.substep(f"Keywords: {', '.join(keywords)}")
    
    # Create topic
    topic = Topic(
        session_id=session.id,
        name=req.name,
        keywords=json.dumps(keywords, ensure_ascii=False),
        weight=50,  # Default weight
        rationale="Temat dodany ręcznie przez użytkownika",
        selected=True
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)
    
    logger.finish(f"Dodano temat: {topic.name}")
    
    return {
        "message": "Temat dodany",
        "topic": _serialize_topic(topic)
    }


# ============================================================================
# BATCH PROCESSING WITH PROGRESS
# ============================================================================

@router.get("/sessions/{session_id}/progress")
async def get_processing_progress(session_id: int):
    """Get current processing progress for a session."""
    from app.services.progress import get_progress, is_processing
    
    progress = get_progress(session_id)
    if progress:
        return {
            "is_processing": True,
            **progress
        }
    return {
        "is_processing": False,
        "step": "",
        "current": 0,
        "total": 0,
        "percent": 0,
        "message": "",
        "sub_step": ""
    }


@router.post("/sessions/{session_id}/process-all")
async def process_all_topics(
    session_id: int,
    db: Session = Depends(get_db)
):
    """
    Process all selected topics:
    1. Fetch URLs for each topic
    2. Scrape and summarize articles
    3. Generate country summaries
    4. Generate topic synthesis
    
    Returns progress updates via response.
    """
    from app.services.article_processor import (
        process_topic_articles,
        generate_country_summary,
        generate_topic_synthesis,
    )
    from app.services.progress import set_progress, clear_progress, is_processing
    
    # Check if already processing
    if is_processing(session_id):
        raise HTTPException(status_code=409, detail="Sesja jest już przetwarzana")
    
    logger = StepLogger(f"Przetwarzanie wszystkich tematów dla sesji #{session_id}")
    
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get Atlantis profile for synthesis context
    country_profile = json.loads(session.country_profile)
    
    # Get user-provided facts (ground truth)
    user_facts = session.get_user_facts()
    if user_facts:
        logger.substep(f"Załadowano {len(user_facts)} faktów bazowych od użytkownika")
    
    selected_topics = [t for t in session.topics if t.selected]
    if not selected_topics:
        raise HTTPException(status_code=400, detail="Brak wybranych tematów")
    
    total_topics = len(selected_topics)
    
    # Calculate total steps: for each topic = URLs + articles + countries + synthesis = 4 steps
    total_steps = total_topics * 4
    current_step = 0
    
    results = {
        "topics_processed": 0,
        "topics_total": total_topics,
        "urls_fetched": 0,
        "articles_summarized": 0,
        "countries_processed": 0,
        "syntheses_generated": 0,
        "topic_results": []
    }
    
    logger.substep(f"Wybrano {total_topics} tematów do przetworzenia")
    set_progress(session_id, "start", 0, total_steps, f"Rozpoczynam przetwarzanie {total_topics} tematów")
    
    try:
        # Process each topic
        for idx, topic in enumerate(selected_topics, 1):
            topic_logger = StepLogger(f"[{idx}/{total_topics}] Temat: {topic.name[:50]}")
            topic_result = {
                "topic_id": topic.id,
                "topic_name": topic.name,
                "urls_count": 0,
                "articles_count": 0,
                "countries_count": 0,
                "synthesis_generated": False
            }
            
            try:
                # Step 1: Fetch URLs if not cached
                current_step += 1
                set_progress(session_id, "urls", current_step, total_steps, 
                           f"[{idx}/{total_topics}] {topic.name[:40]}", "Pobieranie linków...")
                
                if not topic.has_cached_urls:
                    async with timed_step(topic_logger, "Pobieranie URLi"):
                        keywords = json.loads(topic.keywords)
                        sources = await generate_search_queries(topic.name, keywords)
                        topic.set_cached_sources(sources)
                        
                        fetched_urls = await fetch_urls_for_topic(sources, max_per_source=5)
                        topic.set_cached_urls(fetched_urls)
                        db.commit()
                        
                        url_count = len(fetched_urls.get("all_urls", []))
                        topic_result["urls_count"] = url_count
                        results["urls_fetched"] += url_count
                        topic_logger.substep(f"Pobrano {url_count} URLi")
                else:
                    urls_data = topic.get_cached_urls()
                    url_count = len(urls_data.get("all_urls", []))
                    topic_result["urls_count"] = url_count
                    topic_logger.substep(f"Używam zcache'owanych {url_count} URLi")
                
                # Step 2: Process articles
                current_step += 1
                set_progress(session_id, "articles", current_step, total_steps,
                           f"[{idx}/{total_topics}] {topic.name[:40]}", "Streszczanie artykułów...")
                
                urls_data = topic.get_cached_urls()
                async with timed_step(topic_logger, "Streszczanie artykułów"):
                    articles, articles_by_source = await process_topic_articles(
                        topic_id=topic.id,
                        urls_data=urls_data,
                        db=db,
                        max_per_source=5,
                        total_limit=50
                    )
                    topic_result["articles_count"] = len(articles)
                    results["articles_summarized"] += len(articles)
                    topic_logger.substep(f"Streszczono {len(articles)} artykułów")
                
                # Step 3: Generate country summaries
                current_step += 1
                set_progress(session_id, "countries", current_step, total_steps,
                           f"[{idx}/{total_topics}] {topic.name[:40]}", "Generowanie podsumowań krajów...")
                
                country_summaries = []
                if articles_by_source:
                    # Filter countries with 2+ articles
                    MIN_ARTICLES = 2
                    filtered_sources = {
                        country: arts for country, arts in articles_by_source.items()
                        if len(arts) >= MIN_ARTICLES
                    }
                    
                    if filtered_sources:
                        async with timed_step(topic_logger, "Generowanie podsumowań krajów"):
                            for country, country_articles in filtered_sources.items():
                                try:
                                    set_progress(session_id, "countries", current_step, total_steps,
                                               f"[{idx}/{total_topics}] {topic.name[:40]}", f"Kraj: {country}...")
                                    cs = await generate_country_summary(country, topic.name, country_articles)
                                    country_summaries.append(cs)
                                except Exception as e:
                                    topic_logger.warning(f"Błąd dla {country}: {e}")
                            
                            topic_result["countries_count"] = len(country_summaries)
                            results["countries_processed"] += len(country_summaries)
                            topic_logger.substep(f"Wygenerowano {len(country_summaries)} podsumowań krajów")
                
                # Step 4: Generate synthesis
                current_step += 1
                set_progress(session_id, "synthesis", current_step, total_steps,
                           f"[{idx}/{total_topics}] {topic.name[:40]}", "Generowanie syntezy...")
                
                if country_summaries:
                    async with timed_step(topic_logger, "Generowanie syntezy tematu"):
                        synthesis_result = await generate_topic_synthesis(
                            topic_name=topic.name,
                            country_summaries=country_summaries,
                            user_facts=user_facts,  # Include ground truth facts
                            topic_id=topic.id,  # For unique citations [Country-T{id}-N]
                            country_profile=country_profile,  # Atlantis profile for context
                        )
                        
                        topic.synthesis = json.dumps({
                            "text": synthesis_result.get("synthesis", ""),
                            "country_summaries": country_summaries,
                            "user_facts_used": len(user_facts) if user_facts else 0,
                        }, ensure_ascii=False)
                        topic.synthesis_generated_at = datetime.utcnow()
                        db.commit()
                        
                        topic_result["synthesis_generated"] = True
                        results["syntheses_generated"] += 1
                        topic_logger.success("Synteza wygenerowana")
                
                results["topics_processed"] += 1
                results["topic_results"].append(topic_result)
                topic_logger.finish("Temat przetworzony")
                
            except Exception as e:
                topic_logger.warning(f"Błąd przetwarzania: {str(e)[:100]}")
                topic_result["error"] = str(e)[:200]
                results["topic_results"].append(topic_result)
                # Still increment steps to keep progress moving
                current_step = idx * 4
        
        logger.finish(f"Przetworzono {results['topics_processed']}/{total_topics} tematów")
        
    finally:
        # Always clear progress when done
        clear_progress(session_id)
    
    return results


# ============================================================================
# FINAL REPORT GENERATION
# ============================================================================

FINAL_REPORT_PROMPTS = {
    "data_summary": """Write a MAX 250-word executive summary of the INPUT DATA used in this analysis.
This is the opening section of a diplomatic report - be clear, professional, and concise.

ANALYSIS SCOPE:
- Topics analyzed: {topic_count}
- Topic names: {topic_names}
- Countries/sources covered: {countries}
- Topic importance (weights): Listed with each topic

TOPIC SYNTHESES:
{syntheses}

WRITE EXACTLY 250 WORDS OR LESS covering:
1. What data sources were analyzed (ministries, institutions, think tanks)
2. Which countries' perspectives are represented
3. Key topics and their relative importance (weights reflect priority)
4. Time period of analyzed data
5. Any notable data gaps or limitations

Format: Single flowing paragraph, professional diplomatic tone. This summary helps the reader understand what information was available for the analysis.""",

    "situation": """Based on these topic syntheses, write a 400-500 word overview of the CURRENT SITUATION.
Describe what is happening now - the key facts, trends, and dynamics.

CRITICAL - CITATION FORMAT:
- Use EXACT citations from syntheses: [Country-T#-N] e.g., [Germany-T5-1], [USA-T3-2]
- For general topic reference: [Country-T#] e.g., [China-T7]
- For user facts: [USER-a], [USER-b], etc.
- EVERY claim must have at least one citation!

TOPIC SYNTHESES:
{syntheses}

Write a flowing, analytical paragraph about the current situation with proper citations:""",

    "positive_12m": """Based on these topic syntheses, write a 400-500 word POSITIVE SCENARIO for the next 12 MONTHS.
Describe what could go well for Atlantis. Be specific with timelines and outcomes.

CRITICAL - CITATION FORMAT:
- Use EXACT citations from syntheses: [Country-T#-N] e.g., [USA-T5-1], [Germany-T3-2]  
- For general topic reference: [Country-T#] e.g., [France-T4]
- For user facts: [USER-a], [USER-b], etc.
- EVERY claim must have at least one citation!

TOPIC SYNTHESES:
{syntheses}

Write a positive 12-month forecast with proper citations:""",

    "negative_12m": """Based on these topic syntheses, write a 400-500 word NEGATIVE SCENARIO for the next 12 MONTHS.
Describe risks and challenges for Atlantis. Be specific about what could go wrong.

CRITICAL - CITATION FORMAT:
- Use EXACT citations from syntheses: [Country-T#-N] e.g., [China-T5-1], [Russia-T3-2]
- For general topic reference: [Country-T#] e.g., [China-T7]
- For user facts: [USER-a], [USER-b], etc.
- EVERY claim must have at least one citation!

TOPIC SYNTHESES:
{syntheses}

Write a negative 12-month forecast with proper citations:""",

    "positive_36m": """Based on these topic syntheses, write a 400-500 word POSITIVE SCENARIO for the next 36 MONTHS.
Describe long-term opportunities for Atlantis. Be specific about structural changes.

CRITICAL - CITATION FORMAT:
- Use EXACT citations from syntheses: [Country-T#-N] e.g., [USA-T5-1], [OECD-T3-2]
- For general topic reference: [Country-T#] e.g., [Germany-T4]
- For user facts: [USER-a], [USER-b], etc.
- EVERY claim must have at least one citation!

TOPIC SYNTHESES:
{syntheses}

Write a positive 36-month forecast with proper citations:""",

    "negative_36m": """Based on these topic syntheses, write a 400-500 word NEGATIVE SCENARIO for the next 36 MONTHS.
Describe long-term risks for Atlantis. Be specific about structural threats.

CRITICAL - CITATION FORMAT:
- Use EXACT citations from syntheses: [Country-T#-N] e.g., [Russia-T5-1], [China-T3-2]
- For general topic reference: [Country-T#] e.g., [Russia-T7]
- For user facts: [USER-a], [USER-b], etc.
- EVERY claim must have at least one citation!

TOPIC SYNTHESES:
{syntheses}

Write a negative 36-month forecast with proper citations:""",

    "recommendations": """Based on these topic syntheses and the scenarios, write 400-500 words of RECOMMENDATIONS for Atlantis.
What should Atlantis do to:
1. Avoid negative scenarios
2. Capitalize on positive opportunities
Be specific and actionable.

CRITICAL - CITATION FORMAT:
- Use EXACT citations from syntheses: [Country-T#-N] e.g., [Germany-T5-1], [USA-T3-2]
- For general topic reference: [Country-T#] e.g., [France-T4]
- For user facts: [USER-a], [USER-b], etc.
- Include citations to support each recommendation!

TOPIC SYNTHESES:
{syntheses}

Write actionable recommendations with proper citations:"""
}

SECTION_TITLES = {
    "data_summary": "Streszczenie Danych Wejściowych",
    "situation": "Aktualny Stan Sytuacji",
    "positive_12m": "Prognoza Pozytywna (12 miesięcy)",
    "negative_12m": "Prognoza Negatywna (12 miesięcy)",
    "positive_36m": "Prognoza Pozytywna (36 miesięcy)",
    "negative_36m": "Prognoza Negatywna (36 miesięcy)",
    "recommendations": "Rekomendacje dla Atlantis"
}


@router.post("/sessions/{session_id}/generate-report")
async def generate_final_report(
    session_id: int,
    db: Session = Depends(get_db)
):
    """Generate the final 6-section report from all topic syntheses."""
    from app.services.gemini import call_gemini_with_prompt
    
    logger = StepLogger(f"Generowanie raportu końcowego dla sesji #{session_id}")
    
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get topics with syntheses
    topics_with_synthesis = [
        t for t in session.topics 
        if t.selected and t.synthesis
    ]
    
    if not topics_with_synthesis:
        raise HTTPException(
            status_code=400, 
            detail="Brak tematów z wygenerowaną syntezą. Najpierw przetwórz tematy."
        )
    
    logger.substep(f"Znaleziono {len(topics_with_synthesis)} tematów z syntezą")
    
    import re
    
    def convert_old_citations_to_new(text: str, topic_id: int, countries: list[str]) -> str:
        """
        Convert old [Country-N] citations to new [Country-T{topic_id}-N] format.
        Also handles [Country] general references -> [Country-T{topic_id}]
        """
        for country in countries:
            # Convert [Country-N] -> [Country-T{id}-N]
            text = re.sub(
                rf'\[{re.escape(country)}-(\d+)\]',
                f'[{country}-T{topic_id}-\\1]',
                text
            )
            # Convert standalone [Country] -> [Country-T{id}]
            text = re.sub(
                rf'\[{re.escape(country)}\](?!-)',
                f'[{country}-T{topic_id}]',
                text
            )
        return text
    
    # Build combined syntheses text and collect metadata
    syntheses_text = []
    topics_used = []
    countries_set = set()
    topic_names_list = []
    
    for topic in topics_with_synthesis:
        synth_data = json.loads(topic.synthesis) if topic.synthesis else {}
        synth_text = synth_data.get("text", "")
        
        # Extract countries from country_summaries
        topic_countries = []
        for cs in synth_data.get("country_summaries", []):
            country = cs.get("country", "Unknown")
            countries_set.add(country)
            topic_countries.append(country)
        
        if synth_text:
            # Convert old citations to new format [Country-T{topic_id}-N]
            converted_text = convert_old_citations_to_new(synth_text, topic.id, topic_countries)
            
            syntheses_text.append(f"""
=== TOPIC #{topic.id}: {topic.name} (weight: {topic.weight}) ===
Citations format: [Country-T{topic.id}-N] e.g., [USA-T{topic.id}-1], [Germany-T{topic.id}-2]
{converted_text}
""")
            topics_used.append({
                "id": topic.id,
                "name": topic.name,
                "weight": topic.weight,
            })
            topic_names_list.append(f"{topic.name} (waga: {topic.weight})")
    
    combined_syntheses = "\n".join(syntheses_text)
    countries_str = ", ".join(sorted(countries_set)) if countries_set else "Various international sources"
    topic_names_str = "; ".join(topic_names_list)
    
    # Import evolution for report sections
    from app.services.evolution import evolve_report_section
    
    # Generate each section with AlphaEvolve
    sections = []
    evolution_stats = {}
    section_order = ["data_summary", "situation", "positive_12m", "negative_12m", "positive_36m", "negative_36m", "recommendations"]
    
    for section_type in section_order:
        async with timed_step(logger, f"Generowanie sekcji: {SECTION_TITLES[section_type]}"):
            # Build prompt with appropriate parameters
            if section_type == "data_summary":
                prompt = FINAL_REPORT_PROMPTS[section_type].format(
                    syntheses=combined_syntheses,
                    topic_count=len(topics_with_synthesis),
                    topic_names=topic_names_str,
                    countries=countries_str
                )
                max_tokens = 500  # Shorter for summary
            else:
                prompt = FINAL_REPORT_PROMPTS[section_type].format(syntheses=combined_syntheses)
                max_tokens = 2000
            
            try:
                # Step 1: Generate initial content
                initial_content = await call_gemini_with_prompt(
                    prompt, 
                    temperature=0.3, 
                    max_tokens=max_tokens,
                    model="synthesis"
                )
                
                # Step 2: AlphaEvolve - iterate 5 times to improve quality
                logger.substep(f"🧬 Evolving {section_type} (5 iterations)...")
                
                evolution_result = await evolve_report_section(
                    content=initial_content,
                    syntheses_context=combined_syntheses[:8000],  # Context for evolution
                    section_type=section_type,
                    logger=None
                )
                
                final_content = evolution_result.final_content
                
                # Track evolution stats with FULL HISTORY
                evolution_stats[section_type] = evolution_result.to_dict()  # Includes history!
                
                score_info = f"{evolution_result.initial_score:.0f}→{evolution_result.final_score:.0f}"
                if evolution_result.improvement > 0:
                    score_info += f" (+{evolution_result.improvement:.0f})"
                
                sections.append({
                    "type": section_type,
                    "title": SECTION_TITLES[section_type],
                    "content": final_content,
                    "sources": [],
                    "evolution": evolution_stats[section_type]  # Full history included
                })
                logger.success(f"{SECTION_TITLES[section_type]} - OK ({score_info})")
                
            except Exception as e:
                logger.warning(f"Błąd generowania {section_type}: {e}")
                sections.append({
                    "type": section_type,
                    "title": SECTION_TITLES[section_type],
                    "content": f"Błąd generowania sekcji: {str(e)[:100]}",
                    "sources": [],
                    "evolution": None
                })
        
        # Small delay between sections
        await asyncio.sleep(0.3)
    
    # Save report to session with evolution stats
    session.final_report = json.dumps({
        "sections": sections,
        "topics_used": topics_used,
        "evolution_stats": evolution_stats,
        "generated_at": datetime.utcnow().isoformat()
    }, ensure_ascii=False)
    db.commit()
    
    # Log overall evolution improvement
    total_improvement = sum(s.get("improvement", 0) for s in evolution_stats.values())
    avg_final = sum(s.get("final_score", 0) for s in evolution_stats.values()) / len(evolution_stats) if evolution_stats else 0
    
    logger.finish(f"Raport wygenerowany - {len(sections)} sekcji, avg score: {avg_final:.0f}/150, total improvement: +{total_improvement:.0f}")
    
    return {
        "sections": sections,
        "topics_used": topics_used,
        "generated_at": datetime.utcnow().isoformat()
    }


@router.get("/sessions/{session_id}/report")
async def get_final_report(session_id: int, db: Session = Depends(get_db)):
    """Get the final report for a session."""
    
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if not session.final_report:
        return {
            "has_report": False,
            "sections": [],
            "topics_used": [],
            "generated_at": None
        }
    
    report_data = json.loads(session.final_report)
    return {
        "has_report": True,
        **report_data
    }


@router.get("/sessions/{session_id}/sources")
async def get_session_sources(session_id: int, db: Session = Depends(get_db)):
    """
    Get all sources used in the session with GLOBALLY UNIQUE citations.
    Format: [Country-T{topic_id}-N] e.g., [USA-T5-1], [Germany-T3-2]
    
    Returns:
    - User-provided facts [USER-a], [USER-b], etc.
    - Country sources [Country-T#-N] grouped by topic
    - Flat list of all citations for quick lookup
    """
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # 1. User facts
    user_facts = session.get_user_facts()
    user_sources = [
        {
            "id": f"USER-{f['id']}",
            "citation": f"[USER-{f['id']}]",
            "type": "user_fact",
            "content": f["fact"],
            "weight": f["weight"],
            "url": None,
        }
        for f in user_facts
    ]
    
    # 2. Sources grouped by topic
    sources_by_topic = {}
    all_citations = {}  # Quick lookup: citation -> source data
    
    for topic in session.topics:
        if not topic.synthesis or not topic.selected:
            continue
        
        topic_tag = f"T{topic.id}"
        topic_sources = {
            "topic_id": topic.id,
            "topic_name": topic.name,
            "topic_citation": f"[{topic_tag}]",  # General topic reference
            "countries": {}
        }
        
        try:
            synthesis_data = json.loads(topic.synthesis)
            country_summaries = synthesis_data.get("country_summaries", [])
            
            for cs in country_summaries:
                country = cs.get("country", "Unknown")
                sources = cs.get("sources", [])
                
                if country not in topic_sources["countries"]:
                    topic_sources["countries"][country] = []
                
                for src in sources:
                    num = src.get("number", "?")
                    # New unique citation format
                    citation_id = f"{country}-{topic_tag}-{num}"
                    citation = f"[{citation_id}]"
                    
                    source_data = {
                        "id": citation_id,
                        "citation": citation,
                        "type": "country_source",
                        "country": country,
                        "topic_id": topic.id,
                        "topic_name": topic.name,
                        "title": src.get("title", "Untitled"),
                        "url": src.get("url"),
                        "domain": src.get("domain", ""),
                    }
                    
                    topic_sources["countries"][country].append(source_data)
                    all_citations[citation_id] = source_data
                
                # Also add general country-topic reference
                general_id = f"{country}-{topic_tag}"
                all_citations[general_id] = {
                    "id": general_id,
                    "citation": f"[{general_id}]",
                    "type": "topic_reference",
                    "country": country,
                    "topic_id": topic.id,
                    "topic_name": topic.name,
                    "title": f"All {country} sources for: {topic.name}",
                    "url": None,
                }
                    
        except Exception:
            continue
        
        if topic_sources["countries"]:
            sources_by_topic[topic.id] = topic_sources
    
    # Add user facts to all_citations
    for uf in user_sources:
        all_citations[uf["id"]] = uf
    
    return {
        "user_facts": user_sources,
        "sources_by_topic": sources_by_topic,
        "all_citations": all_citations,
        "total_sources": len(all_citations),
    }


class UpdateReportRequest(BaseModel):
    feedback: str = ""
    selected_topic_ids: list[int]


@router.post("/sessions/{session_id}/update-report")
async def update_report_incrementally(
    session_id: int,
    request: UpdateReportRequest,
    db: Session = Depends(get_db)
):
    """
    Update the report with modified topic selection.
    Only processes NEW topics that don't have syntheses yet.
    """
    from app.services.gemini import call_gemini_with_prompt
    from app.services.scraper import fetch_urls_for_topic
    from app.services.sources import generate_search_queries
    from app.services.article_processor import (
        process_topic_articles,
        generate_country_summaries,
        generate_topic_synthesis
    )
    
    logger = StepLogger(f"Aktualizacja raportu sesji #{session_id}")
    
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if not request.selected_topic_ids:
        raise HTTPException(status_code=400, detail="Wybierz co najmniej jeden temat")
    
    # Get Atlantis profile for synthesis context
    country_profile = json.loads(session.country_profile)
    
    # Get user-provided facts (ground truth)
    user_facts = session.get_user_facts()
    
    # Get all topics and categorize them
    all_topics = {t.id: t for t in session.topics}
    
    topics_to_process = []  # Need full processing
    topics_ready = []       # Already have synthesis
    
    for topic_id in request.selected_topic_ids:
        topic = all_topics.get(topic_id)
        if not topic:
            continue
        
        # Update selection status
        topic.selected = True
        
        if topic.synthesis:
            topics_ready.append(topic)
            logger.substep(f"Temat '{topic.name}' - gotowy (ma syntezę)")
        else:
            topics_to_process.append(topic)
            logger.substep(f"Temat '{topic.name}' - do przetworzenia")
    
    # Mark unselected topics
    for topic_id, topic in all_topics.items():
        if topic_id not in request.selected_topic_ids:
            topic.selected = False
    
    db.commit()
    
    # Process new topics (the ones without synthesis)
    new_topics_processed = 0
    for topic in topics_to_process:
        try:
            logger.substep(f"Przetwarzanie tematu: {topic.name}")
            
            # 1. Fetch URLs if not cached
            if not topic.has_cached_urls:
                logger.substep(f"  → Pobieranie URL...")
                keywords = json.loads(topic.keywords) if topic.keywords else []
                queries = await generate_search_queries(topic.name, keywords)
                urls_data = await fetch_urls_for_topic(queries, max_per_source=5)
                
                topic.fetched_urls = json.dumps(urls_data, ensure_ascii=False)
                topic.has_cached_urls = True
                topic.urls_cached_at = datetime.utcnow()
                db.commit()
            
            # 2. Process articles
            logger.substep(f"  → Streszczanie artykułów...")
            urls_data = json.loads(topic.fetched_urls) if topic.fetched_urls else {}
            summaries, by_source = await process_topic_articles(
                topic.id, urls_data, db, max_per_source=5, total_limit=50
            )
            
            # 3. Generate country summaries
            if by_source:
                logger.substep(f"  → Generowanie podsumowań krajów...")
                country_summaries = await generate_country_summaries(by_source)
                
                # 4. Generate synthesis
                logger.substep(f"  → Generowanie syntezy...")
                synthesis_result = await generate_topic_synthesis(
                    topic.name,
                    country_summaries,
                    user_facts=user_facts,  # Include ground truth facts
                    topic_id=topic.id,  # For unique citations [Country-T{id}-N]
                    country_profile=country_profile,  # Atlantis profile for context
                )
                
                topic.synthesis = json.dumps({
                    "text": synthesis_result.get("synthesis", ""),
                    "country_summaries": synthesis_result.get("country_summaries", []),
                    "user_facts_used": len(user_facts) if user_facts else 0,
                }, ensure_ascii=False)
                db.commit()
                new_topics_processed += 1
                logger.substep(f"  ✓ Temat '{topic.name}' przetworzony")
            else:
                logger.substep(f"  ⚠ Brak artykułów dla tematu '{topic.name}'")
                
        except Exception as e:
            logger.substep(f"  ✗ Błąd przetwarzania '{topic.name}': {e}")
            continue
    
    # Now generate the report with all selected topics that have synthesis
    topics_with_synthesis = [
        t for t in session.topics 
        if t.selected and t.synthesis
    ]
    
    if not topics_with_synthesis:
        raise HTTPException(
            status_code=400, 
            detail="Żaden z wybranych tematów nie ma syntezy"
        )
    
    logger.substep(f"Generowanie raportu z {len(topics_with_synthesis)} tematów...")
    
    # Build syntheses text
    syntheses_text = []
    topics_used = []
    
    for topic in topics_with_synthesis:
        synth_data = json.loads(topic.synthesis) if topic.synthesis else {}
        synth_text = synth_data.get("text", "")
        
        if synth_text:
            syntheses_text.append(f"""
=== TOPIC: {topic.name} (weight: {topic.weight}) ===
{synth_text}
""")
            topics_used.append({
                "id": topic.id,
                "name": topic.name,
                "weight": topic.weight
            })
    
    # Add feedback context if provided
    feedback_instruction = ""
    if request.feedback.strip():
        feedback_instruction = f"""

IMPORTANT USER FEEDBACK TO INCORPORATE:
{request.feedback}

Please adjust the report according to this feedback while maintaining factual accuracy and citations.
"""
    
    # Generate report with feedback
    country_profile = json.loads(session.country_profile)
    
    report_prompt = f"""You are a senior geopolitical analyst. Write a comprehensive report for Atlantis (fictional EU/NATO member state).
{feedback_instruction}
Country Profile:
{json.dumps(country_profile, indent=2, ensure_ascii=False)}

Current Situation:
{session.situation_description}

Topic Syntheses (use these as source material - PRESERVE ALL CITATIONS like [Germany-1], [USA-2], etc.):
{"".join(syntheses_text)}

Write exactly 6 sections in Polish. Each section should be 2-3 paragraphs.
CRITICAL: Include citations from the topic syntheses in your text (e.g., [Germany-1], [USA-2]).

Output as JSON:
{{
  "sections": [
    {{"type": "situation", "title": "Aktualna Sytuacja", "content": "..."}},
    {{"type": "positive_12m", "title": "Prognoza Pozytywna (12 miesięcy)", "content": "..."}},
    {{"type": "negative_12m", "title": "Prognoza Negatywna (12 miesięcy)", "content": "..."}},
    {{"type": "positive_36m", "title": "Prognoza Pozytywna (36 miesięcy)", "content": "..."}},
    {{"type": "negative_36m", "title": "Prognoza Negatywna (36 miesięcy)", "content": "..."}},
    {{"type": "recommendations", "title": "Rekomendacje dla Atlantis", "content": "..."}}
  ]
}}
"""
    
    response_text = await call_gemini_with_prompt(report_prompt, temperature=0.3, max_tokens=8000)
    
    # Parse JSON
    json_match = re.search(r'\{[\s\S]*\}', response_text)
    if not json_match:
        raise HTTPException(status_code=500, detail="Nie udało się wygenerować raportu")
    
    report_data = json.loads(json_match.group())
    sections = report_data.get("sections", [])
    
    # Save report
    session.final_report = json.dumps({
        "sections": sections,
        "topics_used": topics_used,
        "generated_at": datetime.utcnow().isoformat()
    }, ensure_ascii=False)
    db.commit()
    
    logger.finish(f"Raport zaktualizowany - {new_topics_processed} nowych tematów przetworzonych")
    
    return {
        "report": {
            "sections": sections,
            "topics_used": topics_used,
            "generated_at": datetime.utcnow().isoformat()
        },
        "new_topics_processed": new_topics_processed,
        "total_topics_in_report": len(topics_used)
    }


# ============================================================================
# EXPORT SESSION TO JSON FILES (for static frontend demo)
# ============================================================================

import os
from pathlib import Path

@router.post("/sessions/{session_id}/export")
async def export_session_to_json(session_id: int, db: Session = Depends(get_db)):
    """
    Export ALL session data to JSON files in frontend/public/mock-data/.
    This creates a complete snapshot that can be used for static frontend demo.
    """
    
    logger = StepLogger(f"Eksport sesji #{session_id} do JSON")
    
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Create mock-data directory
    # Go up from backend/app/routes to project root, then to frontend/public/mock-data
    project_root = Path(__file__).parent.parent.parent.parent
    mock_dir = project_root / "frontend" / "public" / "mock-data"
    mock_dir.mkdir(parents=True, exist_ok=True)
    
    exported_files = []
    
    # 1. Export sessions list
    logger.step("Eksport listy sesji")
    sessions_data = {
        "sessions": [],
        "recent_topics": []
    }
    
    # Get current session for the list
    session_list_item = {
        "id": session.id,
        "name": session.name or f"Sesja #{session.id}",
        "created_at": session.created_at.isoformat() if session.created_at else datetime.utcnow().isoformat(),
        "topics_count": len(session.topics),
        "selected_topics_count": len([t for t in session.topics if t.selected]),
        "has_scenarios": bool(session.scenarios),
        "scenarios_count": len(session.scenarios) if session.scenarios else 0,
        "recent_topics": [
            {
                "id": t.id,
                "name": t.name,
                "weight": t.weight,
                "selected": t.selected,
                "has_synthesis": bool(t.synthesis),
                "has_cached_urls": t.has_cached_urls,
            }
            for t in sorted(session.topics, key=lambda x: x.weight, reverse=True)[:5]
        ]
    }
    sessions_data["sessions"].append(session_list_item)
    
    # Recent topics for homepage
    for t in sorted(session.topics, key=lambda x: x.weight, reverse=True)[:10]:
        sessions_data["recent_topics"].append({
            "id": t.id,
            "name": t.name,
            "weight": t.weight,
            "selected": t.selected,
            "has_synthesis": bool(t.synthesis),
            "has_cached_urls": t.has_cached_urls,
            "session_id": session.id,
            "session_name": session.name or f"Sesja #{session.id}",
        })
    
    with open(mock_dir / "sessions.json", "w", encoding="utf-8") as f:
        json.dump(sessions_data, f, ensure_ascii=False, indent=2)
    exported_files.append("sessions.json")
    
    # 2. Export session details
    logger.step("Eksport szczegółów sesji")
    session_data = {
        "id": session.id,
        "name": session.name or f"Sesja #{session.id}",
        "country_profile": json.loads(session.country_profile) if session.country_profile else {},
        "situation_description": session.situation_description,
        "criteria": session.criteria,
        "user_facts": session.get_user_facts() if hasattr(session, 'get_user_facts') else [],
        "final_report": session.final_report,
        "topics": [
            {
                "id": t.id,
                "name": t.name,
                "keywords": json.loads(t.keywords) if t.keywords else [],
                "weight": t.weight,
                "rationale": t.rationale,
                "selected": t.selected,
                "has_cached_urls": t.has_cached_urls,
                "synthesis": t.synthesis,
                "situation_factor": t.situation_factor,
            }
            for t in session.topics
        ],
        "scenarios": [
            {
                "id": s.id,
                "timeframe": s.timeframe,
                "variant": s.variant,
                "content": s.content,
                "chain_of_thought": s.chain_of_thought,
            }
            for s in (session.scenarios or [])
        ],
    }
    
    with open(mock_dir / f"session-{session.id}.json", "w", encoding="utf-8") as f:
        json.dump(session_data, f, ensure_ascii=False, indent=2)
    exported_files.append(f"session-{session.id}.json")
    
    # 3. Export report if exists
    if session.final_report:
        logger.step("Eksport raportu")
        report_data = json.loads(session.final_report)
        report_data["has_report"] = True
        
        with open(mock_dir / f"session-{session.id}-report.json", "w", encoding="utf-8") as f:
            json.dump(report_data, f, ensure_ascii=False, indent=2)
        exported_files.append(f"session-{session.id}-report.json")
    
    # 4. Export sources
    logger.step("Eksport źródeł")
    user_facts = session.get_user_facts() if hasattr(session, 'get_user_facts') else []
    user_sources = [
        {
            "id": f"USER-{f['id']}",
            "citation": f"[USER-{f['id']}]",
            "type": "user_fact",
            "content": f["fact"],
            "weight": f["weight"],
            "url": None,
        }
        for f in user_facts
    ]
    
    sources_by_topic = {}
    all_citations = {}
    
    for topic in session.topics:
        if not topic.synthesis or not topic.selected:
            continue
        
        topic_tag = f"T{topic.id}"
        topic_sources = {
            "topic_id": topic.id,
            "topic_name": topic.name,
            "topic_citation": f"[{topic_tag}]",
            "countries": {}
        }
        
        try:
            synthesis_data = json.loads(topic.synthesis)
            country_summaries = synthesis_data.get("country_summaries", [])
            
            for cs in country_summaries:
                country = cs.get("country", "Unknown")
                sources = cs.get("sources", [])
                
                if country not in topic_sources["countries"]:
                    topic_sources["countries"][country] = []
                
                for src in sources:
                    num = src.get("number", "?")
                    citation_id = f"{country}-{topic_tag}-{num}"
                    citation = f"[{citation_id}]"
                    
                    source_data = {
                        "id": citation_id,
                        "citation": citation,
                        "type": "country_source",
                        "country": country,
                        "topic_id": topic.id,
                        "topic_name": topic.name,
                        "title": src.get("title", "Untitled"),
                        "url": src.get("url"),
                        "domain": src.get("domain", ""),
                    }
                    
                    topic_sources["countries"][country].append(source_data)
                    all_citations[citation_id] = source_data
        except Exception:
            continue
        
        if topic_sources["countries"]:
            sources_by_topic[topic.id] = topic_sources
    
    for uf in user_sources:
        all_citations[uf["id"]] = uf
    
    sources_data = {
        "user_facts": user_sources,
        "sources_by_topic": sources_by_topic,
        "all_citations": all_citations,
        "total_sources": len(all_citations),
    }
    
    with open(mock_dir / f"session-{session.id}-sources.json", "w", encoding="utf-8") as f:
        json.dump(sources_data, f, ensure_ascii=False, indent=2)
    exported_files.append(f"session-{session.id}-sources.json")
    
    # 5. Export each topic with all data
    logger.step("Eksport tematów")
    for topic in session.topics:
        topic_data = _serialize_topic(topic)
        
        # Add cached URLs if available
        if topic.cached_urls:
            topic_data["fetched_urls"] = topic.get_cached_urls()
        
        # Add cached sources if available
        if topic.cached_sources:
            topic_data["sources"] = topic.get_cached_sources()
        
        with open(mock_dir / f"topic-{topic.id}.json", "w", encoding="utf-8") as f:
            json.dump(topic_data, f, ensure_ascii=False, indent=2)
        exported_files.append(f"topic-{topic.id}.json")
        
        # Export synthesis separately
        if topic.synthesis:
            try:
                synthesis_data = json.loads(topic.synthesis)
                synthesis_data["has_synthesis"] = True
                
                with open(mock_dir / f"topic-{topic.id}-synthesis.json", "w", encoding="utf-8") as f:
                    json.dump(synthesis_data, f, ensure_ascii=False, indent=2)
                exported_files.append(f"topic-{topic.id}-synthesis.json")
            except Exception:
                pass
        
        # Export cached summaries from ArticleSummary table
        if topic.cached_urls:
            try:
                urls_data = topic.get_cached_urls()
                all_urls = urls_data.get("all_urls", [])
                
                by_source: dict = {}
                all_summaries = []
                
                for url_data in all_urls:
                    url = url_data.get("url", "")
                    if not url:
                        continue
                    
                    article = db.exec(
                        select(ArticleSummary).where(ArticleSummary.url == url)
                    ).first()
                    
                    if article and article.scrape_status == "success":
                        source = article.source_country or url_data.get("country") or "Unknown"
                        
                        summary_data = {
                            "id": article.id,
                            "url": article.url,
                            "domain": article.domain,
                            "title": article.title,
                            "source_country": source,
                            "summary": article.summary,
                            "key_facts": article.get_key_facts(),
                        }
                        
                        if source not in by_source:
                            by_source[source] = []
                        by_source[source].append(summary_data)
                        all_summaries.append(summary_data)
                
                if all_summaries:
                    summaries_data = {
                        "topic_id": topic.id,
                        "has_summaries": True,
                        "by_source": by_source,
                        "all_summaries": all_summaries,
                        "articles_processed": len(all_summaries),
                        "sources_count": len(by_source),
                    }
                    
                    with open(mock_dir / f"topic-{topic.id}-cached-summaries.json", "w", encoding="utf-8") as f:
                        json.dump(summaries_data, f, ensure_ascii=False, indent=2)
                    exported_files.append(f"topic-{topic.id}-cached-summaries.json")
            except Exception as e:
                print(f"Error exporting summaries for topic {topic.id}: {e}")
    
    # 6. Export progress endpoint mock (always returns not processing)
    progress_data = {
        "is_processing": False,
        "step": "done",
        "current": 0,
        "total": 0,
        "percent": 100,
        "message": "Ready",
        "sub_step": ""
    }
    with open(mock_dir / f"session-{session.id}-progress.json", "w", encoding="utf-8") as f:
        json.dump(progress_data, f, ensure_ascii=False, indent=2)
    exported_files.append(f"session-{session.id}-progress.json")
    
    logger.finish(f"Wyeksportowano {len(exported_files)} plików")
    
    return {
        "success": True,
        "session_id": session.id,
        "export_path": str(mock_dir),
        "files": exported_files,
        "files_count": len(exported_files),
    }
