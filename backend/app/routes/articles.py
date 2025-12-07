"""
Article processing routes - scraping and summarization.

Flow:
1. Fetch URLs
2. Process articles (scrape + summarize each)
3. Generate country summaries (one per country with [1][2] citations)
4. Generate topic synthesis
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_db
from app.models.analysis import Topic, ArticleSummary, AnalysisSession
from app.services.article_processor import (
    process_topic_articles, 
    generate_country_summary,
)
from app.utils.logger import StepLogger, timed_step

router = APIRouter()


@router.post("/topics/{topic_id}/process-articles")
async def process_articles_for_topic(
    topic_id: int,
    max_articles: int = 50,
    max_per_source: int = 5,
    force_refresh: bool = False,
    db: Session = Depends(get_db)
):
    """
    Scrape and summarize articles for a topic.
    COUNTRIES FIRST: 3-4 articles per country, then institutions.
    """
    
    logger = StepLogger(f"Processing articles for topic #{topic_id}")
    
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    if not topic.cached_urls:
        raise HTTPException(
            status_code=400, 
            detail="No URLs cached. Fetch URLs first."
        )
    
    urls_data = topic.get_cached_urls()
    
    async with timed_step(logger, "Processing articles"):
        articles, articles_by_source = await process_topic_articles(
            topic_id=topic_id,
            urls_data=urls_data,
            db=db,
            max_per_source=max_per_source,
            total_limit=max_articles
        )
    
    # Build response
    by_source_response = {}
    for source, source_articles in articles_by_source.items():
        by_source_response[source] = [
            {
                "id": a.id,
                "url": a.url,
                "domain": a.domain,
                "title": a.title,
                "source_country": a.source_country,
                "summary": a.summary,
                "key_facts": a.get_key_facts(),
                "status": a.scrape_status,
            }
            for a in source_articles
        ]
    
    logger.finish(f"Processed {len(articles)} articles")
    
    return {
        "topic_id": topic_id,
        "topic_name": topic.name,
        "articles_processed": len(articles),
        "sources_count": len(articles_by_source),
        "by_source": by_source_response,
        "all_summaries": [
            {
                "id": a.id,
                "url": a.url,
                "domain": a.domain,
                "title": a.title,
                "source_country": a.source_country,
                "summary": a.summary,
                "key_facts": a.get_key_facts(),
                "status": a.scrape_status,
            }
            for a in articles
        ]
    }


@router.get("/articles/{article_id}")
async def get_article(article_id: int, db: Session = Depends(get_db)):
    """Get a single article summary."""
    
    article = db.get(ArticleSummary, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    
    return {
        "id": article.id,
        "url": article.url,
        "domain": article.domain,
        "title": article.title,
        "source_country": article.source_country,
        "summary": article.summary,
        "key_facts": article.get_key_facts(),
        "raw_content": article.raw_content[:5000] if article.raw_content else "",
        "status": article.scrape_status,
    }


@router.get("/topics/{topic_id}/cached-summaries")
async def get_topic_cached_summaries(topic_id: int, db: Session = Depends(get_db)):
    """Get cached article summaries for a topic."""
    
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    if not topic.cached_urls:
        return {
            "topic_id": topic_id,
            "has_summaries": False,
            "by_source": {},
            "all_summaries": [],
            "articles_processed": 0,
            "sources_count": 0,
        }
    
    urls_data = topic.get_cached_urls()
    all_urls = urls_data.get("all_urls", [])
    
    by_source: dict[str, list] = {}
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
    
    return {
        "topic_id": topic_id,
        "topic_name": topic.name,
        "has_summaries": len(all_summaries) > 0,
        "by_source": by_source,
        "all_summaries": all_summaries,
        "articles_processed": len(all_summaries),
        "sources_count": len(by_source),
    }


# ============================================================================
# COUNTRY SUMMARIES - One per country with [1][2] citations
# ============================================================================

@router.post("/topics/{topic_id}/generate-country-summaries")
async def generate_country_summaries_endpoint(
    topic_id: int,
    force_refresh: bool = False,
    db: Session = Depends(get_db)
):
    """
    Generate country summaries - ONE summary per country with [1][2] citations.
    SAVES to database for later use in final synthesis.
    """
    import json
    import asyncio
    from datetime import datetime
    
    logger = StepLogger(f"Generating country summaries for topic #{topic_id}")
    
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    # Check cache
    if topic.synthesis and not force_refresh:
        synth_data = topic.get_synthesis_data()
        if synth_data and synth_data.get("country_summaries"):
            logger.finish("Returning cached country summaries")
            return {
                "topic_id": topic_id,
                "topic_name": topic.name,
                "country_summaries": synth_data["country_summaries"],
                "countries_count": len(synth_data["country_summaries"]),
                "cached": True,
            }
    
    if not topic.cached_urls:
        raise HTTPException(status_code=400, detail="No URLs cached. Fetch URLs first.")
    
    # Get articles by source
    urls_data = topic.get_cached_urls()
    all_urls = urls_data.get("all_urls", [])
    
    articles_by_source: dict[str, list[ArticleSummary]] = {}
    
    for url_data in all_urls:
        url = url_data.get("url", "")
        if not url:
            continue
        
        article = db.exec(
            select(ArticleSummary).where(ArticleSummary.url == url)
        ).first()
        
        if article and article.scrape_status == "success":
            source = article.source_country or url_data.get("country") or "Unknown"
            if source not in articles_by_source:
                articles_by_source[source] = []
            articles_by_source[source].append(article)
    
    if not articles_by_source:
        raise HTTPException(status_code=400, detail="No articles processed. Process articles first.")
    
    # Filter: minimum 2 articles per country for meaningful summary
    MIN_ARTICLES_PER_COUNTRY = 2
    filtered_sources = {
        country: articles 
        for country, articles in articles_by_source.items() 
        if len(articles) >= MIN_ARTICLES_PER_COUNTRY
    }
    
    # Log skipped countries
    skipped = [f"{c} ({len(a)})" for c, a in articles_by_source.items() if len(a) < MIN_ARTICLES_PER_COUNTRY]
    if skipped:
        logger.substep(f"Pominięto kraje z <{MIN_ARTICLES_PER_COUNTRY} artykułami: {', '.join(skipped)}")
    
    if not filtered_sources:
        raise HTTPException(
            status_code=400, 
            detail=f"Żaden kraj nie ma minimum {MIN_ARTICLES_PER_COUNTRY} artykułów. Pobierz więcej linków."
        )
    
    # Generate country summaries IN PARALLEL
    country_summaries = []
    countries_list = list(filtered_sources.items())
    BATCH_SIZE = 8  # Increased for faster processing
    
    async with timed_step(logger, f"Generating {len(countries_list)} country summaries in parallel (min {MIN_ARTICLES_PER_COUNTRY} articles)"):
        for batch_start in range(0, len(countries_list), BATCH_SIZE):
            batch = countries_list[batch_start:batch_start + BATCH_SIZE]
            batch_countries = [c[0] for c in batch]
            logger.substep(f"Batch: {', '.join(batch_countries)}")
            
            tasks = [
                generate_country_summary(country, topic.name, articles)
                for country, articles in batch
            ]
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for result in batch_results:
                if isinstance(result, Exception):
                    logger.warning(f"Error: {result}")
                else:
                    country_summaries.append(result)
            
            if batch_start + BATCH_SIZE < len(countries_list):
                await asyncio.sleep(0.3)
    
    # SAVE country summaries to topic (without final synthesis text)
    topic.synthesis = json.dumps({
        "text": "",  # Empty - will be filled by generate-synthesis
        "country_summaries": country_summaries,
    }, ensure_ascii=False)
    topic.synthesis_generated_at = datetime.utcnow()
    topic.articles_used_count = sum(len(arts) for arts in articles_by_source.values())
    db.commit()
    
    logger.finish(f"Saved {len(country_summaries)} country summaries")
    
    return {
        "topic_id": topic_id,
        "topic_name": topic.name,
        "country_summaries": country_summaries,
        "countries_count": len(country_summaries),
        "cached": False,
    }


@router.get("/topics/{topic_id}/country-summaries")
async def get_topic_country_summaries(topic_id: int, db: Session = Depends(get_db)):
    """Get cached country summaries from synthesis."""
    
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    if not topic.has_synthesis:
        return {
            "topic_id": topic_id,
            "has_country_summaries": False,
            "country_summaries": [],
        }
    
    synth_data = topic.get_synthesis_data()
    country_summaries = synth_data.get("country_summaries", []) if synth_data else []
    
    return {
        "topic_id": topic_id,
        "topic_name": topic.name,
        "has_country_summaries": len(country_summaries) > 0,
        "country_summaries": country_summaries,
    }


# ============================================================================
# SYNTHESIS - Final topic synthesis from existing country summaries
# ============================================================================

@router.post("/topics/{topic_id}/generate-synthesis")
async def generate_topic_synthesis_endpoint(
    topic_id: int,
    force_refresh: bool = False,
    db: Session = Depends(get_db)
):
    """
    Generate ONLY the final synthesis text from existing country summaries.
    Requires country summaries to be generated first.
    """
    import json
    from datetime import datetime
    from app.services.article_processor import generate_topic_synthesis as gen_synthesis
    
    logger = StepLogger(f"Generating final synthesis for topic #{topic_id}")
    
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    # Check if we have country summaries
    synth_data = topic.get_synthesis_data() if topic.synthesis else None
    
    if not synth_data or not synth_data.get("country_summaries"):
        raise HTTPException(
            status_code=400, 
            detail="No country summaries found. Generate country summaries first."
        )
    
    country_summaries = synth_data["country_summaries"]
    
    # Check cache - if we already have synthesis text
    if synth_data.get("text") and not force_refresh:
        logger.finish("Returning cached synthesis")
        return {
            "topic_id": topic_id,
            "topic_name": topic.name,
            "synthesis": synth_data["text"],
            "country_summaries": country_summaries,
            "generated_at": topic.synthesis_generated_at.isoformat() if topic.synthesis_generated_at else None,
            "articles_used": topic.articles_used_count,
            "cached": True,
            "evolution": synth_data.get("evolution"),  # Include cached evolution
        }
    
    # Generate final synthesis from country summaries
    async with timed_step(logger, f"Generating synthesis from {len(country_summaries)} countries"):
        result = await gen_synthesis(
            topic_name=topic.name,
            country_summaries=country_summaries,
        )
    
    # Save updated synthesis with text and evolution data
    topic.synthesis = json.dumps({
        "text": result["synthesis"],
        "country_summaries": country_summaries,
        "evolution": result.get("evolution"),  # Save evolution history
    }, ensure_ascii=False)
    topic.synthesis_generated_at = datetime.utcnow()
    db.commit()
    
    logger.finish("Generated synthesis")
    
    return {
        "topic_id": topic_id,
        "topic_name": topic.name,
        "synthesis": result["synthesis"],
        "country_summaries": country_summaries,
        "generated_at": topic.synthesis_generated_at.isoformat() if topic.synthesis_generated_at else None,
        "articles_used": topic.articles_used_count,
        "cached": False,
        "evolution": result.get("evolution"),  # Return evolution history
    }


@router.get("/topics/{topic_id}/synthesis")
async def get_topic_synthesis(topic_id: int, db: Session = Depends(get_db)):
    """Get cached synthesis for a topic."""
    
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    if not topic.has_synthesis:
        return {
            "topic_id": topic_id,
            "has_synthesis": False,
            "synthesis": None,
        }
    
    synth_data = topic.get_synthesis_data()
    
    return {
        "topic_id": topic_id,
        "topic_name": topic.name,
        "has_synthesis": True,
        "synthesis": synth_data.get("text", "") if synth_data else "",
        "country_summaries": synth_data.get("country_summaries", []) if synth_data else [],
        "generated_at": topic.synthesis_generated_at.isoformat() if topic.synthesis_generated_at else None,
        "articles_used": topic.articles_used_count,
        "evolution": synth_data.get("evolution") if synth_data else None,
    }


@router.get("/sessions/{session_id}/all-summaries")
async def get_session_article_summaries(session_id: int, db: Session = Depends(get_db)):
    """Get all article summaries for selected topics."""
    
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    selected_topics = [t for t in session.topics if t.selected]
    
    result = []
    for topic in selected_topics:
        if not topic.cached_urls:
            continue
        
        urls_data = topic.get_cached_urls()
        all_urls = urls_data.get("all_urls", [])
        
        by_source: dict[str, list] = {}
        for url_data in all_urls:
            url = url_data.get("url", "")
            if not url:
                continue
            
            article = db.exec(
                select(ArticleSummary).where(ArticleSummary.url == url)
            ).first()
            
            if article and article.scrape_status == "success":
                source = article.source_country or "Unknown"
                if source not in by_source:
                    by_source[source] = []
                by_source[source].append({
                    "id": article.id,
                    "url": article.url,
                    "title": article.title,
                    "summary": article.summary,
                })
        
        if by_source:
            result.append({
                "topic_id": topic.id,
                "topic_name": topic.name,
                "by_source": by_source,
                "total_articles": sum(len(s) for s in by_source.values()),
            })
    
    return {
        "session_id": session_id,
        "topics_with_summaries": result,
    }


@router.post("/sessions/{session_id}/process-all-articles")
async def process_all_session_articles(
    session_id: int,
    max_per_topic: int = 50,
    max_per_source: int = 5,
    db: Session = Depends(get_db)
):
    """Process articles for all selected topics (3-4 per country)."""
    
    logger = StepLogger(f"Processing articles for session #{session_id}")
    
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    selected_topics = [t for t in session.topics if t.selected]
    if not selected_topics:
        raise HTTPException(status_code=400, detail="No topics selected")
    
    logger.step(f"Processing {len(selected_topics)} topics")
    
    all_results = []
    for topic in selected_topics:
        if not topic.cached_urls:
            continue
        
        logger.substep(f"Topic: {topic.name[:40]}...")
        
        urls_data = topic.get_cached_urls()
        articles, articles_by_source = await process_topic_articles(
            topic_id=topic.id,
            urls_data=urls_data,
            db=db,
            max_per_source=max_per_source,
            total_limit=max_per_topic
        )
        
        all_results.append({
            "topic_id": topic.id,
            "topic_name": topic.name,
            "articles_count": len(articles),
            "sources": list(articles_by_source.keys()),
        })
    
    total = sum(r["articles_count"] for r in all_results)
    logger.finish(f"Processed {total} articles")
    
    return {
        "session_id": session_id,
        "topics_processed": len(all_results),
        "total_articles": total,
        "results": all_results,
    }


# ============================================================================
# RESET ENDPOINTS - Clear data at each step
# ============================================================================

@router.delete("/topics/{topic_id}/reset-urls")
async def reset_topic_urls(topic_id: int, db: Session = Depends(get_db)):
    """Reset/clear cached URLs for a topic."""
    
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    topic.cached_urls = None
    topic.urls_cached_at = None
    db.commit()
    
    return {"message": "URLs reset", "topic_id": topic_id}


@router.delete("/topics/{topic_id}/reset-summaries")
async def reset_topic_summaries(topic_id: int, db: Session = Depends(get_db)):
    """Reset/clear article summaries for a topic's URLs."""
    
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    if not topic.cached_urls:
        return {"message": "No URLs to reset summaries for", "topic_id": topic_id, "deleted": 0}
    
    urls_data = topic.get_cached_urls()
    all_urls = urls_data.get("all_urls", [])
    
    deleted_count = 0
    for url_data in all_urls:
        url = url_data.get("url", "")
        if not url:
            continue
        
        article = db.exec(
            select(ArticleSummary).where(ArticleSummary.url == url)
        ).first()
        
        if article:
            db.delete(article)
            deleted_count += 1
    
    db.commit()
    
    return {"message": "Article summaries reset", "topic_id": topic_id, "deleted": deleted_count}


