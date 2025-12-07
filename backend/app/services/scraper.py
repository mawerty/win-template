"""
Web scraper for fetching real URLs from search engines.
Uses Serper API (free tier) for actual Google search results.
PARALLEL processing for speed.
"""

import asyncio
from urllib.parse import quote_plus, urlparse
import httpx
from app.config import settings


# Parallel config
PARALLEL_BATCH_SIZE = 10  # Increased for faster processing
PARALLEL_DELAY = 0.1


async def search_serper(query: str, num_results: int = 5) -> list[dict]:
    """
    Search using Serper API (Google Search API).
    Free tier: 2,500 queries/month.
    Get API key at: https://serper.dev
    """
    if not settings.serper_api_key:
        return []
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://google.serper.dev/search",
                headers={
                    "X-API-KEY": settings.serper_api_key,
                    "Content-Type": "application/json"
                },
                json={
                    "q": query,
                    "num": num_results,
                },
                timeout=15.0
            )
            
            if response.status_code != 200:
                print(f"Serper API error: {response.status_code}")
                return []
            
            data = response.json()
            results = []
            
            for item in data.get("organic", [])[:num_results]:
                results.append({
                    "url": item.get("link", ""),
                    "title": item.get("title", ""),
                    "snippet": item.get("snippet", ""),
                    "domain": urlparse(item.get("link", "")).netloc,
                })
            
            return results
            
    except Exception as e:
        print(f"Serper search error: {e}")
        return []


def generate_search_url(query: str, engine: str = "google") -> str:
    """Generate a search URL for a given query (fallback)."""
    encoded = quote_plus(query)
    
    if engine == "google":
        return f"https://www.google.com/search?q={encoded}"
    elif engine == "duckduckgo":
        return f"https://duckduckgo.com/?q={encoded}"
    elif engine == "bing":
        return f"https://www.bing.com/search?q={encoded}"
    else:
        return f"https://www.google.com/search?q={encoded}"


async def _fetch_single_query(query: dict, source_type: str) -> list[dict]:
    """Fetch URLs for a single query - used for parallel execution."""
    search_query = query["search_query"]
    
    if source_type == "ministry":
        country = query["country"]
        category = query.get("category", "")
        
        search_results = await search_serper(search_query, num_results=5)
        
        return [
            {
                "url": sr["url"],
                "title": sr["title"],
                "snippet": sr["snippet"],
                "domain": sr["domain"],
                "source_type": "ministry",
                "country": country,
                "category": category,
                "keyword": query["keyword"],
                "search_query": search_query,
            }
            for sr in search_results
        ]
    else:
        inst = query["institution"]
        
        search_results = await search_serper(search_query, num_results=5)
        
        return [
            {
                "url": sr["url"],
                "title": sr["title"],
                "snippet": sr["snippet"],
                "domain": sr["domain"],
                "source_type": "institution",
                "institution": inst,
                "keyword": query["keyword"],
                "search_query": search_query,
            }
            for sr in search_results
        ]


