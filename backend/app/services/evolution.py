"""
AlphaEvolve-inspired evolution service.

Iteratively improves outputs using:
1. Multi-criteria evaluation
2. LLM-guided mutations based on feedback
3. Score tracking across iterations

Used for: country summaries, topic synthesis, scenarios.
"""

from dataclasses import dataclass, field
from typing import Optional

from app.services.gemini import call_gemini_with_prompt
from app.utils.logger import StepLogger


# ============================================================================
# EVALUATION CRITERIA
# ============================================================================

COUNTRY_SUMMARY_CRITERIA = """
Score 0-150. Evaluate citations and source credibility.

- hall (0-50): No invented facts. 50 = all facts from sources, 0 = any hallucination.

- cite (0-35): Citations - FORMAT + DENSITY combined.
  * Format: Must be [Country-N] or [Country-N, Country-M]. No [1], no [Country-1]1.
  * Density: 8+ citations = full points, 5-7 = partial, <5 = low.
  * 35 = correct format AND 8+ citations
  * 20 = correct format but fewer citations
  * 0 = wrong format like [1] or [Country-1]1

- bias (0-35): Source credibility and attribution.
  * Russia/China sources MUST be prefixed: "Russia claims...", "Chinese sources report..."
  * Global claims need multi-country sources (not just one country saying something global)
  * Single-source claims should be hedged: "According to German sources..."
  * 35 = proper attribution for biased sources, no single-source global claims
  * 15 = some issues with attribution
  * 0 = Russia/China used without noting origin, or single-source global claims

- qual (0-30): Quality - specific facts (numbers, dates, names), good structure, concise.
"""

SYNTHESIS_CRITERIA = """
Score 0-150. Evaluate cross-country synthesis quality.

- hall (0-50): No invented facts. All claims must exist in country summaries.

- cite (0-35): Citations - FORMAT + DENSITY.
  * Format: [Country-N] with full country name. No [1], no trailing numbers.
  * Density: 12+ citations = full, 8-11 = partial, <8 = low.
  * 35 = correct format AND 12+ citations
  * 0 = wrong format

- bias (0-35): Source credibility and cross-referencing.
  * Russia/China claims MUST be prefixed: "Russia claims...", "According to Chinese media..."
  * Global/universal claims need citations from 2+ countries
  * Single-country claims about global trends = suspicious
  * 35 = proper attribution, multi-source for global claims
  * 0 = biased sources without attribution, single-source global claims

- qual (0-30): Quality - specific facts, good structure, clear synthesis across countries.
"""

SCENARIO_CRITERIA = """
Score 0-150. Evaluate scenario grounding in sources.

- hall (0-50): Present facts from sources. Future predictions based on current data OK.

- cite (0-35): Citations - correct format, 10+ references.
  * For summaries/syntheses: [Country-N] like [Germany-1], [France-2]
  * For scenarios: [Country-T#-N] like [USA-T5-1], [Germany-T3-2] (topic-based)
  * Also valid: [USER-a], [USER-b] for user facts

- bias (0-35): Source credibility in predictions.
  * Predictions based on Russia/China data should note source reliability
  * Major predictions need multi-source grounding
  * Single-source dramatic predictions = suspicious

- qual (0-30): Quality - concrete predictions (Q2 2025, -15%), clear cause→effect.
"""


# ============================================================================
# EVALUATION PROMPTS
# ============================================================================

EVALUATE_PROMPT = """Evaluate this text. Be STRICT but FAIR.

DATE: {today}

TEXT:
{content}

SOURCES:
{context}

{criteria}

=== EVALUATION CHECKLIST ===

1. CITATIONS (cite): Check format AND count
   - Valid: [Germany-1], [France-2, France-3], [USA-1, Germany-2]
   - Invalid: [1], [2], [Germany-1, 3], [Germany-1]1
   - Count total citation references

2. BIAS/CREDIBILITY (bias): Check source attribution
   - Russia/China sources: Must say "Russia claims...", "Chinese media reports..."
   - Global claims: Need 2+ country sources, not single-source
   - Suspicious: "worldwide trend" cited from only one country

3. HALLUCINATIONS (hall): Any facts not in sources?

4. QUALITY (qual): Specific facts? Good structure?

=== RESPOND IN THIS EXACT FORMAT ===

SCORES: hall=XX cite=XX bias=XX qual=XX

ISSUES:
- [problem 1]
- [problem 2]
- (or "none")

FIX: [priority fix or "none"]"""


