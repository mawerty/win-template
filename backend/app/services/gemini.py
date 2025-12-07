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
        text = await call_gemini_with_prompt(prompt, temperature=0.2, max_tokens=2000)
        
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


async def generate_topics(country_profile: dict, situation: str, criteria: str | None = None) -> list[dict]:
    """Generate 20-30 specific research topics with keywords and weights based on input."""
    
    criteria_section = ""
    if criteria:
        criteria_section = f"""
SUCCESS CRITERIA (what outcomes we want to achieve):
{criteria}
"""
    
    prompt = f"""You are a senior geopolitical analyst. Generate research topics for Atlantis based on the situation description and success criteria.

ATLANTIS COUNTRY PROFILE:
{json.dumps(country_profile, ensure_ascii=False, indent=2)}

INTERNATIONAL SITUATION DESCRIPTION (with importance weights):
{situation}
{criteria_section}
=== YOUR TASK ===

Generate 20-30 SPECIFIC research topics that:
1. DIRECTLY relate to factors mentioned in the situation description
2. Help achieve the success criteria
3. Are relevant to Atlantis's profile and interests

RULES:
- Each situation factor (a, b, c, d, e, f...) should generate 3-5 related topics
- Topics must be CONCRETE and ACTIONABLE (not vague like "international trade")
- Each topic should explore a SPECIFIC angle of the situation
- Topic weights (1-100) should reflect:
  * The importance weight from situation description
  * How much it impacts success criteria
  * Relevance to Atlantis

For each topic provide:
- "name": Specific, searchable topic name in English (max 80 chars)
- "keywords": 4-5 English search keywords for news/government sites
- "weight": 1-100 (based on situation weights + criteria importance)
- "rationale": One sentence linking to situation factor AND criteria
- "situation_factor": Which factor (a/b/c/d/e/f) this relates to

EXAMPLE (if situation mentions GPU shortage with weight 30):
{{
  "name": "GPU Supply Chain Recovery Timeline 2028",
  "keywords": ["GPU shortage", "semiconductor production", "TSMC capacity", "AI chip supply"],
  "weight": 85,
  "rationale": "Factor (a) GPU shortage impacts AI infrastructure criteria",
  "situation_factor": "a"
}}

Respond ONLY in JSON format (no markdown):
{{
  "topics": [
    {{ "name": "...", "keywords": [...], "weight": N, "rationale": "...", "situation_factor": "X" }},
    ...
  ]
}}

IMPORTANT:
- Generate 20-30 topics, covering ALL situation factors
- Higher situation weights = more topics about that factor
- Topics should help achieve success criteria
- Be specific: "EU EV tariffs on Chinese imports" not "automotive industry"
- Each topic should be distinct and searchable"""

    text = await call_gemini_with_prompt(prompt, temperature=0.2, max_tokens=8192)
    
    # Parse JSON from response (handle markdown code blocks)
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]
    
    text = text.strip()
    topics = json.loads(text)["topics"]
    
    # Ensure we have at least 20 topics
    print(f"[TOPICS] Generated {len(topics)} topics")
    return topics


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
    
    prompt = f"""You are a senior analyst. Prepare a report for the ambassador of Atlantis to the EU.

ATLANTIS COUNTRY PROFILE:
{json.dumps(country_profile, ensure_ascii=False, indent=2)}

{user_facts_section}

CURRENT INTERNATIONAL SITUATION DESCRIPTION:
{situation}

SELECTED TOPICS FOR ANALYSIS:
{topics_text}

{syntheses_section}

Generate 4 scenarios for international situation development from Atlantis interests perspective:
1. 12-month perspective - POSITIVE variant for Atlantis
2. 12-month perspective - NEGATIVE variant for Atlantis
3. 36-month perspective - POSITIVE variant for Atlantis  
4. 36-month perspective - NEGATIVE variant for Atlantis

For each scenario provide:
- "content": Detailed description of predicted situation development (400-500 words). EVERY claim must have citation!
- "chain_of_thought": Explanation of analytical logic (200-300 words) with citations.
- "reasoning_steps": STRUCTURAL inference path as array of steps. Each step shows: source fact → conclusion → impact on scenario.

CRITICAL - CITATIONS IN CONTENT (use EXACTLY these formats):
- [USER-X] for user baseline facts (e.g., [USER-a], [USER-b])
- [Country-T#-N] for specific sources from syntheses (e.g., [USA-T5-1], [Germany-T3-2])
- [Country-T#] for general reference to entire topic (e.g., [USA-T5], [Germany-T3])
- EVERY claim must have at least one citation
- Example: "Due to GPU shortage [USER-a], the AI sector will... According to German data [Germany-T3-1], EV sales..."

IMPORTANT for reasoning_steps - each step must have:
- "fact": specific fact with citation [USER-X] or [Country-T#-N]
- "source_weight": source weight of this fact (1-100)
- "inference": conclusion drawn from this fact
- "impact": how it affects the scenario ("positive"/"negative"/"neutral")
- "confidence": inference certainty ("high"/"medium"/"low")

Respond ONLY in JSON format (no markdown):
{{
  "scenarios": [
    {{
      "timeframe": "12_months",
      "variant": "positive", 
      "content": "Scenario content...",
      "chain_of_thought": "Logic explanation...",
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
      "content": "Scenario content...",
      "chain_of_thought": "Logic explanation...",
      "reasoning_steps": [...]
    }},
    {{
      "timeframe": "36_months",
      "variant": "positive", 
      "content": "Scenario content...",
      "chain_of_thought": "Logic explanation...",
      "reasoning_steps": [...]
    }},
    {{
      "timeframe": "36_months",
      "variant": "negative", 
      "content": "Scenario content...",
      "chain_of_thought": "Logic explanation...",
      "reasoning_steps": [...]
    }}
  ]
}}

Remember the "chain of thought" principle - every conclusion must be logically justified. Reasoning_steps must show FULL path: fact → conclusion → impact."""

    text = await call_gemini_with_prompt(prompt, temperature=0.2, max_tokens=8192)
    
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
SITUATION:
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
    
    prompt = f"""You are a senior geopolitical analyst. You received data and FEEDBACK - requesting a change in analysis direction.

ATLANTIS COUNTRY PROFILE:
{json.dumps(country_profile, ensure_ascii=False, indent=2)}

INTERNATIONAL SITUATION DESCRIPTION:
{situation}

USER FEEDBACK (VERY IMPORTANT - adjust topics based on this):
"{feedback}"

Based on the feedback, generate 7-8 NEW research topics that better match user expectations.

For each topic provide:
- "name": Specific topic name in English (max 80 characters)
- "keywords": 4-5 search keywords (in English)
- "weight": Topic weight from 1 to 100
- "rationale": Short justification + how it relates to feedback

Respond ONLY in JSON format:
{{
  "topics": [...]
}}"""

    text = await call_gemini_with_prompt(prompt, temperature=0.2, max_tokens=4096)
    
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

    text = await call_gemini_with_prompt(prompt, temperature=0.2, max_tokens=200)
    
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

    prompt = f"""You are a senior strategic analyst. You are performing BACKCASTING analysis - reverse forecasting.

WHAT IS BACKCASTING:
Backcasting is an analytical method where we start from the DESIRED FUTURE STATE and work backwards step by step to the present, determining what must happen at each stage to achieve the goal.

ATLANTIS COUNTRY PROFILE:
{json.dumps(country_profile, ensure_ascii=False, indent=2)}

CURRENT INTERNATIONAL SITUATION:
{situation}

SELECTED ANALYSIS TOPICS:
{topics_text}

{f"TOPIC SYNTHESES:{chr(10)}{syntheses_context}" if syntheses_context else ""}

TARGET STATE (year {target_year}):
"{target_state}"

TASK:
Perform backcasting analysis from year {target_year} to {current_year}.
For each year determine: what must be true, what actions are required, what milestones must be achieved.

Respond ONLY in JSON format (no markdown):
{{
  "backcast_steps": [
    {{
      "year": {target_year},
      "state": "Description of achieved target state",
      "prerequisites_met": ["Prerequisite 1 that had to be met", "Prerequisite 2"],
      "reasoning": "Why these prerequisites are crucial"
    }},
    {{
      "year": {target_year - 1},
      "state": "What must be true this year",
      "actions_required": ["Action 1", "Action 2"],
      "key_milestones": ["Milestone 1"],
      "reasoning": "Logic for transition to next year"
    }},
    {{
      "year": {target_year - 2},
      "state": "What must be true",
      "actions_required": ["..."],
      "key_milestones": ["..."],
      "reasoning": "..."
    }},
    {{
      "year": {current_year},
      "state": "Current state - starting point",
      "immediate_actions": ["Immediate action 1", "Action 2"],
      "critical_path": "Most important first step that will determine success of entire path",
      "reasoning": "Why this is critical"
    }}
  ],
  "feasibility_assessment": {{
    "score": 65,
    "main_obstacles": ["Obstacle 1", "Obstacle 2"],
    "enablers": ["Supporting factor 1", "Factor 2"],
    "recommendation": "Overall feasibility assessment and recommendation"
  }},
  "chain_of_thought": "Full explanation of backcasting analytical logic - how individual steps connect into coherent path from present to goal (300-400 words)"
}}

IMPORTANT:
1. Each step must logically follow from the previous one (going backwards)
2. Consider real constraints and capabilities of Atlantis
3. Be specific - provide dates, numbers, program names
4. Feasibility assessment (feasibility_assessment.score) should be realistic
5. Steps must consider topic weights - more important topics = more attention"""

    text = await call_gemini_with_prompt(prompt, temperature=0.2, max_tokens=8192)
    
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