async def fetch_urls_for_topic(topic_sources: dict, max_per_source: int = 5) -> dict:
    """
    Fetch real URLs for all queries in a topic using Serper API.
    PARALLEL processing for speed.
    Falls back to search URLs if API not configured.
    """
    results = {
        "by_country": {},
        "by_institution": {},
        "all_urls": [],
        "stats": {
            "total_urls": 0,
            "countries": 0,
            "institutions": 0,
        }
    }
    
    has_serper = bool(settings.serper_api_key)
    
    if not has_serper:
        # Fallback: generate search URLs (no API calls needed)
        return _generate_fallback_urls(topic_sources, max_per_source)
    
    # Collect all queries for parallel execution
    all_queries = []
    
    # Ministry queries
    country_queries = {}
    for query in topic_sources.get("ministries", []):
        country = query["country"]
        if country not in country_queries:
            country_queries[country] = []
        country_queries[country].append(query)
    
    for country, queries in country_queries.items():
        for query in queries[:max_per_source]:
            all_queries.append({"query": query, "type": "ministry", "country": country})
    
    # Institution queries
    inst_queries = {}
    for query in topic_sources.get("institutions", []):
        inst = query["institution"]
        if inst not in inst_queries:
            inst_queries[inst] = []
        inst_queries[inst].append(query)
    
    for inst, queries in inst_queries.items():
        for query in queries[:max_per_source]:
            all_queries.append({"query": query, "type": "institution", "institution": inst})
    
    # Process in PARALLEL batches
    print(f"[SCRAPER] Fetching {len(all_queries)} queries in parallel batches...")
    
    for batch_start in range(0, len(all_queries), PARALLEL_BATCH_SIZE):
        batch = all_queries[batch_start:batch_start + PARALLEL_BATCH_SIZE]
        
        # Create tasks for parallel execution
        tasks = [
            _fetch_single_query(item["query"], item["type"])
            for item in batch
        ]
        
        # Execute batch in parallel
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        for item, url_results in zip(batch, batch_results):
            if isinstance(url_results, Exception):
                print(f"[SCRAPER] Error: {url_results}")
                continue
            
            if item["type"] == "ministry":
                country = item["country"]
                if country not in results["by_country"]:
                    results["by_country"][country] = []
                results["by_country"][country].extend(url_results)
                results["all_urls"].extend(url_results)
            else:
                inst = item["institution"]
                if inst not in results["by_institution"]:
                    results["by_institution"][inst] = []
                results["by_institution"][inst].extend(url_results)
                results["all_urls"].extend(url_results)
        
        # Small delay between batches
        if batch_start + PARALLEL_BATCH_SIZE < len(all_queries):
            await asyncio.sleep(PARALLEL_DELAY)
    
    # Update stats
    results["stats"]["total_urls"] = len(results["all_urls"])
    results["stats"]["countries"] = len([c for c, urls in results["by_country"].items() if urls])
    results["stats"]["institutions"] = len([i for i, urls in results["by_institution"].items() if urls])
    
    print(f"[SCRAPER] Done: {results['stats']['total_urls']} URLs from {results['stats']['countries']} countries + {results['stats']['institutions']} institutions")
    
    return results


def _generate_fallback_urls(topic_sources: dict, max_per_source: int) -> dict:
    """Generate search URLs when Serper API is not available."""
    results = {
        "by_country": {},
        "by_institution": {},
        "all_urls": [],
        "stats": {"total_urls": 0, "countries": 0, "institutions": 0}
    }
    
    # Ministry queries
    country_queries = {}
    for query in topic_sources.get("ministries", []):
        country = query["country"]
        if country not in country_queries:
            country_queries[country] = []
        country_queries[country].append(query)
    
    for country, queries in country_queries.items():
        results["by_country"][country] = []
        for query in queries[:max_per_source]:
            url_entry = {
                "url": generate_search_url(query["search_query"], "google"),
                "title": f"Szukaj: {query['keyword']}",
                "snippet": f"Kliknij aby wyszukać na {query['domain']}",
                "domain": query["domain"],
                "source_type": "ministry",
                "country": country,
                "category": query.get("category", ""),
                "keyword": query["keyword"],
                "search_query": query["search_query"],
                "is_search_url": True,
            }
            results["by_country"][country].append(url_entry)
            results["all_urls"].append(url_entry)
    
    # Institution queries
    inst_queries = {}
    for query in topic_sources.get("institutions", []):
        inst = query["institution"]
        if inst not in inst_queries:
            inst_queries[inst] = []
        inst_queries[inst].append(query)
    
    for inst, queries in inst_queries.items():
        results["by_institution"][inst] = []
        for query in queries[:max_per_source]:
            url_entry = {
                "url": generate_search_url(query["search_query"], "google"),
                "title": f"Szukaj: {query['keyword']}",
                "snippet": f"Kliknij aby wyszukać na {query['domain']}",
                "domain": query["domain"],
                "source_type": "institution",
                "institution": inst,
                "keyword": query["keyword"],
                "search_query": query["search_query"],
                "is_search_url": True,
            }
            results["by_institution"][inst].append(url_entry)
            results["all_urls"].append(url_entry)
    
    results["stats"]["total_urls"] = len(results["all_urls"])
    results["stats"]["countries"] = len([c for c, urls in results["by_country"].items() if urls])
    results["stats"]["institutions"] = len([i for i, urls in results["by_institution"].items() if urls])
    
    return results


async def fetch_urls_for_all_topics(topics_with_sources: list[dict], max_per_topic: int = 50) -> list[dict]:
    """
    Fetch real URLs for multiple topics.
    Adds 'fetched_urls' field to each topic.
    """
    enriched_topics = []
    
    for topic in topics_with_sources:
        fetched = await fetch_urls_for_topic(topic.get("sources", {}), max_per_source=5)
        
        if len(fetched["all_urls"]) > max_per_topic:
            fetched["all_urls"] = fetched["all_urls"][:max_per_topic]
        
        enriched_topic = {
            **topic,
            "fetched_urls": fetched,
        }
        enriched_topics.append(enriched_topic)
    
    return enriched_topics