MUTATE_PROMPT = """Fix the issues in this text.

TEXT (score: {score}/150):
{content}

FEEDBACK:
{feedback}

SOURCES:
{context}

=== FIX THESE ISSUES ===

1. CITATIONS - correct format:
   - For summaries: [Germany-1], [France-2, USA-3]
   - For scenarios: [Germany-T3-1], [USA-T5-2] (topic-based)
   - User facts: [USER-a], [USER-b]
   - BAD: [1], [Germany-1]1, [Germany-1, 3]

2. SOURCE CREDIBILITY - attribute biased sources:
   - Russia/China: MUST prefix with "Russia claims...", "Chinese sources report..."
   - Global claims: Need 2+ country sources
   - Single-source claims: Hedge with "According to German sources..."

3. NO HALLUCINATIONS - only use facts from sources

=== RULES ===
1. Every fact needs citation (format depends on context)
2. Russia/China = "Russia claims..." [Russia-1] or [Russia-T3-1]
3. Global claims need multi-country citations
4. No trailing numbers after ]

Output improved text:"""


# ============================================================================
# DATA STRUCTURES
# ============================================================================

@dataclass
class EvolutionStep:
    """Single iteration in evolution."""
    iteration: int
    score: float
    scores_breakdown: dict
    feedback: str
    content: str


@dataclass
class EvolutionResult:
    """Result of evolution process."""
    final_content: str
    final_score: float
    initial_score: float
    improvement: float
    iterations: int
    history: list[EvolutionStep] = field(default_factory=list)
    
    def to_dict(self) -> dict:
        return {
            "final_score": self.final_score,
            "initial_score": self.initial_score,
            "improvement": self.improvement,
            "iterations": self.iterations,
            "history": [
                {
                    "iteration": s.iteration,
                    "score": s.score,
                    "scores": s.scores_breakdown,
                    "feedback": s.feedback,
                    "content": s.content,  # Include the actual content at each step
                }
                for s in self.history
            ]
        }


# ============================================================================
# CORE EVOLUTION FUNCTIONS
# ============================================================================

async def evaluate_content(
    content: str,
    context: str,
    criteria: str
) -> dict:
    """
    Evaluate content. Returns score (0-150) and feedback.
    
    Parses response format: SCORES: hall=XX cite=XX bias=XX qual=XX
    
    Categories:
    - hall (0-50): Hallucinations
    - cite (0-35): Citations format + density combined
    - bias (0-35): Source credibility (Russia/China attribution, single-source global claims)
    - qual (0-30): Quality (specific facts, structure)
    """
    from datetime import date
    import re
    
    prompt = EVALUATE_PROMPT.format(
        content=content,
        context=context[:20000],
        criteria=criteria,
        today=date.today().strftime("%B %d, %Y")
    )
    
    try:
        response = await call_gemini_with_prompt(prompt, temperature=0.0, max_tokens=1000)
        response = response.strip()
        
        breakdown = {}
        
        # Parse: SCORES: hall=XX cite=XX bias=XX qual=XX
        scores_match = re.search(
            r'SCORES?[:\s]+hall[=:]?\s*(\d+)[,\s]+cite[=:]?\s*(\d+)[,\s]+bias[=:]?\s*(\d+)[,\s]+qual[=:]?\s*(\d+)',
            response, 
            re.IGNORECASE
        )
        
        if scores_match:
            breakdown = {
                "hall": int(scores_match.group(1)),
                "cite": int(scores_match.group(2)),
                "bias": int(scores_match.group(3)),
                "qual": int(scores_match.group(4)),
            }
        else:
            # Fallback: try to find individual scores
            for key in ["hall", "cite", "bias", "qual"]:
                match = re.search(rf'{key}[=:]\s*(\d+)', response, re.IGNORECASE)
                if match:
                    breakdown[key] = int(match.group(1))
        
        # Validate and clamp values
        max_scores = {"hall": 50, "cite": 35, "bias": 35, "qual": 30}
        for key, max_val in max_scores.items():
            if key in breakdown:
                breakdown[key] = min(max_val, max(0, breakdown[key]))
        
        # Calculate total
        score = sum(breakdown.values()) if breakdown else 0
        
        # If we got no breakdown, estimate from content
        if not breakdown or score == 0:
            # Count citations
            citation_count = len(re.findall(r'\[[A-Za-z]+-\d+(?:,\s*[A-Za-z]+-\d+)*\]', content))
            wrong_format = len(re.findall(r'\[\d+\]', content))  # [1], [2] format
            
            # Check for Russia/China attribution
            has_russia = "russia" in content.lower() or "russian" in content.lower()
            has_china = "china" in content.lower() or "chinese" in content.lower()
            russia_attributed = "russia claims" in content.lower() or "russian sources" in content.lower()
            china_attributed = "china claims" in content.lower() or "chinese sources" in content.lower() or "chinese media" in content.lower()
            
            bias_ok = True
            if has_russia and not russia_attributed:
                bias_ok = False
            if has_china and not china_attributed:
                bias_ok = False
            
            # Estimate scores
            cite_score = 35 if (wrong_format == 0 and citation_count >= 8) else (20 if citation_count >= 5 else 10)
            breakdown = {
                "hall": 50,  # Assume no hallucinations
                "cite": cite_score,
                "bias": 35 if bias_ok else 15,
                "qual": 25,
            }
            score = sum(breakdown.values())
            print(f"[EVOLUTION] ⚠️ Fallback scoring: {citation_count} citations, bias_ok={bias_ok}", flush=True)
        
        return {
            "scores": breakdown,
            "total": score,
            "hallucination_count": 1 if breakdown.get("hall", 50) < 50 else 0,
            "bias_issues": 1 if breakdown.get("bias", 35) < 25 else 0,
            "full_feedback": response
        }
        
    except Exception as e:
        print(f"[EVOLUTION] Evaluation error: {e}", flush=True)
        return {
            "scores": {"hall": 50, "cite": 25, "bias": 25, "qual": 20},
            "total": 120,
            "hallucination_count": 0,
            "bias_issues": 0,
            "full_feedback": f"Evaluation error: {str(e)[:100]}"
        }


