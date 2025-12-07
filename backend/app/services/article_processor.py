"""
Article scraping and summarization service.

FLOW:
1. Scrape articles with Jina Reader
2. Summarize each article individually
3. Generate ONE country summary per country with [1][2] citations
4. Generate final topic synthesis

ZERO HALLUCINATION - only facts from articles.
"""

import hashlib
import asyncio
import json
from datetime import datetime
from typing import Optional
import httpx
from sqlmodel import Session, select

from app.models.analysis import ArticleSummary, Topic
from app.services.gemini import call_gemini_with_prompt
from app.utils.logger import StepLogger, timed_step


# ============================================================================
# PROMPTS - FACTS ONLY, NO VAGUE STATEMENTS
# ============================================================================

# Simple article summary prompt
ARTICLE_SUMMARY_PROMPT = """Summarize this article in MAX 2 SHORT paragraphs.
Source: {source_country} ({domain})

RULES:
1. MAX 2 PARAGRAPHS - be concise!
2. Only SPECIFIC facts: "$2.3B", "47%", "March 2025", "Intel", "CHIPS Act"
3. NO vague phrases: "significant", "growing", "improved"
4. If source is Russia/China, note it: "Russian sources report..." or "According to Chinese media..."

ARTICLE:
{article_content}

Write 2 paragraphs max with key facts:"""


# Country summary prompt - combines articles from one country
COUNTRY_SUMMARY_PROMPT = """Analyze {country_name} sources on: {topic_name}

ARTICLES:
{articles_text}

=== RULES ===
1. Write 2 not very long paragraphs (very concise!)
2. Every fact needs [{country_name}-N] citation
3. Specific data: "$2.3B", "47%", "March 2025"
4. If Russia/China: prefix with "Russian sources report..."

Write 3-5 sentences:"""


# Final topic synthesis with user facts and contradiction detection
TOPIC_SYNTHESIS_PROMPT = """Synthesize: {topic_name}

=== ATLANTIS PROFILE (the country we're analyzing FOR) ===
{atlantis_profile}

{user_facts_section}

=== SOURCES ({country_count} countries) ===
{country_analyses}

=== RULES ===
1. Write 4-5 SHORT paragraphs (3-4 sentences each, not walls of text!)
2. Every fact needs [Country-N] citation
3. Russia/China: prefix with "Russian sources claim..."
4. Contradictions: note with "⚠️ [A] vs [B]"
5. Focus on implications FOR ATLANTIS based on its profile above

Write 4-5 concise paragraphs from Atlantis perspective:"""


# Key facts extraction
EXTRACT_FACTS_PROMPT = """Extract 5-8 key facts from this summary. Be specific with numbers.

Summary:
{summary}

Return JSON array:
["Fact 1 with specific details", "Fact 2", ...]"""


# ============================================================================
# CONFIGURATION
# ============================================================================
PARALLEL_BATCH_SIZE = 10  # Increased for faster processing
PARALLEL_DELAY = 0.3


# ============================================================================
# SCRAPING
# ============================================================================

