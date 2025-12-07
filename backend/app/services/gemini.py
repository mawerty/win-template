import json
import httpx
from app.config import settings


def get_gemini_url(model: str = None):
    model = model or settings.gemini_model
    return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


async def call_gemini_with_prompt(
    prompt: str, 
    temperature: float = 0.7, 
    max_tokens: int = 4096,
    model: str = None
) -> str:
    """Call Gemini API. No retries - fails fast."""
    if model == "synthesis":
        actual_model = settings.gemini_model_synthesis
    else:
        actual_model = model or settings.gemini_model
    
    url = get_gemini_url(actual_model)
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            url,
            params={"key": settings.gemini_api_key},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": temperature,
                    "maxOutputTokens": max_tokens,
                    "thinkingConfig": {"thinkingBudget": 0}
                }
            },
            timeout=120.0
        )
        
        if response.status_code != 200:
            raise Exception(f"Gemini API error {response.status_code}: {response.text[:300]}")
        
        result = response.json()
        
        if "candidates" not in result or not result["candidates"]:
            raise Exception(f"No candidates: {json.dumps(result)[:500]}")
        
        candidate = result["candidates"][0]
        
        if "content" not in candidate:
            raise Exception(f"No content, finishReason: {candidate.get('finishReason', 'unknown')}")
        
        parts = candidate["content"].get("parts", [])
        if not parts:
            raise Exception(f"No parts: {json.dumps(candidate)[:300]}")
        
        text = parts[0].get("text", "")
        if not text:
            raise Exception("Empty text")
        
        return text


async def parse_user_facts(situation_description: str) -> list[dict]:
    """
    Parse situation_description to extract structured user facts with weights.
    These are ground truth assumptions provided by the user.
    
    Returns: [
        {"id": "a", "fact": "GPU shortage 60%...", "weight": 30},
        {"id": "b", "fact": "EU automotive profits...", "weight": 15},
        ...
    ]
    """
    import re
    
    prompt = f"""Extract the key facts from this situation description. Each fact has a weight (waga istotności).

SITUATION DESCRIPTION:
{situation_description}

Extract each fact as a structured item. Return ONLY JSON array:
[
  {{"id": "a", "fact": "Brief summary of fact a in English", "weight": 30}},
  {{"id": "b", "fact": "Brief summary of fact b in English", "weight": 15}},
  ...
]

RULES:
- Keep facts concise (1-2 sentences max)
- Use English for fact text
- Preserve the original weight (waga istotności) 
- Include specific numbers (percentages, years, values)
- ID should be lowercase letter (a, b, c, d, e, f...)

Return ONLY the JSON array, no other text."""

    try:
        text = await call_gemini_with_prompt(prompt, temperature=0.1, max_tokens=2000)
        
        # Clean response
        text = text.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]
        
        facts = json.loads(text.strip())
        
        # Validate structure
        valid_facts = []
        for f in facts:
            if "id" in f and "fact" in f and "weight" in f:
                valid_facts.append({
                    "id": str(f["id"]).lower(),
                    "fact": str(f["fact"]),
                    "weight": int(f["weight"])
                })
        
        print(f"[USER FACTS] Parsed {len(valid_facts)} facts from situation description", flush=True)
        return valid_facts
        
    except Exception as e:
        print(f"[USER FACTS] Parse error: {e}", flush=True)
        # Fallback: try regex parsing
        return _parse_facts_regex(situation_description)


def _parse_facts_regex(text: str) -> list[dict]:
    """Fallback regex parser for user facts."""
    import re
    
    facts = []
    # Pattern: a) ... (waga istotności: 30)
    pattern = r'([a-z])\)\s*(.+?)\s*\(waga\s*(?:istotności)?[:\s]*(\d+)\)'
    
    matches = re.findall(pattern, text, re.IGNORECASE | re.DOTALL)
    
    for match in matches:
        letter, fact_text, weight = match
        # Clean fact text
        fact_text = ' '.join(fact_text.split())[:300]  # Limit length
        facts.append({
            "id": letter.lower(),
            "fact": fact_text,
            "weight": int(weight)
        })
    
    print(f"[USER FACTS] Regex fallback: parsed {len(facts)} facts", flush=True)
    return facts