async def mutate_content(
    content: str,
    score: float,
    feedback: str,
    context: str
) -> str:
    """Generate improved version based on feedback."""
    
    prompt = MUTATE_PROMPT.format(
        content=content,
        score=score,
        feedback=feedback,
        context=context[:20000]
    )
    
    try:
        improved = await call_gemini_with_prompt(prompt, temperature=0.1, max_tokens=1000)
        improved = improved.strip()
        
        # Validate - must be substantial content
        if len(improved) < 100:
            print(f"[EVOLUTION] Mutation too short ({len(improved)} chars), keeping original", flush=True)
            return content
        
        if len(improved) < len(content) * 0.3:
            print(f"[EVOLUTION] Mutation lost too much content, keeping original", flush=True)
            return content
        
        return improved
    except Exception as e:
        print(f"[EVOLUTION] Mutation error: {e}", flush=True)
        return content


async def evolve(
    initial_content: str,
    context: str,
    criteria: str,
    max_iterations: int = 3,
    target_score: float = 150.0,  # Always aim for max
    logger: Optional[StepLogger] = None
) -> EvolutionResult:
    """
    Main evolution loop - iteratively improve content.
    
    Simple 3-iteration approach:
    1. Evaluate current content
    2. If score < target, mutate
    3. Keep best version seen
    """
    import re
    
    current = initial_content
    best_content = initial_content
    best_score = 0
    history: list[EvolutionStep] = []
    
    print(f"[EVOLUTION]    📝 Initial content: {len(initial_content)} chars", flush=True)
    
    for i in range(max_iterations):
        iteration_num = i + 1
        
        print(f"[EVOLUTION]    📊 v{iteration_num}/{max_iterations} evaluating...", flush=True)
        
        # EVALUATE
        eval_result = await evaluate_content(current, context, criteria)
        scores = eval_result.get("scores", {})
        score = sum(scores.values()) if scores else eval_result.get("total", 100)
        feedback = eval_result.get("full_feedback", "")
        
        # Track best - only if content is valid (not empty/too short)
        if score > best_score and len(current.strip()) > 100:
            best_score = score
            best_content = current
        
        # Record step
        step = EvolutionStep(
            iteration=iteration_num,
            score=score,
            scores_breakdown=scores,
            feedback=feedback[:2000],
            content=current
        )
        history.append(step)
        
        # Log score
        breakdown_str = " (" + ", ".join(f"{k}:{v}" for k, v in scores.items()) + ")" if scores else ""
        print(f"[EVOLUTION]    v{iteration_num}: {score}/150{breakdown_str}", flush=True)
        
        # Show fix priority
        fix_match = re.search(r'FIX[:\s]*(.+?)(?:\n|$)', feedback, re.IGNORECASE)
        if fix_match and fix_match.group(1).strip().lower() != "none":
            print(f"[EVOLUTION]    💬 Fix: {fix_match.group(1).strip()[:60]}", flush=True)
        
        # Early stop if good enough
        if score >= target_score:
            print("[EVOLUTION]    ✓ Target reached!", flush=True)
            break
        
        # Don't mutate on last iteration
        if iteration_num >= max_iterations:
            break
        
        # MUTATE
        print(f"[EVOLUTION]    🔧 v{iteration_num}→v{iteration_num+1} improving...", flush=True)
        current = await mutate_content(current, score, feedback, context)
    
    # Use best content seen - fallback to initial if best is garbage
    final_content = best_content if len(best_content.strip()) > 100 else initial_content
    
    print(f"[EVOLUTION]    📤 Final content: {len(final_content)} chars (best: {len(best_content)}, initial: {len(initial_content)})", flush=True)
    
    # Last resort - use content from history if final is empty
    if len(final_content.strip()) < 100 and history:
        for step in reversed(history):
            if len(step.content.strip()) > 100:
                final_content = step.content
                print(f"[EVOLUTION]    ⚠️ Recovered content from v{step.iteration}: {len(final_content)} chars", flush=True)
                break
    
    final_score = best_score
    initial_score = history[0].score if history else 0
    
    return EvolutionResult(
        final_content=final_content,
        final_score=final_score,
        initial_score=initial_score,
        improvement=final_score - initial_score,
        iterations=len(history),
        history=history
    )


