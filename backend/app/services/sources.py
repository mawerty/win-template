"""
Source URLs generator for research topics.
Generates Google search queries for ministry and institution websites.
Uses LLM to intelligently match topics to relevant sources.
"""

import json
import httpx
from app.config import settings

# Ministry domains by country
MINISTRY_DOMAINS = {
    "Germany": {
        "foreign": "auswaertiges-amt.de",
        "defense": "bmvg.de",
        "interior": "bmi.bund.de",
        "economy": "bmwk.de",
        "energy": "bmwk.de",
        "climate": "bmuv.de",
        "education": "bmbf.de",
        "digital": "digitalstrategie.de",
    },
    "France": {
        "foreign": "diplomatie.gouv.fr",
        "defense": "defense.gouv.fr",
        "interior": "interieur.gouv.fr",
        "economy": "economie.gouv.fr",
        "energy": "ecologie.gouv.fr",
        "climate": "ecologie.gouv.fr",
        "education": "enseignementsup-recherche.gouv.fr",
        "digital": "numerique.gouv.fr",
    },
    "UK": {
        "foreign": "gov.uk/government/organisations/foreign-commonwealth-development-office",
        "defense": "gov.uk/government/organisations/ministry-of-defence",
        "interior": "gov.uk/government/organisations/home-office",
        "economy": "gov.uk/government/organisations/hm-treasury",
        "energy": "gov.uk/government/organisations/department-for-energy-security-and-net-zero",
        "climate": "gov.uk/government/organisations/department-for-energy-security-and-net-zero",
        "education": "gov.uk/government/organisations/department-for-education",
        "digital": "gov.uk/government/organisations/department-for-science-innovation-and-technology",
    },
    "USA": {
        "foreign": "state.gov",
        "defense": "defense.gov",
        "interior": "dhs.gov",
        "economy": "commerce.gov",
        "trade": "ustr.gov",
        "energy": "energy.gov",
        "climate": "epa.gov",
        "education": "ed.gov",
    },
    "Russia": {
        "foreign": "mid.ru",
        "defense": "mil.ru",
        "economy": "economy.gov.ru",
        "energy": "minenergo.gov.ru",
    },
    "China": {
        "foreign": "mfa.gov.cn",
        "defense": "mod.gov.cn",
        "economy": "mofcom.gov.cn",
        "energy": "nea.gov.cn",
    },
    "India": {
        "foreign": "mea.gov.in",
        "defense": "mod.gov.in",
        "economy": "commerce.gov.in",
        "energy": "mopng.gov.in",
    },
    "Saudi Arabia": {
        "foreign": "mofa.gov.sa",
        "economy": "mci.gov.sa",
        "energy": "moenergy.gov.sa",
    },
}

# All available ministry categories
ALL_CATEGORIES = ["foreign", "defense", "interior", "economy", "trade", "energy", "climate", "education", "digital"]

# International institutions
INSTITUTIONS = {
    "European Commission": "ec.europa.eu",
    "NATO": "nato.int",
    "United Nations": "un.org",
    "OECD": "oecd.org",
    "Gulf Cooperation Council": "gcc-sg.org",
    "IISS": "iiss.org",
    "CSIS": "csis.org",
    "Chatham House": "chathamhouse.org",
    "ECFR": "ecfr.eu",
    "Atlantic Council": "atlanticcouncil.org",
    "Kiel Institute": "ifw-kiel.de",
    "NASDAQ": "nasdaq.com",
    "London Stock Exchange": "lseg.com",
    "Japan Exchange Group": "jpx.co.jp",
}

# All institution names
ALL_INSTITUTIONS = list(INSTITUTIONS.keys())


def get_gemini_url():
    return f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"