async def generate_topics(country_profile: dict, situation: str) -> list[dict]:
    """Generate 5-10 specific research topics with keywords and weights based on input."""
    
    prompt = f"""Jesteś starszym analitykiem geopolitycznym MSZ. Ambasador przekazał ci dane o państwie Atlantis 
i opis aktualnej sytuacji międzynarodowej. Na podstawie TYCH KONKRETNYCH danych wygeneruj 7-8 PRECYZYJNYCH 
tematów badawczych, które są BEZPOŚREDNIO związane z podanymi informacjami.

PROFIL PAŃSTWA ATLANTIS:
{json.dumps(country_profile, ensure_ascii=False, indent=2)}

OPIS SYTUACJI MIĘDZYNARODOWEJ (z wagami):
{situation}

INSTRUKCJE:
1. Przeanalizuj KONKRETNE problemy i wyzwania wymienione w opisie sytuacji
2. Wygeneruj 7-8 tematów badawczych, które BEZPOŚREDNIO odnoszą się do podanych zagadnień
3. Każdy temat powinien mieć WAGĘ (1-100) odzwierciedlającą jego znaczenie dla Atlantis
4. Wagi powinny być zgodne z priorytetami podanymi w opisie sytuacji
5. Suma wag nie musi być równa 100

Dla każdego tematu podaj:
- "name": Konkretna, specyficzna nazwa tematu po polsku (max 80 znaków)
- "keywords": 4-5 słów kluczowych do wyszukiwania (po angielsku)
- "weight": Waga tematu od 1 do 100 (większa = ważniejsze dla Atlantis)
- "rationale": Krótkie uzasadnienie dlaczego ten temat (1 zdanie)

Odpowiedz TYLKO w formacie JSON (bez markdown):
{{
  "topics": [
    {{
      "name": "Konkretny temat powiązany z opisem sytuacji",
      "keywords": ["keyword1", "keyword2", "keyword3", "keyword4"],
      "weight": 85,
      "rationale": "Bezpośrednio odnosi się do wyzwania X z opisu sytuacji"
    }}
  ]
}}

WAŻNE:
- Tematy muszą być SPECYFICZNE (nie "handel międzynarodowy" ale "Wpływ embarga na chipy na eksport elektroniki Atlantis")
- Nawiązuj do KONKRETNYCH elementów z opisu sytuacji ambasadora
- Wagi powinny odzwierciedlać priorytety z opisu (jeśli coś ma wagę 30, temat o tym powinien mieć wysoką wagę)
- Generuj TYLKO 7-8 tematów, nie więcej"""

    text = await call_gemini_with_prompt(prompt, temperature=0.7, max_tokens=4096)
    
    # Parse JSON from response (handle markdown code blocks)
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]
    
    text = text.strip()
    return json.loads(text)["topics"]