async def scrape_article_jina(url: str) -> tuple[str, str]:
    """Scrape article using Jina Reader API."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"https://r.jina.ai/{url}",
                headers={
                    "Accept": "text/markdown",
                    "X-Return-Format": "markdown",
                }
            )
            
            if response.status_code == 200:
                content = response.text
                title = ""
                for line in content.split("\n")[:10]:
                    if line.startswith("# "):
                        title = line[2:].strip()
                        break
                
                # Check for blocked/useless content
                content_lower = content.lower()
                content_len = len(content.strip())
                
                # If content is long enough (>2000 chars), it's probably real content
                # even if there's cookie notice at the bottom - that's OK
                if content_len >= 2000:
                    pass  # Good, real content
                else:
                    # Short content - check if it's just cookie/paywall page
                    blocked_patterns = [
                        "cookie", "cookies", "gdpr", "consent",
                        "subscribe", "subscription", "paywall", "sign in to read",
                        "access denied", "403 forbidden", "401 unauthorized",
                        "captcha", "verify you are human", "robot",
                        "javascript is required", "enable javascript",
                        "this content is not available", "content unavailable",
                        "please enable cookies", "accept cookies",
                        "login required", "create an account",
                    ]
                    
                    blocked_count = sum(1 for p in blocked_patterns if p in content_lower)
                    
                    # Short content + many blocked patterns = blocked page
                    if content_len < 500:
                        print(f"[SCRAPER] Content too short for {url} ({content_len} chars)")
                        return "", ""
                    
                    # Medium content (500-2000) but mostly blocked patterns
                    if blocked_count >= 4 and content_len < 1500:
                        print(f"[SCRAPER] Blocked page detected for {url} ({blocked_count} patterns, {content_len} chars)")
                        return "", ""
                
                if len(content) > 20000:
                    content = content[:20000] + "\n\n[Content truncated...]"
                
                return content, title
            return "", ""
                
    except Exception as e:
        print(f"Jina scrape error for {url}: {e}")
        return "", ""


# ============================================================================
# SUMMARIZATION
# ============================================================================

async def summarize_article(
    content: str,
    source_country: str = "Unknown",
    domain: str = "Unknown",
) -> str:
    """Summarize a single article."""
    if not content or len(content) < 100:
        return "Article content unavailable or too short."
    
    if len(content) > 15000:
        content = content[:15000] + "\n\n[Truncated...]"
    
    prompt = ARTICLE_SUMMARY_PROMPT.format(
        article_content=content,
        source_country=source_country or "Unknown",
        domain=domain or "Unknown",
    )
    
    try:
        summary = await call_gemini_with_prompt(prompt, temperature=0.1, max_tokens=800)  # Shorter
        return summary
    except Exception as e:
        print(f"Summarization error: {e}")
        return f"Summarization failed: {str(e)[:100]}"


async def extract_key_facts(summary: str) -> list[str]:
    """Extract key facts from summary."""
    if not summary or len(summary) < 50 or "failed" in summary.lower():
        return []
    
    prompt = EXTRACT_FACTS_PROMPT.format(summary=summary)
    
    try:
        response = await call_gemini_with_prompt(prompt, temperature=0.1)
        response = response.strip()
        if response.startswith("```"):
            response = response.split("```")[1]
            if response.startswith("json"):
                response = response[4:]
        response = response.strip()
        
        facts = json.loads(response)
        if isinstance(facts, list):
            return [str(f) for f in facts[:10]]
    except Exception as e:
        print(f"Fact extraction error: {e}")
    
    return []


# ============================================================================
# COUNTRY SUMMARY
# ============================================================================

async def generate_country_summary(
    country_name: str,
    topic_name: str,
    articles: list[ArticleSummary],
    use_evolution: bool = True,
) -> dict:
    """
    Generate ONE summary for a country from all its articles.
    
    Returns:
    {
        "country": "USA",
        "summary": "Text with [USA-1] citations...",
        "sources": [...],
        "evolution": {...}
    }
    """
    if not articles:
        return {"country": country_name, "summary": "", "sources": [], "evolution": None}
    
    # Filter valid articles
    valid_articles = [a for a in articles if a.scrape_status == "success" and a.summary and "failed" not in a.summary.lower()]
    
    if not valid_articles:
        return {"country": country_name, "summary": "No valid articles.", "sources": [], "evolution": None}
    
    # Build articles text with [Country-N] format
    sources = []
    articles_text = []
    
    for i, article in enumerate(valid_articles):
        num = i + 1
        citation_ref = f"{country_name}-{num}"
        sources.append({
            "number": num,
            "citation": citation_ref,
            "url": article.url,
            "title": article.title or article.domain,
            "domain": article.domain,
        })
        articles_text.append(f"""
---
[{citation_ref}] {article.title or article.domain}
URL: {article.url}