async def get_relevant_sources_llm(topic_name: str, keywords: list[str]) -> dict:
    """
    Use LLM to determine which ministry categories and institutions are most relevant for a topic.
    Returns dict with 'categories', 'institutions', and 'countries'.
    """
    
    prompt = f"""Jesteś analitykiem geopolitycznym. Dla podanego tematu badawczego określ, które źródła informacji będą najbardziej przydatne.

TEMAT: {topic_name}
SŁOWA KLUCZOWE: {', '.join(keywords)}

DOSTĘPNE KATEGORIE MINISTERSTW:
- foreign: ministerstwa spraw zagranicznych
- defense: ministerstwa obrony
- interior: ministerstwa spraw wewnętrznych
- economy: ministerstwa gospodarki
- trade: ministerstwa handlu
- energy: ministerstwa energii
- climate: ministerstwa klimatu
- education: ministerstwa szkolnictwa wyższego/nauki
- digital: ministerstwa cyfryzacji/nowych technologii

DOSTĘPNE KRAJE: Germany, France, UK, USA, Russia, China, India, Saudi Arabia

DOSTĘPNE INSTYTUCJE MIĘDZYNARODOWE:
European Commission, NATO, United Nations, OECD, Gulf Cooperation Council, IISS, CSIS, Chatham House, ECFR, Atlantic Council, Kiel Institute, NASDAQ, London Stock Exchange, Japan Exchange Group

Wybierz:
1. 3-5 najbardziej odpowiednie kategorie ministerstw
2. 5-8 krajów (wszystkie które mogą mieć związek z tematem)
3. 4-8 instytucji międzynarodowych (dobierz szeroko)

Odpowiedz TYLKO w formacie JSON (bez markdown):
{{
  "categories": ["category1", "category2"],
  "countries": ["Country1", "Country2", "Country3"],
  "institutions": ["Institution1", "Institution2", "Institution3"],
  "reasoning": "Krótkie wyjaśnienie dlaczego te źródła są najbardziej odpowiednie"
}}"""

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                get_gemini_url(),
                params={"key": settings.gemini_api_key},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.3,
                        "maxOutputTokens": 1024,
                    }
                },
                timeout=30.0
            )
            
            if response.status_code != 200:
                raise Exception(f"Gemini API error: {response.text}")
            
            result = response.json()
            text = result["candidates"][0]["content"]["parts"][0]["text"]
            
            # Parse JSON from response
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]
            
            text = text.strip()
            parsed = json.loads(text)
            
            # Validate and filter to only valid values
            valid_categories = [c for c in parsed.get("categories", []) if c in ALL_CATEGORIES]
            valid_countries = [c for c in parsed.get("countries", []) if c in MINISTRY_DOMAINS]
            valid_institutions = [i for i in parsed.get("institutions", []) if i in ALL_INSTITUTIONS]
            
            return {
                "categories": valid_categories or ["economy", "foreign", "defense"],
                "countries": valid_countries or ["Germany", "France", "USA", "UK", "China"],
                "institutions": valid_institutions or ["European Commission", "OECD", "NATO", "CSIS"],
                "reasoning": parsed.get("reasoning", "")
            }
            
    except Exception as e:
        print(f"LLM source selection error: {e}")
        # Fallback to broad categories
        return {
            "categories": ["economy", "foreign", "defense", "energy"],
            "countries": ["Germany", "France", "USA", "UK", "China", "Russia"],
            "institutions": ["European Commission", "NATO", "OECD", "CSIS", "Chatham House", "Atlantic Council"],
            "reasoning": "Domyślne źródła (fallback)"
        }


