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
  population: "28 mln",
  geography: "Dostęp do Morza Bałtyckiego, kilka dużych żeglownych rzek, ograniczone zasoby wody pitnej",
  climate: "Umiarkowany",
  economy: "Przemysł ciężki, motoryzacyjny, spożywczy, chemiczny, ICT. Ambicje w zakresie OZE, przetwarzania surowców krytycznych oraz budowy ponadnarodowej infrastruktury AI (big data centers, giga fabryki AI, komputery kwantowe)",
  army: "150 tys. zawodowych żołnierzy",
  digitalization: "Powyżej średniej europejskiej",
  currency: "Waluta inna niż euro",
  key_relations: "Niemcy, Francja, Finlandia, Ukraina, USA, Japonia",
  political_threats: "Niestabilność w UE, rozpad UE na grupy różnych prędkości, negatywna kampania wizerunkowa ze strony aktorów państwowych, zakłócenia w dostawach paliw węglowodorowych, narażenie na embargo procesorów",
  military_threats: "Zagrożenie atakiem zbrojnym sąsiada, ataki hybrydowe na infrastrukturę krytyczną i cyberprzestrzeń",
  milestones: "Demokracja parlamentarna od 130 lat, stagnacja 1930-1950 i 1980-1990, członkostwo UE i NATO od 1997, 25. gospodarka świata wg PKB od 2020, deficyt i dług publiczny w okolicach średniej unijnej",
};

export const DEFAULT_SITUATION = `a) Wskutek zaistniałej przed miesiącem katastrofy naturalnej wiodący światowy producent procesorów graficznych stracił 60% zdolności produkcyjnych; odbudowa mocy produkcyjnych poprzez inwestycje w filie zlokalizowane na obszarach nieobjętych katastrofą potrwa do końca roku 2028 (waga istotności: 30)

b) Przemysł motoryzacyjny w Europie (piątka głównych partnerów handlowy państwa Atlantis to kraje europejskie) bardzo wolno przestawia się na produkcję samochodów elektrycznych; rynek europejski zalewają tanie samochody elektryczne z Azji Wschodniej; europejski przemysł motoryzacyjny będzie miał w roku 2025 zyski na poziomie 30% średnich rocznych zysków z lat 2020-2024 (waga istotności: 15)

c) PKB krajów strefy euro w roku 2025 spadnie średnio o 1,5% w stosunku do roku 2024 (waga istotności: 15)

d) Na wschodzie Ukrainy trwa słaby rozejm; Rosja kontroluje dwie główne elektrownie ukraińskie, które pracują na potrzeby konsumentów rosyjskich; gospodarka ukraińska rozwija się w tempie 4% PKB, głównie dzięki inwestycjom w przemysł zbrojeniowy i odbudowę infrastruktury (waga istotności: 10)

e) Inwestycje amerykańskie w Ukrainie kierowane są do przemysłu wydobywczego (surowce krytyczne); roczne inwestycje UE w Ukrainie są na poziomie 3% ukraińskiego PKB i utrzymają się na takim poziomie do roku 2029 (waga istotności: 5)

f) Mamy gwałtowny wzrost udziału energii z OZE w miksie energetycznym krajów UE oraz Chin od początku roku 2028; w połowie roku 2023 średniej wielkości kraj południowoamerykański odkrył ogromne i łatwe do eksploatacji złoża ropy naftowej i gazu ziemnego dorównujące wielkością złożom Arabii Saudyjskiej i Kataru, co przełoży się pod koniec roku 2027 na nadpodaż tych paliw na światowe rynki; wzrost podaży energii z OZE oraz nadpodaż paliw węglowodorowych przekładają się na znaczny spadek cen ropy: do poziomu 30-35 USD za baryłkę; będzie to miało wpływ na budżet Rosji oraz (w mniejszym stopniu) innych krajów producentów ropy i paliw ropopochodnych (waga istotności: 25)`;

