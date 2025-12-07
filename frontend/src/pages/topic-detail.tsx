import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  Loader2, 
  ExternalLink,
  RefreshCw,
  Globe,
  Building2,
  Search,
  FileText,
  Brain,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Link2,
  BookOpen,
  X,
  Flag,
  Layers,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FetchedUrl } from "@/types/analysis";
import { AnalysisTreeNav } from "@/components/AnalysisTreeNav";
import { EvolutionHistory } from "@/components/EvolutionHistory";

interface ArticleSummary {
  id: number;
  url: string;
  domain: string;
  title: string;
  source_country: string;
  summary: string;
  key_facts: string[];
}

interface CountrySource {
  number: number;
  url: string;
  title: string;
  domain: string;
}

interface CountrySummary {
  country: string;
  summary: string;
  sources: CountrySource[];
  evolution?: EvolutionData | null;
}

interface EvolutionData {
  initial_score: number;
  final_score: number;
  improvement: number;
  iterations: number;
  history: Array<{
    iteration: number;
    score: number;
    scores: Record<string, number>;
    feedback: string;
    content: string;
  }>;
}

interface TopicData {
  id: number;
  name: string;
  keywords: string[];
  weight: number;
  rationale: string;
  session_id: number;
  fetched_urls?: {
    by_country: Record<string, FetchedUrl[]>;
    by_institution: Record<string, FetchedUrl[]>;
    all_urls: FetchedUrl[];
    stats: { total_urls: number; countries: number; institutions: number };
  };
}

interface SessionTopicInfo {
  id: number;
  name: string;
  weight: number;
  has_synthesis: boolean;
  has_urls: boolean;
  countries?: string[];
}

interface ArticlesData {
  by_source: Record<string, ArticleSummary[]>;
  all_summaries: ArticleSummary[];
  articles_processed: number;
  sources_count: number;
}