def get_relevant_sources_fallback(topic_name: str, keywords: list[str]) -> dict:
    """
    Fallback method using keyword matching when LLM is not available.
    """
    topic_lower = topic_name.lower() + " " + " ".join(keywords).lower()
    
    categories = set()
    countries = set(["Germany", "France", "USA", "UK", "China"])  # Default countries - 5 at minimum
    institutions = set(["European Commission", "OECD", "NATO", "CSIS"])
    
    # Simple keyword matching
    keyword_mapping = {
        "energy": (["energy", "climate"], ["Saudi Arabia"], ["OECD"]),
        "defense": (["defense", "foreign"], ["USA", "UK"], ["NATO", "IISS", "CSIS"]),
        "economy": (["economy", "trade"], ["Germany", "China"], ["OECD", "Kiel Institute"]),
        "digital": (["digital", "education"], ["USA", "UK"], ["European Commission"]),
        "climate": (["climate", "energy"], ["Germany", "France"], ["European Commission", "United Nations"]),
    }
    
    triggers = {
        "gpu": "digital", "semiconductor": "digital", "chip": "digital", "ai": "digital",
        "oil": "energy", "gas": "energy", "renewable": "energy", "oze": "energy",
        "military": "defense", "nato": "defense", "security": "defense", "cyber": "defense",
        "trade": "economy", "gdp": "economy", "investment": "economy", "automotive": "economy",
        "ukraine": "defense", "russia": "defense",
    }
    
    for trigger, category in triggers.items():
        if trigger in topic_lower:
            cats, ctrs, insts = keyword_mapping.get(category, (["economy"], [], []))
            categories.update(cats)
            countries.update(ctrs)
            institutions.update(insts)
    
    if not categories:
        categories = {"economy", "foreign", "defense"}
    
    return {
        "categories": list(categories)[:5],
        "countries": list(countries)[:8],
        "institutions": list(institutions)[:8],
        "reasoning": "Dopasowanie na podstawie słów kluczowych"
    }


async def generate_search_queries(topic_name: str, keywords: list[str], use_llm: bool = True) -> dict:
    """
    Generate Google search queries for a topic.
    Returns dict with ministry and institution queries.
    """
    
    # Get relevant sources (LLM or fallback)
    if use_llm and settings.gemini_api_key:
        source_selection = await get_relevant_sources_llm(topic_name, keywords)
    else:
        source_selection = get_relevant_sources_fallback(topic_name, keywords)
    
    categories = source_selection["categories"]
    selected_countries = source_selection["countries"]
    selected_institutions = source_selection["institutions"]
    reasoning = source_selection["reasoning"]
    
    queries = {
        "ministries": [],
        "institutions": [],
        "selection_reasoning": reasoning,
    }
    
    # Generate ministry queries only for selected countries and categories
    # Use ALL keywords to maximize URL diversity
    for country in selected_countries:
        if country not in MINISTRY_DOMAINS:
            continue
        ministries = MINISTRY_DOMAINS[country]
        
        for category in categories:
            if category not in ministries:
                continue
            domain = ministries[category]
            
            for keyword in keywords:  # ALL keywords - more diversity
                query = {
                    "country": country,
                    "category": category,
                    "domain": domain,
                    "keyword": keyword,
                    "search_query": f'{keyword} site:{domain}',
                    "google_url": f'https://www.google.com/search?q={keyword}+site:{domain}',
                }
                queries["ministries"].append(query)
    
    # Generate institution queries only for selected institutions
    for inst_name in selected_institutions:
        if inst_name not in INSTITUTIONS:
            continue
        domain = INSTITUTIONS[inst_name]
        
        for keyword in keywords:  # ALL keywords - more diversity
            query = {
                "institution": inst_name,
                "domain": domain,
                "keyword": keyword,
                "search_query": f'{keyword} site:{domain}',
                "google_url": f'https://www.google.com/search?q={keyword}+site:{domain}',
            }
            queries["institutions"].append(query)
    
    return queries


async def generate_all_topic_sources(topics: list[dict], use_llm: bool = True) -> list[dict]:
    """
    Generate source queries for all topics.
    Returns topics with added 'sources' field.
    """
    enriched_topics = []
    
    for topic in topics:
        sources = await generate_search_queries(topic["name"], topic["keywords"], use_llm=use_llm)
        enriched_topic = {
            **topic,
            "sources": sources,
            "sources_count": {
                "ministries": len(sources["ministries"]),
                "institutions": len(sources["institutions"]),
                "total": len(sources["ministries"]) + len(sources["institutions"]),
            }
        }
        enriched_topics.append(enriched_topic)
    
    return enriched_topics