async def generate_scenarios(
    country_profile: dict, 
    situation: str, 
    selected_topics: list[dict],
    topic_syntheses: list[dict] = None,
    use_evolution: bool = True,
    user_facts: list[dict] = None,  # Ground truth facts from user
) -> dict:
    """
    Generate 4 scenarios based on selected topics with their weights.
    
    AlphaEvolve-inspired: If use_evolution=True, each scenario goes through
    3 iterations of evaluation + mutation to improve quality.
    
    Returns:
    {
        "scenarios": [...],
        "evolution_stats": {
            "12_months_positive": {"initial": X, "final": Y, ...},
            ...
        }
    }
    """
    
    # Sort by weight (descending) and format with weights
    sorted_topics = sorted(selected_topics, key=lambda t: t.get('weight', 50), reverse=True)
    topics_text = "\n".join([
        f"- [WAGA: {t.get('weight', 50)}] {t['name']}: {', '.join(t['keywords'])}" 
        for t in sorted_topics
    ])
    
    # Build user facts section
    user_facts_section = ""
    if user_facts:
        lines = ["=== FAKTY BAZOWE OD UŻYTKOWNIKA (Ground Truth - 100% pewności) ==="]
        for f in user_facts:
            lines.append(f"[USER-{f['id']}] {f['fact']} (waga: {f['weight']})")
        user_facts_section = "\n".join(lines)
    
    # Build context from topic syntheses for evolution
    syntheses_context = ""
    if topic_syntheses:
        syntheses_context = "\n\n".join([
            f"=== {ts.get('topic_name', 'Topic')} ===\n{ts.get('synthesis', '')[:2000]}"
            for ts in topic_syntheses
        ])
    
    # Build syntheses section with citations
    syntheses_section = ""
    if topic_syntheses:
        lines = ["=== SYNTEZY TEMATÓW (z cytowaniami) ==="]
        for ts in topic_syntheses:
            topic_name = ts.get('topic_name', 'Topic')
            topic_id = ts.get('topic_id', 0)
            synthesis = ts.get('synthesis', '')[:2500]
            lines.append(f"\n--- Topic #{topic_id}: {topic_name} ---\n{synthesis}")
        syntheses_section = "\n".join(lines)
    
    prompt = f"""Jesteś starszym analitykiem MSZ. Przygotuj raport dla ambasadora państwa Atlantis przy UE.

PROFIL PAŃSTWA ATLANTIS:
{json.dumps(country_profile, ensure_ascii=False, indent=2)}

{user_facts_section}

OPIS AKTUALNEJ SYTUACJI MIĘDZYNARODOWEJ:
{situation}

WYBRANE TEMATY DO ANALIZY:
{topics_text}

{syntheses_section}

Wygeneruj 4 scenariusze rozwoju sytuacji międzynarodowej z perspektywy interesów państwa Atlantis:
1. Perspektywa 12 miesięcy - wariant POZYTYWNY dla Atlantis
2. Perspektywa 12 miesięcy - wariant NEGATYWNY dla Atlantis
3. Perspektywa 36 miesięcy - wariant POZYTYWNY dla Atlantis  
4. Perspektywa 36 miesięcy - wariant NEGATYWNY dla Atlantis

Dla każdego scenariusza podaj:
- "content": Szczegółowy opis przewidywanego rozwoju sytuacji (400-500 słów). KAŻDE twierdzenie musi mieć cytowanie!
- "chain_of_thought": Wyjaśnienie logiki analitycznej (200-300 słów) z cytowaniami.
- "reasoning_steps": STRUKTURALNA ścieżka wnioskowania jako tablica kroków. Każdy krok pokazuje: fakt źródłowy → wniosek → wpływ na scenariusz.

KRYTYCZNE - CYTOWANIA W CONTENT (używaj DOKŁADNIE tych formatów):
- [USER-X] dla faktów bazowych od użytkownika (np. [USER-a], [USER-b])
- [Country-T#-N] dla konkretnych źródeł z syntez (np. [USA-T5-1], [Germany-T3-2])
- [Country-T#] dla ogólnego odwołania do całego tematu (np. [USA-T5], [Germany-T3])
- KAŻDE twierdzenie musi mieć minimum jedno cytowanie
- Przykład: "Due to GPU shortage [USER-a], the AI sector will... According to German data [Germany-T3-1], EV sales..."

WAŻNE dla reasoning_steps - każdy krok musi mieć:
- "fact": konkretny fakt z cytowaniem [USER-X] lub [Country-T#-N]
- "source_weight": waga źródłowa tego faktu (1-100)
- "inference": wniosek wyciągnięty z tego faktu
- "impact": jak wpływa na scenariusz ("positive"/"negative"/"neutral")
- "confidence": pewność wnioskowania ("high"/"medium"/"low")

Odpowiedz TYLKO w formacie JSON (bez markdown):
{{
  "scenarios": [
    {{
      "timeframe": "12_months",
      "variant": "positive", 
      "content": "Treść scenariusza...",
      "chain_of_thought": "Wyjaśnienie logiki...",
      "reasoning_steps": [
        {{
          "fact": "GPU production recovery by end of 2028",
          "source_weight": 30,
          "inference": "Atlantis AI infrastructure projects can accelerate",
          "impact": "positive",
          "confidence": "high"
        }},
        {{
          "fact": "Oil prices drop to 30-35 USD",
          "source_weight": 25,
          "inference": "Russia's budget weakened, reducing hybrid threat capacity",
          "impact": "positive", 
          "confidence": "medium"
        }}
      ]
    }},
    {{
      "timeframe": "12_months",
      "variant": "negative", 
      "content": "Treść scenariusza...",
      "chain_of_thought": "Wyjaśnienie logiki...",
      "reasoning_steps": [...]
    }},
    {{
      "timeframe": "36_months",
      "variant": "positive", 
      "content": "Treść scenariusza...",
      "chain_of_thought": "Wyjaśnienie logiki...",
      "reasoning_steps": [...]
    }},
    {{
      "timeframe": "36_months",
      "variant": "negative", 
      "content": "Treść scenariusza...",
      "chain_of_thought": "Wyjaśnienie logiki...",
      "reasoning_steps": [...]
    }}
  ]
}}

Pamiętaj o zasadzie "chain of thought" - każdy wniosek musi być logicznie uzasadniony. Reasoning_steps muszą pokazywać PEŁNĄ ścieżkę: fakt → wniosek → wpływ."""

    text = await call_gemini_with_prompt(prompt, temperature=0.4, max_tokens=8192)
    
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]
    
    text = text.strip()
    scenarios = json.loads(text)["scenarios"]
    
    evolution_stats = {}
    
    # AlphaEvolve: Evolve each scenario
    if use_evolution:
        # Import here to avoid circular dependency
        from app.services.evolution import evolve_scenario
        print("[EVOLUTION] 🧬 Evolving scenarios...")
        
        # Build context for evolution (situation + topics + syntheses)
        evolution_context = f"""
SYTUACJA:
{situation}

TEMATY:
{topics_text}

SYNTEZY TEMATÓW:
{syntheses_context[:6000] if syntheses_context else 'Brak'}
"""
        
        for i, scenario in enumerate(scenarios):
            scenario_key = f"{scenario['timeframe']}_{scenario['variant']}"
            print(f"[EVOLUTION] 🧬 Evolving scenario: {scenario_key}")
            
            # Combine content + chain_of_thought for evolution
            full_content = f"""SCENARIUSZ ({scenario['timeframe']}, {scenario['variant']}):

{scenario['content']}

CHAIN OF THOUGHT:
{scenario['chain_of_thought']}"""
            
            evolution_result = await evolve_scenario(
                scenario=full_content,
                topic_syntheses_context=evolution_context,
                logger=None
            )
            
            # Parse evolved content back to parts
            evolved = evolution_result.final_content
            
            # Try to split back into content and chain_of_thought
            if "CHAIN OF THOUGHT:" in evolved:
                parts = evolved.split("CHAIN OF THOUGHT:")
                scenario['content'] = parts[0].replace(f"SCENARIUSZ ({scenario['timeframe']}, {scenario['variant']}):", "").strip()
                scenario['chain_of_thought'] = parts[1].strip() if len(parts) > 1 else scenario['chain_of_thought']
            else:
                # Just update content if can't parse
                scenario['content'] = evolved
            
            evolution_stats[scenario_key] = evolution_result.to_dict()
            
            print(f"[EVOLUTION] ✓ {scenario_key}: {evolution_result.initial_score:.0f} → {evolution_result.final_score:.0f} (+{evolution_result.improvement:.0f})")
    
    return {
        "scenarios": scenarios,
        "evolution_stats": evolution_stats
    }