@router.delete("/topics/{topic_id}/reset-countries")
async def reset_topic_countries(topic_id: int, db: Session = Depends(get_db)):
    """Reset/clear country summaries (but keep synthesis text if exists)."""
    import json
    
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    if topic.synthesis:
        synth_data = topic.get_synthesis_data()
        if synth_data:
            # Keep only synthesis text, clear country summaries
            topic.synthesis = json.dumps({
                "text": synth_data.get("text", ""),
                "country_summaries": [],
            }, ensure_ascii=False)
            db.commit()
    
    return {"message": "Country summaries reset", "topic_id": topic_id}


@router.delete("/topics/{topic_id}/reset-synthesis")
async def reset_topic_synthesis(topic_id: int, db: Session = Depends(get_db)):
    """Reset/clear final synthesis text (but keep country summaries if exist)."""
    import json
    
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    if topic.synthesis:
        synth_data = topic.get_synthesis_data()
        if synth_data:
            # Keep country summaries, clear synthesis text
            topic.synthesis = json.dumps({
                "text": "",
                "country_summaries": synth_data.get("country_summaries", []),
            }, ensure_ascii=False)
            db.commit()
    
    return {"message": "Synthesis reset", "topic_id": topic_id}


@router.delete("/topics/{topic_id}/reset-all")
async def reset_topic_all(topic_id: int, db: Session = Depends(get_db)):
    """Reset ALL data for a topic: URLs, summaries, countries, synthesis."""
    
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    # Delete article summaries
    deleted_articles = 0
    if topic.cached_urls:
        urls_data = topic.get_cached_urls()
        all_urls = urls_data.get("all_urls", [])
        
        for url_data in all_urls:
            url = url_data.get("url", "")
            if not url:
                continue
            
            article = db.exec(
                select(ArticleSummary).where(ArticleSummary.url == url)
            ).first()
            
            if article:
                db.delete(article)
                deleted_articles += 1
    
    # Clear topic data
    topic.cached_urls = None
    topic.urls_cached_at = None
    topic.synthesis = None
    topic.synthesis_generated_at = None
    topic.articles_used_count = 0
    
    db.commit()
    
    return {
        "message": "All data reset", 
        "topic_id": topic_id,
        "deleted_articles": deleted_articles,
    }
