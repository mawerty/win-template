export interface CountryProfile {
  name: string;
  population: string;
  geography: string;
  climate: string;
  economy: string;
  army: string;
  digitalization: string;
  currency: string;
  key_relations: string;
  political_threats: string;
  military_threats: string;
  milestones: string;
}

export interface Topic {
  id: number;
  name: string;
  keywords: string[];
  weight: number;      // 1-100, higher = more important
  rationale: string;   // Why this topic is relevant
  situation_factor?: string; // Which situation factor (a/b/c/d/e/f) this relates to
  selected: boolean;
  has_cached_urls?: boolean;
  urls_cached_at?: string | null;
  synthesis?: string | null;  // AI-generated synthesis
  synthesis_generated_at?: string | null;
}

export interface ReasoningStep {
  fact: string;
  source_weight: number;
  inference: string;
  impact: "positive" | "negative" | "neutral";
  confidence: "high" | "medium" | "low";
}

export interface Scenario {
  id: number;
  timeframe: "12_months" | "36_months" | "backcast";
  variant: "positive" | "negative" | "target";
  content: string;
  chain_of_thought: string;
  reasoning_steps?: ReasoningStep[];
  created_at?: string;
  version?: number;
}

// Backcast specific types
export interface BackcastStep {
  year: number;
  state: string;
  prerequisites_met?: string[];
  actions_required?: string[];
  key_milestones?: string[];
  immediate_actions?: string[];
  critical_path?: string;
  reasoning?: string;
}

export interface FeasibilityAssessment {
  score: number;
  main_obstacles: string[];
  enablers: string[];
  recommendation: string;
}

export interface BackcastData {
  target_state: string;
  target_year: number;
  analysis_type: "backcast";
  backcast_steps: BackcastStep[];
  feasibility_assessment: FeasibilityAssessment;
  chain_of_thought: string;
}

export interface SourceQuery {
  country?: string;
  institution?: string;
  category?: string;
  domain: string;
  keyword: string;
  search_query: string;
  google_url: string;
}

export interface TopicSources {
  ministries: SourceQuery[];
  institutions: SourceQuery[];
  selection_reasoning?: string;
}

export interface TopicWithSources {
  name: string;
  keywords: string[];
  weight?: number;
  sources: TopicSources;
  sources_count: {
    ministries: number;
    institutions: number;
    total: number;
  };
  fetched_urls?: FetchedUrls;
}

export interface FetchedUrl {
  url: string;
  title?: string;
  snippet?: string;
  domain: string;
  source_type: "ministry" | "institution";
  country?: string;
  institution?: string;
  category?: string;
  keyword: string;
  search_query: string;
  is_search_url?: boolean;
}

export interface FetchedUrls {
  by_country: Record<string, FetchedUrl[]>;
  by_institution: Record<string, FetchedUrl[]>;
  all_urls: FetchedUrl[];
  stats: {
    total_urls: number;
    countries: number;
    institutions: number;
  };
}

export type AnalysisMode = "forecast" | "backcast";

// User-provided ground truth facts from situation description
export interface UserFact {
  id: string;  // "a", "b", "c"...
  fact: string;
  weight: number;
}

export interface AnalysisSession {
  id: number;
  name: string;
  country_profile: CountryProfile;
  situation_description: string;
  created_at: string;
  current_scenario_version: number;
  topics: Topic[];
  scenarios: Scenario[];
  
  // Analysis mode: "forecast" (default) or "backcast"
  analysis_mode: AnalysisMode;
  
  // Backcasting fields - only used when analysis_mode == "backcast"
  backcast_target_state?: string;
  backcast_target_year?: number;
  
  // User-provided ground truth facts with [USER-a], [USER-b] citations
  user_facts?: UserFact[];
}

export interface RecentTopic {
  id: number;
  name: string;
  weight: number;
  selected: boolean;
  has_synthesis: boolean;
  has_cached_urls: boolean;
}

export interface GlobalRecentTopic extends RecentTopic {
  session_id: number;
  session_name: string;
}

export interface SessionListItem {
  id: number;
  name: string;
  created_at: string;
  topics_count: number;
  scenarios_count: number;
  has_scenarios: boolean;
  selected_topics_count: number;
  recent_topics: RecentTopic[];
  analysis_mode: AnalysisMode;
  backcast_target_state?: string;
  backcast_target_year?: number;
}

// Default Atlantis profile
export const DEFAULT_COUNTRY_PROFILE: CountryProfile = {
  name: "Atlantis",
  population: "28 million",
  geography: "Access to the Baltic Sea, several large navigable rivers, limited freshwater resources",
  climate: "Temperate",
  economy: "Heavy industry, automotive, food, chemical, ICT. Ambitions in renewable energy, critical raw materials processing, and building transnational AI infrastructure (big data centers, giga AI factories, quantum computers)",
  army: "150,000 professional soldiers",
  digitalization: "Above European average",
  currency: "Currency other than euro",
  key_relations: "Germany, France, Finland, Ukraine, USA, Japan",
  political_threats: "EU instability, EU fragmentation into multi-speed groups, negative image campaigns from state actors, disruptions in hydrocarbon fuel supplies, exposure to processor embargoes",
  military_threats: "Threat of armed attack from neighbor, hybrid attacks on critical infrastructure and cyberspace",
  milestones: "Parliamentary democracy for 130 years, stagnation 1930-1950 and 1980-1990, EU and NATO membership since 1997, 25th world economy by GDP since 2020, deficit and public debt around EU average",
};

export const DEFAULT_SITUATION = `a) Due to a natural disaster that occurred a month ago, the world's leading GPU manufacturer lost 60% of production capacity; rebuilding production capacity through investments in subsidiaries located in areas unaffected by the disaster will take until the end of 2028 (importance weight: 30)

b) The automotive industry in Europe (the top five trading partners of Atlantis are European countries) is very slow to shift to electric vehicle production; the European market is being flooded with cheap electric vehicles from East Asia; the European automotive industry will have profits at 30% of average annual profits from 2020-2024 in 2025 (importance weight: 15)

c) Eurozone countries' GDP will fall by an average of 1.5% in 2025 compared to 2024 (importance weight: 15)

d) A fragile ceasefire continues in eastern Ukraine; Russia controls two major Ukrainian power plants that operate for Russian consumers; the Ukrainian economy is growing at 4% GDP, mainly due to investments in the defense industry and infrastructure reconstruction (importance weight: 10)

e) US investments in Ukraine are directed to the mining industry (critical raw materials); annual EU investments in Ukraine are at 3% of Ukrainian GDP and will remain at this level until 2029 (importance weight: 5)

f) There is a sharp increase in the share of renewable energy in the energy mix of EU and China from early 2028; in mid-2023, a medium-sized South American country discovered huge and easily exploitable oil and natural gas deposits matching the size of Saudi Arabia and Qatar, which will translate into oversupply of these fuels on world markets by the end of 2027; the increase in renewable energy supply and oversupply of hydrocarbons translates into a significant drop in oil prices: to 30-35 USD per barrel; this will impact Russia's budget and (to a lesser extent) other oil and petroleum product producer countries (importance weight: 25)`;

export const DEFAULT_CRITERIA = `The interests of the state of Atlantis`;