{article.summary}
---
""")
    
    articles_context = "\n".join(articles_text)
    
    prompt = COUNTRY_SUMMARY_PROMPT.format(
        country_name=country_name,
        topic_name=topic_name,
        article_count=len(valid_articles),
        articles_text=articles_context,
    )
    
    try:
        # Generate initial summary
        summary = await call_gemini_with_prompt(prompt, temperature=0.2, max_tokens=800)
        print(f"[SUMMARY] {country_name}: Initial summary {len(summary)} chars", flush=True)
        
        evolution_data = None
        
        # Evolve if we have enough articles
        if use_evolution and len(valid_articles) >= 2:
            from app.services.evolution import evolve_country_summary
            print(f"[EVOLUTION] 🧬 Evolving country summary for {country_name}...")
            
            evolution_result = await evolve_country_summary(
                summary=summary,
                articles_context=articles_context,
                logger=None
            )
            
            summary = evolution_result.final_content
            evolution_data = evolution_result.to_dict()
            
            print(f"[EVOLUTION] ✓ {country_name}: {evolution_result.initial_score:.0f} → {evolution_result.final_score:.0f} (+{evolution_result.improvement:.0f})")
            print(f"[SUMMARY] {country_name}: Final summary {len(summary)} chars", flush=True)
        
        return {
            "country": country_name,
            "summary": summary,
            "sources": sources,
            "evolution": evolution_data,
        }
    except Exception as e:
        print(f"Country summary error for {country_name}: {e}")
        return {
            "country": country_name,
            "summary": f"Summary generation failed: {str(e)[:100]}",
            "sources": sources,
            "evolution": None,
        }


# ============================================================================
# TOPIC SYNTHESIS (from country summaries)
# ============================================================================

async def generate_topic_synthesis(
    topic_name: str,
    country_summaries: list[dict],
    use_evolution: bool = True,
    user_facts: list[dict] = None,  # Ground truth facts from user
    topic_id: int = None,  # Topic ID for unique citations
    country_profile: dict = None,  # Atlantis profile for context
) -> dict:
    """
    Generate final synthesis from country summaries and user-provided facts.
    
    AlphaEvolve-inspired: If use_evolution=True, iteratively improves
    the synthesis through 3 iterations with evaluation + mutation.
    
    Args:
        topic_name: Name of the topic
        country_summaries: List of country analysis dicts
        use_evolution: Whether to use AlphaEvolve improvement
        user_facts: List of user-provided ground truth facts [{id, fact, weight}]
        topic_id: Topic ID for globally unique citations [Country-T{id}-N]
        country_profile: Atlantis profile for contextual synthesis
    
    Returns:
    {
        "synthesis": "Text with [USER-a], [USA-T5-1], [China-T5-1] citations...",
        "country_summaries": [...country summary dicts...],
        "evolution": {"initial_score": X, "final_score": Y, ...}
    }
    """
    if not country_summaries:
        return {"synthesis": "No country analyses available.", "country_summaries": [], "evolution": None}
    
    # Build user facts section
    user_facts_section = ""
    if user_facts:
        lines = ["=== USER-PROVIDED FACTS (Ground Truth - 100% confidence) ==="]
        for f in user_facts:
            lines.append(f"[USER-{f['id']}] {f['fact']} (weight: {f['weight']})")
        user_facts_section = "\n".join(lines)
    else:
        user_facts_section = "=== No user-provided facts ==="
    
    # Build country analyses text - summaries already have [Country-N] format
    valid_summaries = [cs for cs in country_summaries if cs.get("summary") and "failed" not in cs.get("summary", "").lower()]
    
    if not valid_summaries:
        return {"synthesis": "No valid analyses.", "country_summaries": country_summaries, "evolution": None}
    
    country_analyses = []
    for cs in valid_summaries:
        country = cs["country"]
        summary = cs["summary"]
        
        # Summary already has [Country-N] format from generate_country_summary
        # Just pass it through
        
        country_analyses.append(f"""
