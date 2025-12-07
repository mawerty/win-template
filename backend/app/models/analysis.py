from datetime import datetime
from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship
import json

if TYPE_CHECKING:
    from typing import List


class Topic(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="analysissession.id")
    name: str
    keywords: str  # JSON array stored as string
    weight: int = Field(default=50)  # Weight 1-100, higher = more important
    rationale: str = Field(default="")  # Why this topic is relevant
    selected: bool = False
    
    # Cached sources data
    cached_sources: Optional[str] = Field(default=None)  # JSON - search queries
    cached_urls: Optional[str] = Field(default=None)  # JSON - fetched URLs
    urls_cached_at: Optional[datetime] = Field(default=None)
    
    # Topic synthesis - comprehensive overview with source citations
    synthesis: Optional[str] = Field(default=None)  # AI-generated topic overview
    synthesis_generated_at: Optional[datetime] = Field(default=None)
    articles_used_count: int = Field(default=0)  # How many articles were used
    
    session: Optional["AnalysisSession"] = Relationship(back_populates="topics")
    
    @property
    def keywords_list(self) -> list[str]:
        return json.loads(self.keywords)
    
    @property
    def has_cached_urls(self) -> bool:
        return self.cached_urls is not None
    
    @property
    def has_synthesis(self) -> bool:
        return self.synthesis is not None and len(self.synthesis) > 100
    
    def get_synthesis_data(self) -> Optional[dict]:
        """Get synthesis as dict with 'text' and 'sources' keys."""
        if not self.synthesis:
            return None
        try:
            data = json.loads(self.synthesis)
            if isinstance(data, dict) and "text" in data:
                return data
            # Old format - just text
            return {"text": self.synthesis, "sources": []}
        except:
            return {"text": self.synthesis, "sources": []}
    
    def get_cached_sources(self) -> Optional[dict]:
        if self.cached_sources:
            return json.loads(self.cached_sources)
        return None
    
    def get_cached_urls(self) -> Optional[dict]:
        if self.cached_urls:
            return json.loads(self.cached_urls)
        return None
    
    def set_cached_sources(self, sources: dict):
        self.cached_sources = json.dumps(sources, ensure_ascii=False)
    
    def set_cached_urls(self, urls: dict):
        self.cached_urls = json.dumps(urls, ensure_ascii=False)
        self.urls_cached_at = datetime.utcnow()


class Scenario(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="analysissession.id")
    timeframe: str  # "12_months" | "36_months"
    variant: str    # "positive" | "negative"
    content: str
    chain_of_thought: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    version: int = Field(default=1)  # Version number for history
    
    # Which topics were used for this scenario
    topic_ids_used: str = Field(default="[]")  # JSON array of topic IDs
    
    # Structured reasoning path: fact -> inference -> conclusion
    reasoning_steps: str = Field(default="[]")  # JSON array of reasoning steps
    
    session: Optional["AnalysisSession"] = Relationship(back_populates="scenarios")
    
    @property
    def topics_used(self) -> list[int]:
        return json.loads(self.topic_ids_used)
    
    def get_reasoning_steps(self) -> list[dict]:
        """Get structured reasoning path."""
        if not self.reasoning_steps:
            return []
        try:
            return json.loads(self.reasoning_steps)
        except:
            return []
    
    def set_reasoning_steps(self, steps: list[dict]):
        """Set reasoning steps from list of dicts."""
        self.reasoning_steps = json.dumps(steps, ensure_ascii=False)


class ScenarioHistory(SQLModel, table=True):
    """Stores previous versions of scenarios for history tracking."""
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="analysissession.id")
    version: int
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Snapshot of all 4 scenarios
    scenarios_json: str  # JSON array of scenario data
    topic_ids_used: str = Field(default="[]")  # JSON array of topic IDs used
    
    def get_scenarios(self) -> list[dict]:
        return json.loads(self.scenarios_json)
    
    def get_topic_ids(self) -> list[int]:
        return json.loads(self.topic_ids_used)