async def generate_topics_with_feedback(
    country_profile: dict,
    situation: str,
    feedback: str
) -> list[dict]:
    """Generate topics based on user feedback to go in a different direction."""
    
    prompt = f"""Jesteś starszym analitykiem geopolitycznym MSZ. Ambasador przekazał ci dane i FEEDBACK - prosi o zmianę kierunku analizy.

PROFIL PAŃSTWA ATLANTIS:
{json.dumps(country_profile, ensure_ascii=False, indent=2)}

OPIS SYTUACJI MIĘDZYNARODOWEJ:
{situation}

FEEDBACK OD UŻYTKOWNIKA (BARDZO WAŻNE - dostosuj tematy do tego):
"{feedback}"

Na podstawie feedbacku wygeneruj 7-8 NOWYCH tematów badawczych, które lepiej odpowiadają oczekiwaniom użytkownika.

Dla każdego tematu podaj:
- "name": Konkretna, specyficzna nazwa tematu po polsku (max 80 znaków)
- "keywords": 4-5 słów kluczowych do wyszukiwania (po angielsku)
- "weight": Waga tematu od 1 do 100
- "rationale": Krótkie uzasadnienie + jak odnosi się do feedbacku

Odpowiedz TYLKO w formacie JSON:
{{
  "topics": [...]
}}"""

    text = await call_gemini_with_prompt(prompt, temperature=0.7, max_tokens=4096)
    
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]
    
    text = text.strip()
    return json.loads(text)["topics"]