=== {country} ===
{summary}
""")
    
    country_context = "\n".join(country_analyses)
    
    # Format Atlantis profile for prompt
    import json
    atlantis_profile_text = "Not provided" if not country_profile else json.dumps(country_profile, ensure_ascii=False, indent=2)
    
    prompt = TOPIC_SYNTHESIS_PROMPT.format(
        topic_name=topic_name,
        atlantis_profile=atlantis_profile_text,
        user_facts_section=user_facts_section,
        country_count=len(valid_summaries),
        country_analyses=country_context,
    )
    
    try:
        # Generate initial synthesis
        synthesis = await call_gemini_with_prompt(prompt, temperature=0.2, max_tokens=1500, model="synthesis")
        
        evolution_data = None
        
        # Evolve if we have enough summaries
        if use_evolution and len(valid_summaries) >= 2:
            from app.services.evolution import evolve_topic_synthesis
            print(f"[EVOLUTION] 🧬 Evolving topic synthesis for '{topic_name}'...")
            
            evolution_result = await evolve_topic_synthesis(
                synthesis=synthesis,
                country_summaries_context=country_context,
                logger=None
            )
            
            synthesis = evolution_result.final_content
            evolution_data = evolution_result.to_dict()
            
            print(f"[EVOLUTION] ✓ Topic synthesis: {evolution_result.initial_score:.0f} → {evolution_result.final_score:.0f} (+{evolution_result.improvement:.0f})")
        
        return {
            "synthesis": synthesis,
            "country_summaries": country_summaries,
            "evolution": evolution_data,
        }
    except Exception as e:
        print(f"Synthesis error: {e}")
        return {
            "synthesis": f"Synthesis failed: {str(e)[:100]}",
            "country_summaries": country_summaries,
            "evolution": None,
        }


# ============================================================================
# SINGLE ARTICLE PROCESSING
# ============================================================================

async def process_single_article_standalone(
    url: str,
    source_country: str,
    source_type: str,
) -> dict:
    """Process a single article - returns dict for parallel processing."""
    result = {
        "url": url,
        "source_country": source_country,
        "source_type": source_type,
        "title": "",
        "content": "",
        "summary": "",
        "key_facts": [],
        "status": "pending",
        "error": "",
    }
    
    try:
        content, title = await scrape_article_jina(url)
        
        if not content:
            result["status"] = "failed"
            result["error"] = "Failed to fetch content"
            return result
        
        result["content"] = content
        result["title"] = title or (url.split("/")[2] if "/" in url else url)
        
        domain = url.split("/")[2] if "/" in url else url
        summary = await summarize_article(
            content=content,
            source_country=source_country,
            domain=domain,
        )
        result["summary"] = summary
        
        facts = await extract_key_facts(summary)
        result["key_facts"] = facts
        
        result["status"] = "success"
        
    except Exception as e:
        result["status"] = "failed"
        result["error"] = str(e)[:200]
    
    return result


async def process_single_article(
    url: str,
    db: Session,
    source_id: str = "0",
    source_country: str = "",
    source_type: str = "",
    force_refresh: bool = False
) -> Optional[ArticleSummary]:
    """Process a single article with database caching."""
    
    if not force_refresh:
        existing = db.exec(
            select(ArticleSummary).where(ArticleSummary.url == url)
        ).first()
        
        if existing and existing.scrape_status == "success":
            return existing
    
    result = await process_single_article_standalone(
        url=url,
        source_country=source_country,
        source_type=source_type,
    )
    
    article = db.exec(
        select(ArticleSummary).where(ArticleSummary.url == url)
    ).first()
    
    domain = url.split("/")[2] if "/" in url else url
    
    if not article:
        article = ArticleSummary(
            url=url,
            domain=domain,
        )
        db.add(article)
    
    article.title = result["title"]
    article.raw_content = result["content"]
    article.summary = result["summary"]
    article.set_key_facts(result["key_facts"])
    article.source_country = source_country
    article.source_type = source_type
    article.scrape_status = result["status"]
    article.scrape_error = result.get("error", "")
    article.scraped_at = datetime.utcnow()
    
    if result["status"] == "success":
        article.summarized_at = datetime.utcnow()
        if result["content"]:
            article.content_hash = hashlib.md5(result["content"].encode()).hexdigest()
    
    db.commit()
    
    return article


# ============================================================================
# BATCH PROCESSING
# ============================================================================

def select_diverse_articles(
    urls: list[dict],
    max_per_source: int = 5,
    total_limit: int = 50
) -> list[dict]:
    """
    Select diverse articles - PRIORITIZE countries first (3-4 each), then institutions.
    New strategy: fill countries first, then institutions.
    """
    
    # Separate countries from institutions
    by_country: dict[str, list[dict]] = {}
    by_institution: dict[str, list[dict]] = {}
    
    for u in urls:
        country = u.get("country")
        institution = u.get("institution")
        
        if country:
            if country not in by_country:
                by_country[country] = []
            by_country[country].append(u)
        elif institution:
            if institution not in by_institution:
                by_institution[institution] = []
            by_institution[institution].append(u)
    
    # Priority order for countries
    country_priority = [
        "USA", "China", "Germany", "UK", "France",
        "Russia", "India", "Saudi Arabia",
    ]
    
    # Sort countries by priority
    sorted_countries = []
    for c in country_priority:
        if c in by_country:
            sorted_countries.append(c)
    for c in by_country:
        if c not in sorted_countries:
            sorted_countries.append(c)
    
    selected = []
    
    # PHASE 1: Take up to 6 articles from EACH COUNTRY first
    for country in sorted_countries:
        articles = by_country.get(country, [])
        for article in articles[:max_per_source]:
            article["_source"] = country
            selected.append(article)
    
    # PHASE 2: Add institutions if we have room
    institution_priority = ["OECD", "NATO", "European Commission", "UN", "CSIS", "Chatham House", "Atlantic Council", "ECFR"]
    sorted_institutions = []
    for inst in institution_priority:
        if inst in by_institution:
            sorted_institutions.append(inst)
    for inst in by_institution:
        if inst not in sorted_institutions:
            sorted_institutions.append(inst)
    
    for inst in sorted_institutions:
        if len(selected) >= total_limit:
            break
        articles = by_institution.get(inst, [])
        for article in articles[:max_per_source]:
            if len(selected) >= total_limit:
                break
            article["_source"] = inst
            selected.append(article)
    
    return selected


async def process_topic_articles(
    topic_id: int,
    urls_data: dict,
    db: Session,
    max_per_source: int = 4,
    total_limit: int = 30
) -> tuple[list[ArticleSummary], dict[str, list[ArticleSummary]]]:
    """Process articles for a topic with PARALLEL processing (3-4 per country)."""
    
    logger = StepLogger(f"Processing articles for topic #{topic_id}")
    
    all_urls = urls_data.get("all_urls", [])
    
    if not all_urls:
        logger.warning("No URLs to process")
        logger.finish("No URLs")
        return [], {}
    
    async with timed_step(logger, f"Selecting articles from {len(all_urls)} URLs"):
        selected = select_diverse_articles(all_urls, max_per_source, total_limit)
        sources = set(u.get('_source', 'unknown') for u in selected)
        logger.substep(f"Selected {len(selected)} articles from {len(sources)} sources")
    
    # Check cache
    to_process = []
    cached_items = []
    
    for url_data in selected:
        url = url_data.get("url", "")
        if not url or url_data.get("is_search_url"):
            continue
        
        cached = db.exec(
            select(ArticleSummary).where(ArticleSummary.url == url)
        ).first()
        
        if cached and cached.scrape_status == "success":
            cached_items.append({"url_data": url_data, "cached": cached})
        else:
            to_process.append({"url_data": url_data})
    
    logger.substep(f"Cache: {len(cached_items)} hits, {len(to_process)} to process")
    
    # Process in parallel batches
    processed_results = []
    
    if to_process:
        async with timed_step(logger, f"Processing {len(to_process)} articles in parallel"):
            
            for batch_start in range(0, len(to_process), PARALLEL_BATCH_SIZE):
                batch = to_process[batch_start:batch_start + PARALLEL_BATCH_SIZE]
                batch_num = batch_start // PARALLEL_BATCH_SIZE + 1
                total_batches = (len(to_process) + PARALLEL_BATCH_SIZE - 1) // PARALLEL_BATCH_SIZE
                
                logger.substep(f"Batch {batch_num}/{total_batches}...")
                
                tasks = []
                for item in batch:
                    url_data = item["url_data"]
                    tasks.append(
                        process_single_article_standalone(
                            url=url_data.get("url", ""),
                            source_country=url_data.get("country", url_data.get("_source", "")),
                            source_type=url_data.get("source_type", ""),
                        )
                    )
                
                batch_results = await asyncio.gather(*tasks, return_exceptions=True)
                
                for item, result in zip(batch, batch_results):
                    if isinstance(result, Exception):
                        logger.warning(f"Error: {result}")
                        continue
                    processed_results.append({"url_data": item["url_data"], "result": result})
                
                if batch_start + PARALLEL_BATCH_SIZE < len(to_process):
                    await asyncio.sleep(PARALLEL_DELAY)
    
    # Save to database
    async with timed_step(logger, "Saving to database"):
        for item in processed_results:
            result = item["result"]
            url = result["url"]
            
            article = db.exec(
                select(ArticleSummary).where(ArticleSummary.url == url)
            ).first()
            
            if not article:
                article = ArticleSummary(
                    url=url,
                    domain=url.split("/")[2] if "/" in url else url,
                )
                db.add(article)
            
            article.title = result["title"]
            article.raw_content = result["content"]
            article.summary = result["summary"]
            article.set_key_facts(result["key_facts"])
            article.source_country = result["source_country"]
            article.source_type = result["source_type"]
            article.scrape_status = result["status"]
            article.scrape_error = result.get("error", "")
            article.scraped_at = datetime.utcnow()
            article.summarized_at = datetime.utcnow() if result["status"] == "success" else None
            
            if result["content"]:
                article.content_hash = hashlib.md5(result["content"].encode()).hexdigest()
        
        db.commit()
    
    # Collect all results
    results: list[ArticleSummary] = []
    results_by_source: dict[str, list[ArticleSummary]] = {}
    
    for item in cached_items:
        article = item["cached"]
        source = item["url_data"].get("_source", "Unknown")
        results.append(article)
        if source not in results_by_source:
            results_by_source[source] = []
        results_by_source[source].append(article)
    
    for item in processed_results:
        result = item["result"]
        if result["status"] != "success":
            continue
        
        article = db.exec(
            select(ArticleSummary).where(ArticleSummary.url == result["url"])
        ).first()
        
        if article:
            source = item["url_data"].get("_source", "Unknown")
            results.append(article)
            if source not in results_by_source:
                results_by_source[source] = []
            results_by_source[source].append(article)
    
    logger.finish(f"Done: {len(results)} articles from {len(results_by_source)} sources")
    
    return results, results_by_source


# ============================================================================
# FULL SYNTHESIS PIPELINE - PARALLEL PROCESSING
# ============================================================================

COUNTRY_BATCH_SIZE = 10  # Big batches


async def _generate_country_summary_wrapper(
    country: str, 
    articles: list[ArticleSummary], 
    topic_name: str,
    use_evolution: bool = True
) -> dict:
    """Wrapper for parallel country summary generation with AlphaEvolve."""
    try:
        return await generate_country_summary(
            country_name=country,
            topic_name=topic_name,
            articles=articles,
            use_evolution=use_evolution,
        )
    except Exception as e:
        print(f"[SYNTHESIS] Error for {country}: {e}")
        return {
            "country": country,
            "summary": f"Error generating summary: {str(e)[:100]}",
            "sources": [],
            "evolution": None,
        }


async def generate_full_topic_synthesis(
    topic: Topic,
    articles_by_source: dict[str, list[ArticleSummary]],
    db: Session,
    use_evolution: bool = True,
    user_facts: list[dict] = None  # Ground truth facts from user
) -> dict:
    """
    Full pipeline with PARALLEL processing + AlphaEvolve evolution:
    1. Generate country summaries in parallel batches (with evolution)
    2. Generate topic synthesis from country summaries (with evolution)
    
    Includes user-provided ground truth facts in synthesis.
    
    Returns evolution stats for all steps.
    """
    
    logger = StepLogger(f"Generating full synthesis for topic #{topic.id}")
    
    # Filter: minimum 2 articles per country for meaningful summary
    MIN_ARTICLES = 2
    filtered_sources = {
        country: articles 
        for country, articles in articles_by_source.items() 
        if len(articles) >= MIN_ARTICLES
    }
    
    skipped = [f"{c}({len(a)})" for c, a in articles_by_source.items() if len(a) < MIN_ARTICLES]
    if skipped:
        logger.substep(f"Skipped countries with <{MIN_ARTICLES} articles: {', '.join(skipped)}")
    
    # Collect evolution stats
    evolution_stats = {
        "country_summaries": {},
        "topic_synthesis": None,
        "total_improvement": 0
    }
    
    # Step 1: Generate country summaries IN PARALLEL (with evolution)
    country_summaries = []
    countries_list = list(filtered_sources.items())
    
    step_name = f"Generating {len(countries_list)} country summaries (min {MIN_ARTICLES} articles)"
    if use_evolution:
        step_name += " + 🧬 AlphaEvolve"
    
    async with timed_step(logger, step_name):
        
        for batch_start in range(0, len(countries_list), COUNTRY_BATCH_SIZE):
            batch = countries_list[batch_start:batch_start + COUNTRY_BATCH_SIZE]
            batch_num = batch_start // COUNTRY_BATCH_SIZE + 1
            total_batches = (len(countries_list) + COUNTRY_BATCH_SIZE - 1) // COUNTRY_BATCH_SIZE
            
            batch_countries = [c[0] for c in batch]
            logger.substep(f"Batch {batch_num}/{total_batches}: {', '.join(batch_countries)}")
            
            # Create parallel tasks for this batch
            tasks = [
                _generate_country_summary_wrapper(country, articles, topic.name, use_evolution)
                for country, articles in batch
            ]
            
            # Execute in parallel
            batch_results = await asyncio.gather(*tasks)
            country_summaries.extend(batch_results)
            
            # Collect evolution stats from each country
            for cs in batch_results:
                if cs.get("evolution"):
                    country = cs["country"]
                    evolution_stats["country_summaries"][country] = cs["evolution"]
                    evolution_stats["total_improvement"] += cs["evolution"].get("improvement", 0)
            
            # Delay between batches for rate limiting
            if batch_start + COUNTRY_BATCH_SIZE < len(countries_list):
                await asyncio.sleep(0.5)
    
    # Step 2: Generate final synthesis (with evolution)
    step_name = "Generating final synthesis"
    if use_evolution:
        step_name += " + 🧬 AlphaEvolve"
    
    async with timed_step(logger, step_name):
        result = await generate_topic_synthesis(
            topic_name=topic.name,
            country_summaries=country_summaries,
            use_evolution=use_evolution,
            user_facts=user_facts,
            topic_id=topic.id,  # For unique citations [Country-T{id}-N]
        )
    
    # Collect topic synthesis evolution stats
    if result.get("evolution"):
        evolution_stats["topic_synthesis"] = result["evolution"]
        evolution_stats["total_improvement"] += result["evolution"].get("improvement", 0)
    
    # Save synthesis with evolution info
    topic.synthesis = json.dumps({
        "text": result["synthesis"],
        "country_summaries": result["country_summaries"],
        "evolution": evolution_stats,
    }, ensure_ascii=False)
    topic.synthesis_generated_at = datetime.utcnow()
    topic.articles_used_count = sum(len(articles) for articles in articles_by_source.values())
    db.commit()
    
    logger.finish(f"Generated synthesis with {len(country_summaries)} country analyses (🧬 +{evolution_stats['total_improvement']:.0f} total improvement)")
    
    result["evolution"] = evolution_stats
    return result