class ArticleSummary(SQLModel, table=True):
    """Cached article summaries to avoid re-scraping."""
    id: Optional[int] = Field(default=None, primary_key=True)
    url: str = Field(unique=True, index=True)
    domain: str
    title: str = Field(default="")
    
    # Content
    raw_content: str = Field(default="")  # Scraped article text
    summary: str = Field(default="")  # AI-generated summary
    key_facts: str = Field(default="[]")  # JSON array of key facts
    
    # Metadata
    source_country: str = Field(default="")  # USA, China, Germany, etc.
    source_type: str = Field(default="")  # ministry, institution, think_tank
    language: str = Field(default="en")
    
    # Cache info
    content_hash: str = Field(default="")  # MD5 of raw_content
    scraped_at: datetime = Field(default_factory=datetime.utcnow)
    summarized_at: Optional[datetime] = Field(default=None)
    
    # Status
    scrape_status: str = Field(default="pending")  # pending, success, failed
    scrape_error: str = Field(default="")
    
    def get_key_facts(self) -> list[str]:
        return json.loads(self.key_facts)
    
    def set_key_facts(self, facts: list[str]):
        self.key_facts = json.dumps(facts, ensure_ascii=False)


class EvolutionLog(SQLModel, table=True):
    """
    AlphaEvolve-inspired: Track evolution history for outputs.
    Shows how score improved across iterations.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    
    # What was evolved
    content_type: str  # "country_summary" | "topic_synthesis" | "scenario"
    content_id: str  # Reference (e.g. "topic_5_USA" or "scenario_12_positive")
    session_id: Optional[int] = Field(default=None, foreign_key="analysissession.id")
    
    # Evolution results
    initial_score: float = 0
    final_score: float = 0
    improvement: float = 0
    iterations_count: int = 0
    
    # Full history as JSON
    history_json: str = "[]"  # List of {iteration, score, scores, feedback}
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    def get_history(self) -> list[dict]:
        return json.loads(self.history_json)
    
    def set_history(self, history: list[dict]):
        self.history_json = json.dumps(history, ensure_ascii=False)


class AnalysisSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    country_profile: str  # JSON
    situation_description: str  # The 6 weighted factors
    created_at: datetime = Field(default_factory=datetime.utcnow)
    current_scenario_version: int = Field(default=0)
    
    # Session name for easier identification
    name: str = Field(default="")
    
    # Parsed user facts from situation_description - ground truth with weights
    user_facts: str = Field(default="[]")  # JSON array of {id, fact, weight}
    
    # Analysis mode: "forecast" (default) or "backcast"
    analysis_mode: str = Field(default="forecast")  # "forecast" | "backcast"
    
    # Backcasting fields - only used when analysis_mode == "backcast"
    backcast_target_state: Optional[str] = Field(default=None)  # Desired future state
    backcast_target_year: int = Field(default=2028)  # Target year for backcast
    
    # Final report - 6 sections combining all topic syntheses
    final_report: Optional[str] = Field(default=None)  # JSON with sections
    final_report_generated_at: Optional[datetime] = Field(default=None)
    
    topics: list[Topic] = Relationship(back_populates="session")
    scenarios: list[Scenario] = Relationship(back_populates="session")
    
    @property
    def is_backcast(self) -> bool:
        return self.analysis_mode == "backcast"
    
    def get_user_facts(self) -> list[dict]:
        """Get parsed user facts as list of {id, fact, weight}."""
        try:
            return json.loads(self.user_facts)
        except:
            return []
    
    def set_user_facts(self, facts: list[dict]):
        """Set user facts from list of {id, fact, weight}."""
        self.user_facts = json.dumps(facts, ensure_ascii=False)
    
    def get_user_facts_formatted(self) -> str:
        """Get user facts formatted for prompts with [USER-X] citations."""
        facts = self.get_user_facts()
        if not facts:
            return ""
        
        lines = ["=== FAKTY BAZOWE (podane przez użytkownika - 100% pewności) ==="]
        for f in facts:
            lines.append(f"[USER-{f['id']}] {f['fact']} (waga: {f['weight']})")
        return "\n".join(lines)
    
    def get_final_report(self) -> Optional[dict]:
        if not self.final_report:
            return None
        return json.loads(self.final_report)