export default function TopicDetailPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightCountry = searchParams.get("country");
  
  const [topic, setTopic] = useState<TopicData | null>(null);
  const [articlesData, setArticlesData] = useState<ArticlesData | null>(null);
  const [countrySummaries, setCountrySummaries] = useState<CountrySummary[]>([]);
  const [synthesisText, setSynthesisText] = useState<string>("");
  const [synthesisEvolution, setSynthesisEvolution] = useState<EvolutionData | null>(null);
  
  // Session navigation state
  const [sessionTopics, setSessionTopics] = useState<SessionTopicInfo[]>([]);
  const [sessionName, setSessionName] = useState<string>("");
  const [hasReport, setHasReport] = useState(false);
  const [userFacts, setUserFacts] = useState<Array<{id: string; fact: string; weight: number}>>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingCountries, setIsGeneratingCountries] = useState(false);
  const [isGeneratingSynthesis, setIsGeneratingSynthesis] = useState(false);
  const [activeTab, setActiveTab] = useState<"urls" | "countries" | "synthesis">("urls");
  const [selectedArticle, setSelectedArticle] = useState<ArticleSummary | null>(null);
  
  // For article-specific view
  const articleId = searchParams.get("article");

  useEffect(() => {
    if (topicId) {
      // Reset state when topic changes
      setCountrySummaries([]);
      setSynthesisText("");
      setSynthesisEvolution(null);
      setArticlesData(null);
      setSelectedArticle(null);
      loadTopic(Number.parseInt(topicId));
    }
  }, [topicId]);
  
  // Auto-select tab based on URL params and data
  useEffect(() => {
    if (highlightCountry && countrySummaries.length > 0) {
      // If country is specified in URL, show countries tab
      setActiveTab("countries");
    } else if (!highlightCountry && synthesisText) {
      // If no country param and we have synthesis, show synthesis
      setActiveTab("synthesis");
    } else if (!highlightCountry && countrySummaries.length > 0) {
      // If no country param but we have country summaries, show countries
      setActiveTab("countries");
    }
  }, [highlightCountry, countrySummaries, synthesisText]);
  
  // Handle article selection from URL - clear when no articleId
  useEffect(() => {
    if (articleId && articlesData?.all_summaries) {
      const article = articlesData.all_summaries.find(a => a.id === Number(articleId));
      if (article) {
        setSelectedArticle(article);
      }
    } else {
      // Clear selected article when articleId is removed from URL
      setSelectedArticle(null);
    }
  }, [articleId, articlesData]);

  const loadTopic = async (id: number) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/topics/${id}`);
      if (!response.ok) throw new Error("Topic not found");
      const data = await response.json();
      setTopic(data);
      
      // Load cached data and session info in parallel
      const [summariesRes, synthRes, sessionRes] = await Promise.all([
        fetch(`/api/topics/${id}/cached-summaries`).catch(() => null),
        fetch(`/api/topics/${id}/synthesis`).catch(() => null),
        data.session_id ? fetch(`/api/sessions/${data.session_id}`).catch(() => null) : Promise.resolve(null),
      ]);
      
      let hasSummaries = false;
      let hasCountries = false;
      let hasSynthesis = false;
      
      if (summariesRes?.ok) {
        const summariesData = await summariesRes.json();
        if (summariesData.has_summaries) {
          setArticlesData(summariesData);
          hasSummaries = true;
        }
      }
      
      if (synthRes?.ok) {
        const synthData = await synthRes.json();
        if (synthData.has_synthesis || synthData.country_summaries?.length > 0) {
          setCountrySummaries(synthData.country_summaries || []);
          setSynthesisText(synthData.synthesis || "");
          setSynthesisEvolution(synthData.evolution || null);
          hasCountries = synthData.country_summaries?.length > 0;
          hasSynthesis = !!synthData.synthesis;
        }
      }
      
      // Load session info for sidebar
      if (sessionRes?.ok) {
        const sessionData = await sessionRes.json();
        setSessionName(sessionData.name || `Sesja #${data.session_id}`);
        setHasReport(!!sessionData.final_report);
        
        // Map session topics for the tree nav
        const topicsList: SessionTopicInfo[] = sessionData.topics?.map((t: any) => ({
          id: t.id,
          name: t.name,
          weight: t.weight,
          has_synthesis: !!t.synthesis,
          has_urls: !!t.has_cached_urls,
        })) || [];
        setSessionTopics(topicsList);
        
        // Load user facts (ground truth) from session
        if (sessionData.user_facts) {
          try {
            const facts = typeof sessionData.user_facts === 'string' 
              ? JSON.parse(sessionData.user_facts) 
              : sessionData.user_facts;
            setUserFacts(facts);
          } catch {
            setUserFacts([]);
          }
        }
      }
      
      // Auto-select tab
      if (hasSynthesis) setActiveTab("synthesis");
      else if (hasCountries) setActiveTab("countries");
      else if (data.fetched_urls?.all_urls?.length > 0) setActiveTab("urls");
      
    } catch (error) {
      console.error("Error loading topic:", error);
      toast.error("Unable to load topic");
      navigate("/");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchUrls = async (forceRefresh = false) => {
    if (!topicId) return;
    setIsFetching(true);
    try {
      const url = forceRefresh 
        ? `/api/topics/${topicId}/fetch-urls?force_refresh=true`
        : `/api/topics/${topicId}/fetch-urls`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed");
      const data = await response.json();
      setTopic(prev => prev ? { ...prev, ...data } : data);
      toast.success(`Fetched ${data.fetched_urls?.stats?.total_urls || 0} URLs!`);
    } catch {
      toast.error("Error fetching URLs");
    } finally {
      setIsFetching(false);
    }
  };

  const handleProcessArticles = async () => {
    if (!topicId) return;
    setIsProcessing(true);
    try {
      const response = await fetch(
        `/api/topics/${topicId}/process-articles?max_articles=30&max_per_source=4`, 
        { method: "POST" }
      );
      if (!response.ok) throw new Error("Failed");
      const data = await response.json();
      setArticlesData(data);
      toast.success(`Processed ${data.articles_processed} articles!`);
    } catch {
      toast.error("Error processing articles");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateCountrySummaries = async (forceRefresh = false) => {
    if (!topicId) return;
    setIsGeneratingCountries(true);
    try {
      const url = forceRefresh 
        ? `/api/topics/${topicId}/generate-country-summaries?force_refresh=true`
        : `/api/topics/${topicId}/generate-country-summaries`;
      const response = await fetch(url, { method: "POST" });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed");
      }
      
      const data = await response.json();
      setCountrySummaries(data.country_summaries);
      setActiveTab("countries");
      toast.success(`Generated summaries for ${data.countries_count} countries!`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error";
      toast.error(msg);
    } finally {
      setIsGeneratingCountries(false);
    }
  };

  const handleGenerateSynthesis = async (forceRefresh = false) => {
    if (!topicId) return;
    setIsGeneratingSynthesis(true);
    try {
      const url = forceRefresh 
        ? `/api/topics/${topicId}/generate-synthesis?force_refresh=true`
        : `/api/topics/${topicId}/generate-synthesis`;
      const response = await fetch(url, { method: "POST" });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed");
      }
      
      const data = await response.json();
      setSynthesisText(data.synthesis);
      setSynthesisEvolution(data.evolution || null);
      setActiveTab("synthesis");
      toast.success("Synthesis generated!");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error";
      toast.error(msg);
    } finally {
      setIsGeneratingSynthesis(false);
    }
  };

  // Reset handlers
  const handleResetAll = async () => {
    if (!topicId || !confirm("Are you sure you want to reset ALL data for this topic?")) return;
    try {
      const response = await fetch(`/api/topics/${topicId}/reset-all`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed");
      // Clear all local state
      setTopic(prev => prev ? { ...prev, fetched_urls: undefined } : prev);
      setArticlesData(null);
      setCountrySummaries([]);
      setSynthesisText("");
      setSynthesisEvolution(null);
      setActiveTab("urls");
      toast.success("Zresetowano wszystkie dane!");
    } catch {
      toast.error("Reset error");
    }
  };

  const handleResetUrls = async () => {
    if (!topicId || !confirm("Zresetować linki?")) return;
    try {
      await fetch(`/api/topics/${topicId}/reset-urls`, { method: "DELETE" });
      setTopic(prev => prev ? { ...prev, fetched_urls: undefined } : prev);
      toast.success("Linki zresetowane!");
    } catch {
      toast.error("Error");
    }
  };

  const handleResetSummaries = async () => {
    if (!topicId || !confirm("Reset article summaries?")) return;
    try {
      await fetch(`/api/topics/${topicId}/reset-summaries`, { method: "DELETE" });
      setArticlesData(null);
      toast.success("Streszczenia zresetowane!");
    } catch {
      toast.error("Error");
    }
  };

  const handleResetCountries = async () => {
    if (!topicId || !confirm("Reset country summaries?")) return;
    try {
      await fetch(`/api/topics/${topicId}/reset-countries`, { method: "DELETE" });
      setCountrySummaries([]);
      toast.success("Country summaries reset!");
    } catch {
      toast.error("Error");
    }
  };

  const handleResetSynthesis = async () => {
    if (!topicId || !confirm("Zresetować syntezę?")) return;
    try {
      await fetch(`/api/topics/${topicId}/reset-synthesis`, { method: "DELETE" });
      setSynthesisText("");
      setSynthesisEvolution(null);
      toast.success("Synteza zresetowana!");
    } catch {
      toast.error("Error");
    }
  };

  const findArticle = (url: string) => articlesData?.all_summaries?.find(a => a.url === url);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!topic) return null;

  const hasUrls = topic.fetched_urls && topic.fetched_urls.all_urls?.length > 0;
  const hasArticles = articlesData && articlesData.articles_processed > 0;
  const hasCountrySummaries = countrySummaries.length > 0;
  const hasSynthesis = !!synthesisText;
  const isAnyLoading = isFetching || isProcessing || isGeneratingCountries || isGeneratingSynthesis;

  return (
    <div className="min-h-screen bg-slate-900 flex">
      {/* Sidebar */}
      {topic.session_id && sessionTopics.length > 0 && (
        <AnalysisTreeNav
          sessionId={topic.session_id}
          sessionName={sessionName}
          topics={sessionTopics}
          currentTopicId={topic.id}
          currentCountry={highlightCountry || undefined}
          currentArticleId={articleId ? Number(articleId) : undefined}
          hasReport={hasReport}
        />
      )}
      
      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          {/* Article View - Inline when selected via URL */}
          {selectedArticle && articleId && (
            <Card className="border-blue-500/50 bg-blue-500/5 mb-6">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                      <CountryFlag country={selectedArticle.source_country} />
                      {selectedArticle.source_country}
                      <span>•</span>
                      <span>{selectedArticle.domain}</span>
                    </div>
                    <CardTitle className="text-lg text-slate-100">
                      {selectedArticle.title || selectedArticle.domain}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={selectedArticle.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <Link
                      to={highlightCountry ? `/topic/${topicId}?country=${encodeURIComponent(highlightCountry)}` : `/topic/${topicId}`}
                      className="text-slate-400 hover:text-slate-200"
                    >
                      <X className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="prose prose-invert prose-sm max-w-none">
                  <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {selectedArticle.summary}
                  </p>
                </div>
                {selectedArticle.key_facts && selectedArticle.key_facts.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <h4 className="text-sm font-medium text-slate-300 mb-2">Key facts:</h4>
                    <ul className="space-y-1">
                      {selectedArticle.key_facts.map((fact, i) => (
                        <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                          <span className="text-emerald-400 mt-0.5">•</span>
                          {fact}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <a
                    href={selectedArticle.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {selectedArticle.url}
                  </a>
                </div>
              </CardContent>
            </Card>
          )}
          

          {/* Back */}
          <Button
            variant="ghost"
            onClick={() => topic.session_id ? navigate(`/session/${topic.session_id}`) : navigate(-1)}
            className="text-slate-400 hover:text-slate-100 mb-6"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {topic.session_id ? "Back to session" : "Back"}
          </Button>

          {/* Topic Info */}
          <Card className="border-slate-700 bg-slate-800/50 mb-6">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl text-slate-100">{topic.name}</CardTitle>
              <CardDescription className="mt-2">{topic.rationale}</CardDescription>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-violet-400">{topic.weight}</div>
              <div className="text-xs text-slate-500">weight</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Keywords */}
          <div className="flex flex-wrap gap-2 mb-4">
            {topic.keywords.map((kw, i) => (
              <span key={i} className="px-2 py-1 text-xs bg-slate-700 text-slate-200 rounded">
                {kw}
              </span>
            ))}
          </div>
          
          
          {/* Stats */}
          {(hasUrls || hasArticles || hasCountrySummaries) && (
            <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
              {hasUrls && <span className="flex items-center gap-1"><Link2 className="h-3 w-3" />{topic.fetched_urls?.stats.total_urls} URLs</span>}
              {hasArticles && <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{articlesData.articles_processed} articles</span>}
              {hasCountrySummaries && <span className="flex items-center gap-1 text-orange-400"><Flag className="h-3 w-3" />{countrySummaries.length} countries</span>}
              {hasSynthesis && <span className="flex items-center gap-1 text-violet-400"><Sparkles className="h-3 w-3" />Synthesis ✓</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      {(hasUrls || hasCountrySummaries || hasSynthesis) && (
        <div className="flex gap-2 mb-4">
          <Button 
            variant={activeTab === "urls" ? "default" : "outline"} 
            onClick={() => setActiveTab("urls")} 
            size="sm" 
            className={activeTab === "urls" ? "bg-slate-700" : "border-slate-600"}
          >
            <Globe className="mr-2 h-4 w-4" />URLs
          </Button>
          <Button 
            variant={activeTab === "countries" ? "default" : "outline"} 
            onClick={() => setActiveTab("countries")} 
            size="sm" 
            className={activeTab === "countries" ? "bg-orange-600" : "border-slate-600"}
          >
            <Flag className="mr-2 h-4 w-4" />Countries {hasCountrySummaries && "✓"}
          </Button>
          <Button 
            variant={activeTab === "synthesis" ? "default" : "outline"} 
            onClick={() => setActiveTab("synthesis")} 
            size="sm" 
            className={activeTab === "synthesis" ? "bg-violet-600" : "border-slate-600"}
          >
            <Sparkles className="mr-2 h-4 w-4" />Synthesis {hasSynthesis && "✓"}
          </Button>
        </div>
      )}

      {/* COUNTRIES TAB - One summary per country */}
      {activeTab === "countries" && (
        <div className="space-y-6">
          {hasCountrySummaries ? (
            <>
              {/* Country filter/navigation */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link 
                    to={`/topic/${topicId}`}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs transition-colors",
                      !highlightCountry 
                        ? "bg-orange-500 text-white" 
                        : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    )}
                  >
                    All ({countrySummaries.length})
                  </Link>
                  {countrySummaries.map((cs) => (
                    <Link
                      key={cs.country}
                      to={`/topic/${topicId}?country=${encodeURIComponent(cs.country)}`}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs transition-colors flex items-center gap-1.5",
                        highlightCountry === cs.country 
                          ? "bg-orange-500 text-white" 
                          : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                      )}
                    >
                      <CountryFlag country={cs.country} />
                      {cs.country}
                    </Link>
                  ))}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleGenerateCountrySummaries(true)}
                  disabled={isGeneratingCountries}
                  className="border-slate-600"
                >
                  <RefreshCw className={cn("h-3 w-3 mr-1", isGeneratingCountries && "animate-spin")} />
                  Refresh
                </Button>
              </div>
              
              {/* Show only selected country or all */}
              {highlightCountry ? (
                // Single country view
                (() => {
                  const selectedCountrySummary = countrySummaries.find(cs => cs.country === highlightCountry);
                  if (!selectedCountrySummary) {
                    return (
                      <Card className="border-slate-700 bg-slate-800/50">
                        <CardContent className="py-8 text-center text-slate-500">
                          Country not found: {highlightCountry}
                        </CardContent>
                      </Card>
                    );
                  }
                  return (
                    <CountrySummaryCard 
                      countrySummary={selectedCountrySummary}
                      topicId={topic?.id}
                      onSourceClick={(source) => {
                        const article = findArticle(source.url);
                        if (article) {
                          navigate(`/topic/${topicId}?country=${encodeURIComponent(highlightCountry!)}&article=${article.id}`);
                        }
                      }}
                      expanded={true}
                    />
                  );
                })()
              ) : (
                // All countries view
                countrySummaries.map((cs) => (
                  <CountrySummaryCard 
                    key={cs.country} 
                    countrySummary={cs}
                    topicId={topic?.id}
                    onSourceClick={(source) => {
                      const article = findArticle(source.url);
                      if (article) {
                        navigate(`/topic/${topicId}?country=${encodeURIComponent(cs.country)}&article=${article.id}`);
                      }
                    }}
                  />
                ))
              )}
            </>
          ) : hasArticles ? (
            <Card className="border-slate-700 bg-slate-800/50">
              <CardContent className="py-12 text-center">
                <Flag className="h-12 w-12 mx-auto mb-4 text-slate-600" />
                <h3 className="text-lg font-medium text-slate-300 mb-2">Ready to generate</h3>
                <p className="text-slate-500 mb-6">
                  You have {articlesData.articles_processed} articles from {articlesData.sources_count} sources.
                </p>
                <Button 
                  onClick={() => handleGenerateCountrySummaries(false)} 
                  disabled={isGeneratingCountries}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  {isGeneratingCountries ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Flag className="mr-2 h-4 w-4" />}
                  Generate country summaries
                </Button>
              </CardContent>
            </Card>
          ) : (
            <EmptyState
              icon={<Brain className="h-12 w-12" />}
              title="No articles"
              description="Najpierw pobierz i streść artykuły."
            />
          )}
        </div>
      )}

      {/* SYNTHESIS TAB - Final synthesis */}
      {activeTab === "synthesis" && (
        <div className="space-y-6">
          {hasSynthesis ? (
            <Card className="border-violet-500/30 bg-slate-800/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-violet-400" />
                    Synteza: {topic.name}
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleGenerateSynthesis(true)} 
                    disabled={isGeneratingSynthesis} 
                    className="border-slate-600"
                  >
                    <RefreshCw className={cn("h-3 w-3", isGeneratingSynthesis && "animate-spin")} />
                  </Button>
                </div>
                <CardDescription>
                  Comparative analysis from {countrySummaries.length} country perspectives
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Main synthesis text */}
                <div className="prose prose-invert prose-sm max-w-none">
                  <SynthesisContent text={synthesisText} countrySummaries={countrySummaries} />
                </div>
                
                {/* Evolution history */}
                <EvolutionHistory 
                  evolution={synthesisEvolution} 
                  title="Synthesis evolution history"
                />
                
                {/* User Facts (Ground Truth) */}
                {userFacts.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-slate-700">
                    <h3 className="text-sm font-semibold text-amber-300 mb-4 flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      Ground Truth Facts
                    </h3>
                    <div className="space-y-2">
                      {userFacts.map((fact) => (
                        <div 
                          key={fact.id}
                          className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20"
                        >
                          <span className="font-mono text-xs bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded font-bold shrink-0">
                            [USER-{fact.id}]
                          </span>
                          <div className="flex-1">
                            <p className="text-sm text-slate-300">{fact.fact}</p>
                            <p className="text-xs text-amber-400/80 mt-1">Waga: {fact.weight}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* All sources by country */}
                <div className="mt-8 pt-6 border-t border-slate-700">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-violet-400" />
                    Sources by country
                  </h3>
                  <div className="space-y-4">
                    {countrySummaries.map((cs) => (
                      <div key={cs.country} className="bg-slate-900/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <CountryFlag country={cs.country} />
                          <span className="font-medium text-slate-200">{cs.country}</span>
                          <span className="text-xs text-slate-500">({cs.sources?.length || 0} źródeł)</span>
                        </div>
                        <div className="space-y-2 pl-6">
                          {cs.sources?.map((source) => (
                            <div 
                              key={source.number}
                              id={`source-${cs.country}-${source.number}`}
                              className="group flex items-start gap-3 p-2 rounded hover:bg-slate-700/50 transition-colors"
                            >
                              <span className="font-mono text-xs bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded font-bold shrink-0 border border-cyan-500/30">
                                [{cs.country}-{source.number}]
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-slate-300">
                                  {source.title || source.domain}
                                </div>
                                <div className="text-xs text-slate-500 truncate mt-0.5">
                                  {source.url}
                                </div>
                              </div>
                              <a 
                                href={source.url} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-slate-500 hover:text-blue-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : hasCountrySummaries ? (
            <Card className="border-slate-700 bg-slate-800/50">
              <CardContent className="py-12 text-center">
                <Layers className="h-12 w-12 mx-auto mb-4 text-slate-600" />
                <h3 className="text-lg font-medium text-slate-300 mb-2">Ready for synthesis</h3>
                <p className="text-slate-500 mb-6">
                  You have summaries from {countrySummaries.length} countries. Generate final synthesis.
                </p>
                <Button 
                  onClick={() => handleGenerateSynthesis(false)} 
                  disabled={isGeneratingSynthesis} 
                  className="bg-gradient-to-r from-violet-500 to-purple-500"
                >
                  {isGeneratingSynthesis ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Generate synthesis
                </Button>
              </CardContent>
            </Card>
          ) : (
            <EmptyState
              icon={<Sparkles className="h-12 w-12" />}
              title="No data"
              description="Generate country summaries first."
            />
          )}
        </div>
      )}

      {/* URLS TAB */}
      {activeTab === "urls" && hasUrls && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <StatCard value={topic.fetched_urls?.stats.total_urls || 0} label="Linków" color="emerald" />
            <StatCard value={topic.fetched_urls?.stats.countries || 0} label="Ministerstw" color="blue" />
            <StatCard value={topic.fetched_urls?.stats.institutions || 0} label="Instytucji" color="violet" />
          </div>

          <p className="text-sm text-slate-400">💡 Linki ze streszczeniem mają zieloną ramkę - kliknij aby zobaczyć</p>

          {topic.fetched_urls?.by_country && Object.keys(topic.fetched_urls.by_country).length > 0 && (
            <Card className="border-slate-700 bg-slate-800/50">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4 text-blue-400" />Ministries</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(topic.fetched_urls.by_country).map(([country, urls]) => (
                    <div key={country}>
                      <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                        <CountryFlag country={country} />{country} <span className="text-xs text-slate-500">({urls.length})</span>
                      </h4>
                      <div className="space-y-1 pl-6">
                        {urls.map((url, i) => (
                          <UrlItem 
                            key={i} 
                            url={url} 
                            article={findArticle(url.url)} 
                            onClick={() => {
                              const a = findArticle(url.url);
                              if (a) {
                                navigate(`/topic/${topicId}?country=${encodeURIComponent(country)}&article=${a.id}`);
                              }
                            }} 
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {topic.fetched_urls?.by_institution && Object.keys(topic.fetched_urls.by_institution).length > 0 && (
            <Card className="border-slate-700 bg-slate-800/50">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-violet-400" />Institutions</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(topic.fetched_urls.by_institution).map(([inst, urls]) => (
                    <div key={inst}>
                      <h4 className="text-sm font-medium text-slate-300 mb-2">{inst} <span className="text-xs text-slate-500">({urls.length})</span></h4>
                      <div className="space-y-1 pl-4">
                        {urls.map((url, i) => (
                          <UrlItem 
                            key={i} 
                            url={url} 
                            article={findArticle(url.url)} 
                            onClick={() => {
                              const a = findArticle(url.url);
                              if (a) {
                                navigate(`/topic/${topicId}?country=${encodeURIComponent(inst)}&article=${a.id}`);
                              }
                            }} 
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

          {!hasUrls && activeTab === "urls" && (
            <EmptyState
              icon={<Search className="h-12 w-12" />}
              title="No URLs"
              description="Fetch URLs from sources."
              action={
                <Button onClick={() => handleFetchUrls(false)} disabled={isFetching} className="bg-emerald-500">
                  {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  Fetch URLs
                </Button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENTS
// ============================================================================

function CountryFlag({ country }: { country: string }) {
  const flags: Record<string, string> = {
    "USA": "🇺🇸", "Germany": "🇩🇪", "France": "🇫🇷", "UK": "🇬🇧",
    "China": "🇨🇳", "Russia": "🇷🇺", "India": "🇮🇳", "Saudi Arabia": "🇸🇦", "EU": "🇪🇺",
    "OECD": "🌐", "NATO": "🛡️", "UN": "🇺🇳", "CSIS": "🏛️", "Chatham House": "🏛️",
    "Atlantic Council": "🏛️", "ECFR": "🏛️",
  };
  return <span>{flags[country] || "🌐"}</span>;
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  const colors: Record<string, string> = { emerald: "text-emerald-400", blue: "text-blue-400", violet: "text-violet-400" };
  return (
    <Card className="border-slate-700 bg-slate-800/50">
      <CardContent className="py-4 text-center">
        <div className={cn("text-2xl font-bold", colors[color])}>{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return (
    <Card className="border-slate-700 bg-slate-800/50">
      <CardContent className="py-12 text-center">
        <div className="mx-auto mb-4 text-slate-600">{icon}</div>
        <h3 className="text-lg font-medium text-slate-300 mb-2">{title}</h3>
        <p className="text-slate-500 mb-6">{description}</p>
        {action}
      </CardContent>
    </Card>
  );
}

function UrlItem({ url, article, onClick }: { url: FetchedUrl; article?: ArticleSummary; onClick: () => void }) {
  const hasArticle = !!article;
  return (
    <div
      onClick={hasArticle ? onClick : undefined}
      className={cn(
        "block p-2 rounded transition-colors",
        hasArticle ? "hover:bg-violet-500/10 cursor-pointer border-l-2 border-emerald-500" : "hover:bg-slate-900/50 border-l-2 border-slate-700"
      )}
    >
      <div className="flex items-start gap-2">
        {hasArticle ? <FileText className="h-3 w-3 mt-1 text-emerald-400" /> : <ExternalLink className="h-3 w-3 mt-1 text-slate-500" />}
        <div className="min-w-0 flex-1">
          <div className={cn("text-sm line-clamp-1", hasArticle ? "text-emerald-300" : "text-slate-200")}>
            {url.title || url.domain}
          </div>
          <div className="text-xs text-slate-600">{url.domain}</div>
        </div>
        {!hasArticle && (
          <a href={url.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
            <ExternalLink className="h-3 w-3 text-slate-500 hover:text-blue-400" />
          </a>
        )}
      </div>
    </div>
  );
}

function CountrySummaryCard({ 
  countrySummary, 
  onSourceClick,
  expanded: initialExpanded = false,
  topicId,
}: { 
  countrySummary: CountrySummary; 
  onSourceClick: (source: CountrySource) => void;
  expanded?: boolean;
  topicId?: number;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  
  // Create simple citation format [Country-N] for UI display
  const getCitation = (source: CountrySource) => {
    return `[${countrySummary.country}-${source.number}]`;
  };
  
  return (
    <Card className="border-slate-700 bg-slate-800/50">
      <CardHeader 
        className="cursor-pointer hover:bg-slate-700/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CountryFlag country={countrySummary.country} />
            {countrySummary.country}
            <span className="text-sm font-normal text-slate-500">
              ({countrySummary.sources?.length || 0} źródeł)
            </span>
          </CardTitle>
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
        </div>
      </CardHeader>
      
      {expanded && (
        <CardContent>
          {/* Summary text with citations */}
          <div className="prose prose-invert prose-sm max-w-none mb-4">
            <CountrySummaryContent 
              text={countrySummary.summary} 
              sources={countrySummary.sources || []}
              onSourceClick={onSourceClick}
              countryName={countrySummary.country}
            />
          </div>
          
          {/* Evolution history */}
          <EvolutionHistory 
            evolution={countrySummary.evolution} 
            title={`Ewolucja: ${countrySummary.country}`}
          />
          
          {/* Sources list - nice vertical layout */}
          {countrySummary.sources && countrySummary.sources.length > 0 && (
            <div className="border-t border-slate-700 pt-4">
              <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-violet-400" />
                Sources ({countrySummary.sources.length})
              </h4>
              <div className="space-y-2">
                {countrySummary.sources.map((source) => (
                  <div 
                    key={source.number}
                    className="group flex items-start gap-3 p-2 rounded-lg bg-slate-900/50 hover:bg-slate-700/50 cursor-pointer transition-colors"
                    onClick={() => onSourceClick(source)}
                  >
                    <span className="font-mono text-xs bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded font-bold shrink-0 border border-cyan-500/30">
                      {getCitation(source)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-200 font-medium">
                        {source.title || source.domain}
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {source.url}
                      </div>
                    </div>
                    <a 
                      href={source.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      onClick={e => e.stopPropagation()}
                      className="text-slate-500 hover:text-blue-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function CountrySummaryContent({ 
  text,
  sources,
  onSourceClick,
  countryName = ""
}: { 
  text: string; 
  sources: CountrySource[]; 
  onSourceClick: (source: CountrySource) => void;
  countryName?: string;
}) {
  if (!text?.trim()) {
    return <p className="text-slate-500 italic">No content</p>;
  }
  
  // Parse citations [Country-N] and make them clickable
  const citationRegex = /(\[[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż\s]+-\d+(?:,\s*[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż\s]+-\d+)*\])/g;
  const parts = text.split(citationRegex);
  
  return (
    <div className="text-slate-300 leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) => {
        // Check if this is a citation like [China-3] or [China-1, China-2]
        if (part.match(/^\[.+-\d+.*\]$/)) {
          // Extract individual citations
          const inner = part.slice(1, -1); // Remove [ ]
          const citations = inner.split(/,\s*/);
          
          return (
            <span key={i}>
              [
              {citations.map((cite, ci) => {
                const numMatch = cite.match(/-(\d+)$/);
                const num = numMatch ? parseInt(numMatch[1]) : null;
                const source = num ? sources.find(s => s.number === num) : null;
                
                return (
                  <span key={ci}>
                    {ci > 0 && ', '}
                    <button
                      onClick={() => source && onSourceClick(source)}
                      className="font-mono text-xs bg-cyan-500/20 text-cyan-300 px-0.5 rounded hover:bg-cyan-500/40 border border-cyan-500/30"
                      title={source?.title || cite}
                    >
                      {cite}
                    </button>
                  </span>
                );
              })}
              ]
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

function SynthesisContent({ text, countrySummaries }: { text: string; countrySummaries: CountrySummary[] }) {
  if (!text?.trim()) {
    return <p className="text-slate-500 italic">No synthesis</p>;
  }
  
  // Parse citations [Country-N] or [USER-x] and make them clickable
  const citationRegex = /(\[(?:USER-[a-z]|[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż\s]+-\d+)(?:,\s*(?:USER-[a-z]|[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż\s]+-\d+))*\])/g;
  const parts = text.split(citationRegex);
  
  const scrollToCountry = (countryName: string) => {
    const el = document.querySelector(`[data-country="${countryName}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
  
  return (
    <div className="text-slate-300 leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) => {
        // Check if this is a citation
        if (part.match(/^\[.+\]$/)) {
          const inner = part.slice(1, -1);
          const citations = inner.split(/,\s*/);
          
          return (
            <span key={i}>
              [
              {citations.map((cite, ci) => {
                const isUser = cite.startsWith('USER-');
                const countryMatch = cite.match(/^([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż\s]+)-\d+$/);
                const countryName = countryMatch ? countryMatch[1] : null;
                
                return (
                  <span key={ci}>
                    {ci > 0 && ', '}
                    <button
                      onClick={() => countryName && scrollToCountry(countryName)}
                      className={`font-mono text-xs px-0.5 rounded border ${
                        isUser 
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' 
                          : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/40'
                      }`}
                      title={cite}
                    >
                      {cite}
                    </button>
                  </span>
                );
              })}
              ]
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

function ArticleModal({ article, onClose }: { article: ArticleSummary; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <Card className="border-slate-600 bg-slate-800 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <CardHeader className="border-b border-slate-700">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CountryFlag country={article.source_country} />
                <span className="text-sm text-slate-400">{article.source_country}</span>
                <span className="text-slate-600">•</span>
                <span className="text-sm text-slate-500">{article.domain}</span>
              </div>
              <CardTitle className="text-lg text-slate-100">{article.title}</CardTitle>
            </div>
            <div className="flex gap-2">
              <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-emerald-400">
                <ExternalLink className="h-5 w-5" />
              </a>
              <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-y-auto flex-1 py-6">
          <div className="prose prose-invert prose-sm max-w-none">
            <div className="text-slate-300 whitespace-pre-wrap">{article.summary}</div>
          </div>
          
          {article.key_facts?.length > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-700">
                  <h3 className="text-sm font-semibold text-emerald-400 mb-3">Key facts</h3>
              <ul className="space-y-2">
                {article.key_facts.map((fact, i) => (
                  <li key={i} className="text-sm text-slate-300 flex gap-3">
                    <span className="text-emerald-400 font-bold">{i + 1}.</span>
                    <span>{fact}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
