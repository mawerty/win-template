import { useState, useEffect } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { 
  ChevronDown, 
  ChevronRight, 
  FileText, 
  Globe, 
  Building2, 
  Link2, 
  BookOpen,
  Flag,
  Layers,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ArticleNode {
  id: number;
  url: string;
  title: string;
  domain: string;
}

interface CountryNode {
  name: string;
  articles: ArticleNode[];
  articleCount: number;
}

interface TopicNode {
  id: number;
  name: string;
  weight: number;
  has_synthesis: boolean;
  has_urls: boolean;
  countries?: string[];
}

interface AnalysisTreeNavProps {
  sessionId: number;
  sessionName?: string;
  topics: TopicNode[];
  currentTopicId?: number;
  currentCountry?: string;
  currentArticleId?: number;
  onTopicSelect?: (topicId: number) => void;
  onCountrySelect?: (country: string) => void;
  onArticleSelect?: (articleId: number) => void;
  hasReport?: boolean;
}

export function AnalysisTreeNav({
  sessionId,
  sessionName = "Raport",
  topics,
  currentTopicId,
  currentCountry,
  currentArticleId,
  onTopicSelect,
  onCountrySelect,
  onArticleSelect,
  hasReport = false,
}: AnalysisTreeNavProps) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const urlCountry = searchParams.get("country");
  
  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set());
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [topicDetails, setTopicDetails] = useState<Record<number, { countries: CountryNode[] }>>({});

  // Auto-expand current topic and country
  useEffect(() => {
    if (currentTopicId) {
      setExpandedTopics(prev => new Set([...prev, currentTopicId]));
    }
  }, [currentTopicId]);

  useEffect(() => {
    const country = currentCountry || urlCountry;
    if (country && currentTopicId) {
      setExpandedCountries(prev => new Set([...prev, `${currentTopicId}-${country}`]));
    }
  }, [currentCountry, urlCountry, currentTopicId]);

  // Load country and article details for expanded topics
  useEffect(() => {
    const loadTopicDetails = async (topicId: number) => {
      if (topicDetails[topicId]) return;
      try {
        const [synthRes, summariesRes] = await Promise.all([
          fetch(`/api/topics/${topicId}/synthesis`),
          fetch(`/api/topics/${topicId}/cached-summaries`),
        ]);
        
        const countries: CountryNode[] = [];
        
        if (synthRes.ok) {
          const synthData = await synthRes.json();
          const countrySummaries = synthData.country_summaries || [];
          
          // Get articles for each country from cached summaries
          let articlesByCountry: Record<string, ArticleNode[]> = {};
          if (summariesRes.ok) {
            const summariesData = await summariesRes.json();
            articlesByCountry = {};
            for (const [country, articles] of Object.entries(summariesData.by_source || {})) {
              articlesByCountry[country] = (articles as any[]).map(a => ({
                id: a.id,
                url: a.url,
                title: a.title || a.domain,
                domain: a.domain,
              }));
            }
          }
          
          for (const cs of countrySummaries) {
            countries.push({
              name: cs.country,
              articles: articlesByCountry[cs.country] || [],
              articleCount: cs.sources?.length || 0,
            });
          }
        }
        
        setTopicDetails(prev => ({ ...prev, [topicId]: { countries } }));
      } catch {
        // ignore
      }
    };

    for (const topicId of expandedTopics) {
      loadTopicDetails(topicId);
    }
  }, [expandedTopics]);

  const toggleTopic = (topicId: number) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  };

  const toggleCountry = (topicId: number, country: string) => {
    const key = `${topicId}-${country}`;
    setExpandedCountries(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const isSessionPage = location.pathname === `/session/${sessionId}`;
  const activeCountry = currentCountry || urlCountry;

  const getWeightColor = (weight: number) => {
    if (weight >= 80) return "bg-red-500";
    if (weight >= 60) return "bg-orange-500";
    if (weight >= 40) return "bg-yellow-500";
    return "bg-slate-500";
  };

  return (
    <div className="w-72 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <h3 className="text-sm font-medium text-slate-300 truncate">
          {sessionName}
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          {topics.length} tematów
        </p>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-2 text-[11px]">
        {/* Main Session/Report Link - Always visible */}
        <Link
          to={`/session/${sessionId}`}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 transition-colors border-b border-slate-800 mb-1",
            isSessionPage
              ? "bg-gradient-to-r from-violet-500/20 to-purple-500/20 text-violet-300 border-r-2 border-violet-500"
              : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
          )}
        >
          <div className="flex items-center gap-2 flex-1">
            <span className="text-lg">📊</span>
            <div>
              <div className="font-medium text-xs">
                {hasReport ? "Raport Końcowy" : "Analiza Scenariuszy"}
              </div>
              <div className="text-[10px] text-slate-500">
                Główny widok
              </div>
            </div>
          </div>
          {hasReport && (
            <span className="text-[9px] bg-violet-500/30 text-violet-300 px-1.5 py-0.5 rounded">
              ✓
            </span>
          )}
        </Link>

        {/* Topics Header */}
        <div className="flex items-center gap-2 px-4 py-2 text-[10px] font-medium text-slate-500 uppercase tracking-wider">
          <Layers className="h-3 w-3" />
          Tematy ({topics.length})
        </div>

        {/* Topics */}
        <div className="space-y-0.5">
          {topics.map((topic) => {
            const isExpanded = expandedTopics.has(topic.id);
            const isCurrent = currentTopicId === topic.id;
            const countries = topicDetails[topic.id]?.countries || [];

            return (
              <div key={topic.id}>
                {/* Topic Row */}
                <div
                  className={cn(
                    "flex items-center gap-1 px-2 py-1.5 transition-colors group",
                    isCurrent && !activeCountry
                      ? "bg-emerald-500/20 border-r-2 border-emerald-500"
                      : isCurrent
                      ? "bg-emerald-500/10"
                      : "hover:bg-slate-800"
                  )}
                >
                  {/* Expand/Collapse */}
                  <button
                    onClick={() => toggleTopic(topic.id)}
                    className="p-0.5 text-slate-500 hover:text-slate-300 rounded"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>

                  {/* Weight indicator */}
                  <div
                    className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", getWeightColor(topic.weight))}
                    title={`Waga: ${topic.weight}`}
                  />

                  {/* Topic Link */}
                  <Link
                    to={`/topic/${topic.id}`}
                    onClick={() => onTopicSelect?.(topic.id)}
                    className={cn(
                      "flex-1 truncate",
                      isCurrent ? "text-emerald-200 font-medium" : "text-slate-300 group-hover:text-slate-100"
                    )}
                    title={topic.name}
                  >
                    {topic.name}
                  </Link>

                  {/* Status Icons */}
                  <div className="flex items-center gap-0.5 opacity-60">
                    {topic.has_urls && (
                      <Link2 className="h-2.5 w-2.5 text-emerald-400" title="Ma URLe" />
                    )}
                    {topic.has_synthesis && (
                      <BookOpen className="h-2.5 w-2.5 text-violet-400" title="Ma syntezę" />
                    )}
                  </div>
                </div>

                {/* Expanded Countries */}
                {isExpanded && countries.length > 0 && (
                  <div className="ml-4 border-l border-slate-800/50">
                    {countries.map((country) => {
                      const countryKey = `${topic.id}-${country.name}`;
                      const isCountryExpanded = expandedCountries.has(countryKey);
                      const isCountryCurrent = isCurrent && activeCountry === country.name;
                      
                      return (
                        <div key={country.name}>
                          {/* Country Row */}
                          <div
                            className={cn(
                              "flex items-center gap-1 px-2 py-1 transition-colors group",
                              isCountryCurrent
                                ? "bg-orange-500/20 border-r-2 border-orange-500"
                                : "hover:bg-slate-800/50"
                            )}
                          >
                            {/* Expand/Collapse */}
                            {country.articles.length > 0 ? (
                              <button
                                onClick={() => toggleCountry(topic.id, country.name)}
                                className="p-0.5 text-slate-600 hover:text-slate-400 rounded"
                              >
                                {isCountryExpanded ? (
                                  <ChevronDown className="h-2.5 w-2.5" />
                                ) : (
                                  <ChevronRight className="h-2.5 w-2.5" />
                                )}
                              </button>
                            ) : (
                              <span className="w-4" />
                            )}

                            {/* Country Link */}
                            <Link
                              to={`/topic/${topic.id}?country=${encodeURIComponent(country.name)}`}
                              onClick={() => onCountrySelect?.(country.name)}
                              className={cn(
                                "flex-1 flex items-center gap-1.5 truncate",
                                isCountryCurrent
                                  ? "text-orange-200 font-medium"
                                  : "text-slate-500 group-hover:text-slate-300"
                              )}
                            >
                              <span>{getCountryFlag(country.name)}</span>
                              <span className="truncate">{country.name}</span>
                              <span className="text-slate-600 text-[9px]">
                                ({country.articleCount})
                              </span>
                            </Link>
                          </div>

                          {/* Expanded Articles */}
                          {isCountryExpanded && country.articles.length > 0 && (
                            <div className="ml-4 border-l border-slate-800/30">
                              {country.articles.slice(0, 5).map((article) => (
                                <Link
                                  key={article.id}
                                  to={`/topic/${topic.id}?country=${encodeURIComponent(country.name)}&article=${article.id}`}
                                  onClick={() => onArticleSelect?.(article.id)}
                                  className={cn(
                                    "flex items-center gap-1.5 px-2 py-0.5 transition-colors group/article",
                                    currentArticleId === article.id
                                      ? "bg-blue-500/20 text-blue-300 border-r border-blue-500"
                                      : "text-slate-600 hover:text-slate-400 hover:bg-slate-800/30"
                                  )}
                                  title={article.title}
                                >
                                  <FileText className="h-2 w-2 flex-shrink-0 opacity-50" />
                                  <span className="truncate text-[10px]">
                                    {article.title || article.domain}
                                  </span>
                                </Link>
                              ))}
                              {country.articles.length > 5 && (
                                <Link 
                                  to={`/topic/${topic.id}?country=${encodeURIComponent(country.name)}`}
                                  className="block px-2 py-0.5 text-[9px] text-slate-500 hover:text-slate-400 italic"
                                >
                                  +{country.articles.length - 5} więcej →
                                </Link>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Placeholder when expanded but no countries yet */}
                {isExpanded && countries.length === 0 && (
                  <div className="ml-4 border-l border-slate-800 px-3 py-1 text-[10px] text-slate-600 italic">
                    Brak danych krajów
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-800 space-y-2">
        <Link
          to="/"
          className="flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 rounded transition-colors"
        >
          <Globe className="h-3 w-3" />
          Wszystkie analizy
        </Link>
      </div>
    </div>
  );
}

// Helper function to get country flags
function getCountryFlag(country: string): string {
  const flags: Record<string, string> = {
    "USA": "🇺🇸",
    "Germany": "🇩🇪",
    "France": "🇫🇷",
    "UK": "🇬🇧",
    "China": "🇨🇳",
    "Russia": "🇷🇺",
    "India": "🇮🇳",
    "Saudi Arabia": "🇸🇦",
    "European Commission": "🇪🇺",
    "NATO": "🔵",
    "OECD": "🏛️",
    "CSIS": "🔬",
    "UN": "🌐",
    "Atlantic Council": "🌊",
    "Chatham House": "🏠",
    "ECFR": "🇪🇺",
    "Kiel Institute": "📊",
    "IISS": "🔒",
  };
  return flags[country] || "🌍";
}

export default AnalysisTreeNav;