# ============================================================================
# SPECIALIZED EVOLUTION FUNCTIONS
# ============================================================================

async def evolve_country_summary(
    summary: str,
    articles_context: str,
    logger: Optional[StepLogger] = None
) -> EvolutionResult:
    """Evolve a country summary using article sources as context."""
    return await evolve(
        initial_content=summary,
        context=articles_context,
        criteria=COUNTRY_SUMMARY_CRITERIA,
        max_iterations=3,
        target_score=150,  # Aim for max
        logger=logger
    )


async def evolve_topic_synthesis(
    synthesis: str,
    country_summaries_context: str,
    logger: Optional[StepLogger] = None
) -> EvolutionResult:
    """Evolve topic synthesis using country summaries as context."""
    return await evolve(
        initial_content=synthesis,
        context=country_summaries_context,
        criteria=SYNTHESIS_CRITERIA,
        max_iterations=3,
        target_score=150,  # Aim for max
        logger=logger
    )


async def evolve_scenario(
    scenario: str,
    topic_syntheses_context: str,
    logger: Optional[StepLogger] = None,
    max_iterations: int = 3  # 3 iterations max
) -> EvolutionResult:
    """Evolve scenario using topic syntheses as context."""
    return await evolve(
        initial_content=scenario,
        context=topic_syntheses_context,
        criteria=SCENARIO_CRITERIA,
        max_iterations=max_iterations,
        target_score=150,  # Aim for max
        logger=logger
    )


# ============================================================================
# REPORT SECTION EVOLUTION
# ============================================================================

REPORT_SECTION_CRITERIA = """
Score 0-150. Check facts and source credibility.
- hall (0-50): No invented facts
- cite (0-35): Citations [Country-N] format + 10+ references
- bias (0-35): Russia/China attributed, multi-source for global claims
- qual (0-30): Clear structure, specific numbers
"""

RECOMMENDATION_CRITERIA = """
Score 0-150. Recommendations grounded in analysis.
- hall (0-50): Based on scenario analysis
- cite (0-35): Each recommendation cites sources
- bias (0-35): Acknowledge source reliability for major recommendations
- qual (0-30): Specific, actionable
"""

DATA_SUMMARY_CRITERIA = """
Score 0-150. Accurate data summary.
- hall (0-50): Only describe analyzed data
- cite (0-35): Reference sources properly
- bias (0-35): Note source diversity and limitations
- qual (0-30): Concise, clear
"""


async def evolve_report_section(
    content: str,
    syntheses_context: str,
    section_type: str = "scenario",
    logger: Optional[StepLogger] = None
) -> EvolutionResult:
    """Evolve a report section."""
    
    criteria_map = {
        "scenario": REPORT_SECTION_CRITERIA,
        "recommendation": RECOMMENDATION_CRITERIA,
        "recommendations": RECOMMENDATION_CRITERIA,
        "data_summary": DATA_SUMMARY_CRITERIA,
        "positive_12m": REPORT_SECTION_CRITERIA,
        "negative_12m": REPORT_SECTION_CRITERIA,
        "positive_36m": REPORT_SECTION_CRITERIA,
        "negative_36m": REPORT_SECTION_CRITERIA,
        "situation": REPORT_SECTION_CRITERIA,
    }
    
    criteria = criteria_map.get(section_type, REPORT_SECTION_CRITERIA)
    
    return await evolve(
        initial_content=content,
        context=syntheses_context,
        criteria=criteria,
        max_iterations=3,  # 3 iterations
        target_score=130,  # Good enough
        logger=logger
    )