async def generate_keywords_for_topic(topic_name: str) -> list[str]:
    """Generate English keywords for a user-provided topic name."""
    
    prompt = f"""Generate 5 English search keywords for this research topic:

TOPIC: {topic_name}

Return ONLY a JSON array of 5 keywords in English, good for searching news and government websites:
["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]"""

    text = await call_gemini_with_prompt(prompt, temperature=0.3, max_tokens=200)
    
    # Clean up response
    text = text.strip()
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]
    
    text = text.strip()
    
    # Try to parse as JSON array
    try:
        keywords = json.loads(text)
        if isinstance(keywords, list):
            return keywords[:5]
    except:
        pass
    
    # Fallback - extract words
    return ["policy", "international", "analysis", "trade", "security"]


async def generate_backcast(
    country_profile: dict,
    situation: str,
    selected_topics: list[dict],
    target_state: str,
    target_year: int,
    topic_syntheses: list[dict] = None,
) -> dict:
    """
    Generate backcast analysis - work backwards from a desired future state.
    
    Returns:
    {
        "backcast_steps": [
            {
                "year": 2028,
                "state": "Target achieved",
                "prerequisites_met": ["..."],
            },
            {
                "year": 2027,
                "state": "What must be true",
                "actions_required": ["..."],
                "key_milestones": ["..."]
            },
            ...
            {
                "year": 2025,
                "state": "Current state",
                "immediate_actions": ["..."],
                "critical_path": "..."
            }
        ],
        "feasibility_assessment": {
            "score": 0-100,
            "main_obstacles": [...],
            "enablers": [...],
            "recommendation": "..."
        },
        "chain_of_thought": "..."
    }
    """
    from datetime import datetime
    current_year = datetime.now().year
    
    # Sort by weight
    sorted_topics = sorted(selected_topics, key=lambda t: t.get('weight', 50), reverse=True)
    topics_text = "\n".join([
        f"- [WAGA: {t.get('weight', 50)}] {t['name']}: {', '.join(t['keywords'])}" 
        for t in sorted_topics
    ])
    
    # Build syntheses context
    syntheses_context = ""
    if topic_syntheses:
        syntheses_context = "\n\n".join([
            f"=== {ts.get('topic_name', 'Topic')} ===\n{ts.get('synthesis', '')[:2000]}"
            for ts in topic_syntheses
        ])
    
    # Calculate years to go back
    years_to_cover = list(range(target_year, current_year - 1, -1))
    years_text = ", ".join(map(str, years_to_cover))

    prompt = f"""Jesteś starszym analitykiem strategicznym MSZ. Wykonujesz analizę BACKCASTING - wsteczne prognozowanie.

CZYM JEST BACKCASTING:
Backcasting to metoda analityczna, w której zaczynamy od POŻĄDANEGO STANU PRZYSZŁEGO i cofamy się krok po kroku do teraźniejszości, określając co musi się wydarzyć na każdym etapie, aby osiągnąć cel.

PROFIL PAŃSTWA ATLANTIS:
{json.dumps(country_profile, ensure_ascii=False, indent=2)}

AKTUALNA SYTUACJA MIĘDZYNARODOWA:
{situation}

WYBRANE TEMATY ANALIZY:
{topics_text}

{f"SYNTEZY TEMATÓW:{chr(10)}{syntheses_context}" if syntheses_context else ""}

STAN DOCELOWY (rok {target_year}):
"{target_state}"

ZADANIE:
Wykonaj analizę backcasting od roku {target_year} do {current_year}.
Dla każdego roku określ: co musi być prawdą, jakie działania są wymagane, jakie kamienie milowe muszą być osiągnięte.

Odpowiedz TYLKO w formacie JSON (bez markdown):
{{
  "backcast_steps": [
    {{
      "year": {target_year},
      "state": "Opis osiągniętego stanu docelowego",
      "prerequisites_met": ["Warunek 1 który musiał być spełniony", "Warunek 2"],
      "reasoning": "Dlaczego te warunki są kluczowe"
    }},
    {{
      "year": {target_year - 1},
      "state": "Co musi być prawdą w tym roku",
      "actions_required": ["Działanie 1", "Działanie 2"],
      "key_milestones": ["Kamień milowy 1"],
      "reasoning": "Logika przejścia do następnego roku"
    }},
    {{
      "year": {target_year - 2},
      "state": "Co musi być prawdą",
      "actions_required": ["..."],
      "key_milestones": ["..."],
      "reasoning": "..."
    }},
    {{
      "year": {current_year},
      "state": "Stan obecny - punkt wyjścia",
      "immediate_actions": ["Natychmiastowe działanie 1", "Działanie 2"],
      "critical_path": "Najważniejszy pierwszy krok który określi sukces całej ścieżki",
      "reasoning": "Dlaczego to jest krytyczne"
    }}
  ],
  "feasibility_assessment": {{
    "score": 65,
    "main_obstacles": ["Przeszkoda 1", "Przeszkoda 2"],
    "enablers": ["Czynnik wspierający 1", "Czynnik 2"],
    "recommendation": "Ogólna ocena wykonalności i rekomendacja"
  }},
  "chain_of_thought": "Pełne wyjaśnienie logiki analitycznej backcastingu - jak poszczególne kroki łączą się w spójną ścieżkę od teraźniejszości do celu (300-400 słów)"
}}

WAŻNE:
1. Każdy krok musi logicznie wynikać z poprzedniego (idąc wstecz)
2. Uwzględnij realne ograniczenia i możliwości Atlantis
3. Bądź konkretny - podawaj daty, liczby, nazwy programów
4. Ocena wykonalności (feasibility_assessment.score) powinna być realistyczna
5. Kroki muszą uwzględniać wagi tematów - ważniejsze tematy = więcej uwagi"""

    text = await call_gemini_with_prompt(prompt, temperature=0.4, max_tokens=8192)
    
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]
    
    text = text.strip()
    result = json.loads(text)
    
    # Add metadata
    result["target_state"] = target_state
    result["target_year"] = target_year
    result["analysis_type"] = "backcast"
    
    return result
