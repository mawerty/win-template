import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Scenario, Topic, TopicWithSources, BackcastData } from "@/types/analysis";
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  ChevronDown, 
  ChevronUp,
  Lightbulb,
  FileText,
  RefreshCw,
  ExternalLink,
  Globe,
  Building2,
  Search,
  Download,
  Link2,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ReasoningPath } from "./ReasoningPath";
import { BackcastView } from "./BackcastView";

interface ScenarioReportProps {
  scenarios: Scenario[];
  selectedTopics: Topic[];
  sources: TopicWithSources[];
  situationSummary: string;
  onBackToTopics: () => void;
  onRegenerate: () => Promise<void>;
  onFetchUrls: () => Promise<void>;
  isRegenerating?: boolean;
  isFetchingUrls?: boolean;
  // Backcast mode props
  isBackcast?: boolean;
  backcastTargetState?: string;
  backcastTargetYear?: number;
}

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  const [showChainOfThought, setShowChainOfThought] = useState(false);
  
  const isPositive = scenario.variant === "positive";
  const is12Months = scenario.timeframe === "12_months";
  
  return (
    <Card className={cn(
      "border-2 transition-all",
      isPositive 
        ? "border-emerald-500/30 bg-emerald-950/20" 
        : "border-rose-500/30 bg-rose-950/20"
    )}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              isPositive ? "bg-emerald-500/20" : "bg-rose-500/20"
            )}>
              {isPositive ? (
                <TrendingUp className={cn("h-5 w-5", "text-emerald-400")} />
              ) : (
                <TrendingDown className={cn("h-5 w-5", "text-rose-400")} />
              )}
            </div>
            <div>
              <CardTitle className={cn(
                "text-lg",
                isPositive ? "text-emerald-100" : "text-rose-100"
              )}>
                Scenariusz {isPositive ? "Pozytywny" : "Negatywny"}
              </CardTitle>
              <CardDescription className="text-slate-400 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Perspektywa {is12Months ? "12 miesięcy" : "36 miesięcy"}
              </CardDescription>
            </div>
          </div>
          
          <div className={cn(
            "px-3 py-1 rounded-full text-sm font-medium",
            isPositive 
              ? "bg-emerald-500/20 text-emerald-300" 
              : "bg-rose-500/20 text-rose-300"
          )}>
            {is12Months ? "Krótki termin" : "Długi termin"}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Main Content */}
        <div className="prose prose-sm prose-invert max-w-none">
          <p className="text-slate-200 leading-relaxed whitespace-pre-line">
            {scenario.content}
          </p>
        </div>
        
        {/* Reasoning Path - Visual */}
        {scenario.reasoning_steps && scenario.reasoning_steps.length > 0 && (
          <ReasoningPath 
            steps={scenario.reasoning_steps} 
            variant={scenario.variant as "positive" | "negative"} 
          />
        )}
        
        {/* Chain of Thought Toggle */}
        <div className="border-t border-slate-700 pt-4">
          <button
            onClick={() => setShowChainOfThought(!showChainOfThought)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Lightbulb className="h-4 w-4" />
            <span>Pokaż logikę analizy (tekst)</span>
            {showChainOfThought ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          
          {showChainOfThought && (
            <div className="mt-3 p-4 rounded-lg bg-slate-900/50 border border-slate-700">
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                {scenario.chain_of_thought}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SourcesSection({ 
  sources, 
  onFetchUrls, 
  isFetchingUrls 
}: { 
  sources: TopicWithSources[]; 
  onFetchUrls: () => Promise<void>;
  isFetchingUrls?: boolean;
}) {
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  
  if (!sources || sources.length === 0) return null;
  
  const totalSources = sources.reduce((acc, t) => acc + t.sources_count.total, 0);
  const totalFetchedUrls = sources.reduce((acc, t) => acc + (t.fetched_urls?.stats.total_urls || 0), 0);
  const hasFetchedUrls = totalFetchedUrls > 0;
  
  return (
    <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <Search className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-slate-100">Źródła do Analizy</CardTitle>
              <CardDescription className="text-slate-400">
                {hasFetchedUrls 
                  ? `${totalFetchedUrls} artykułów z ${sources.length} tematów`
                  : `${totalSources} zapytań wyszukiwania dla ${sources.length} tematów`
                }
              </CardDescription>
            </div>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={onFetchUrls}
            disabled={isFetchingUrls}
            className="border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/10"
          >
            {isFetchingUrls ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Pobieranie...
              </>
            ) : hasFetchedUrls ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Odśwież linki
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Pobierz prawdziwe linki
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {sources.map((topic, idx) => (
          <div key={idx} className="border border-slate-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedTopic(expandedTopic === topic.name ? null : topic.name)}
              className="w-full p-4 flex items-center justify-between bg-slate-900/30 hover:bg-slate-900/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-slate-200 font-medium">{topic.name}</span>
                <span className="px-2 py-0.5 text-xs bg-cyan-500/20 text-cyan-300 rounded-full">
                  {topic.sources_count.total} źródeł
                </span>
              </div>
              {expandedTopic === topic.name ? (
                <ChevronUp className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              )}
            </button>
            
            {expandedTopic === topic.name && (
              <div className="p-4 space-y-4 bg-slate-900/20">
                {/* Selection Reasoning */}
                {topic.sources.selection_reasoning && (
                  <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                    <h5 className="text-xs font-medium text-cyan-400 mb-1 flex items-center gap-1">
                      <Lightbulb className="h-3 w-3" />
                      Dlaczego te źródła?
                    </h5>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {topic.sources.selection_reasoning}
                    </p>
                  </div>
                )}
                
                {/* Keywords */}
                <div>
                  <h5 className="text-xs font-medium text-slate-400 mb-2">Słowa kluczowe:</h5>
                  <div className="flex flex-wrap gap-1">
                    {topic.keywords.map((kw, i) => (
                      <span key={i} className="px-2 py-0.5 text-xs bg-slate-700 text-slate-200 rounded">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
                
                {/* Ministries */}
                {topic.sources.ministries.length > 0 && (
                  <div>
                    <h5 className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      Ministerstwa ({topic.sources.ministries.length})
                    </h5>
                    <div className="grid gap-2 max-h-60 overflow-y-auto">
                      {topic.sources.ministries.slice(0, 15).map((src, i) => (
                        <a
                          key={i}
                          href={src.google_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 rounded bg-slate-800/50 hover:bg-slate-700/50 transition-colors group"
                        >
                          <Globe className="h-3 w-3 text-slate-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-300 truncate">
                              <span className="text-amber-400">{src.country}</span>
                              <span className="text-slate-500 mx-1">•</span>
                              <span>{src.category}</span>
                            </div>
                            <div className="text-xs text-slate-500 truncate font-mono">
                              "{src.keyword}" site:{src.domain}
                            </div>
                          </div>
                          <ExternalLink className="h-3 w-3 text-slate-500 group-hover:text-cyan-400 flex-shrink-0" />
                        </a>
                      ))}
                      {topic.sources.ministries.length > 15 && (
                        <div className="text-xs text-slate-500 text-center py-2">
                          + {topic.sources.ministries.length - 15} więcej...
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Institutions */}
                {topic.sources.institutions.length > 0 && (
                  <div>
                    <h5 className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      Instytucje międzynarodowe ({topic.sources.institutions.length})
                    </h5>
                    <div className="grid gap-2 max-h-60 overflow-y-auto">
                      {topic.sources.institutions.map((src, i) => (
                        <a
                          key={i}
                          href={src.google_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 rounded bg-slate-800/50 hover:bg-slate-700/50 transition-colors group"
                        >
                          <Globe className="h-3 w-3 text-slate-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-300 truncate">
                              <span className="text-violet-400">{src.institution}</span>
                            </div>
                            <div className="text-xs text-slate-500 truncate font-mono">
                              "{src.keyword}" site:{src.domain}
                            </div>
                          </div>
                          <ExternalLink className="h-3 w-3 text-slate-500 group-hover:text-cyan-400 flex-shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Fetched URLs */}
                {topic.fetched_urls && topic.fetched_urls.all_urls.length > 0 && (
                  <div className="border-t border-slate-700 pt-4 mt-4">
                    <h5 className="text-xs font-medium text-emerald-400 mb-3 flex items-center gap-1">
                      <Link2 className="h-3 w-3" />
                      {topic.fetched_urls.all_urls[0]?.is_search_url 
                        ? `Wyszukiwania (${topic.fetched_urls.stats.total_urls})` 
                        : `Znalezione artykuły (${topic.fetched_urls.stats.total_urls})`
                      }
                    </h5>
                    
                    {/* Group by Country */}
                    {Object.entries(topic.fetched_urls.by_country).map(([country, urls]) => (
                      urls.length > 0 && (
                        <div key={country} className="mb-4">
                          <h6 className="text-xs text-amber-400 mb-2 flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {country} ({urls.length})
                          </h6>
                          <div className="space-y-2">
                            {urls.map((urlData, i) => (
                              urlData.is_search_url ? (
                                // Search URL - show search buttons
                                <div
                                  key={i}
                                  className="p-3 rounded bg-amber-500/5 border border-amber-500/20"
                                >
                                  <div className="text-xs text-slate-300 mb-2">
                                    <span className="text-amber-300">{urlData.category}</span>
                                    <span className="text-slate-500 mx-2">•</span>
                                    <span className="font-mono text-slate-400">"{urlData.keyword}"</span>
                                    <span className="text-slate-500 mx-2">→</span>
                                    <span className="text-slate-400">{urlData.domain}</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <a
                                      href={urlData.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 transition-colors"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      Google
                                    </a>
                                    <a
                                      href={urlData.url.replace('google.com', 'bing.com')}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1 px-2 py-1 text-xs bg-cyan-500/20 text-cyan-300 rounded hover:bg-cyan-500/30 transition-colors"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      Bing
                                    </a>
                                  </div>
                                </div>
                              ) : (
                                // Real article URL
                                <a
                                  key={i}
                                  href={urlData.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block p-3 rounded bg-amber-500/5 border border-amber-500/20 hover:bg-amber-500/10 transition-colors group"
                                >
                                  <div className="flex items-start gap-2">
                                    <ExternalLink className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0 group-hover:text-amber-300" />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm text-amber-100 font-medium line-clamp-2 group-hover:text-amber-50">
                                        {urlData.title || urlData.domain}
                                      </div>
                                      {urlData.snippet && (
                                        <div className="text-xs text-slate-400 mt-1 line-clamp-2">
                                          {urlData.snippet}
                                        </div>
                                      )}
                                      <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                                        <span className="text-amber-400/70">{urlData.domain}</span>
                                        {urlData.category && (
                                          <>
                                            <span>•</span>
                                            <span>{urlData.category}</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </a>
                              )
                            ))}
                          </div>
                        </div>
                      )
                    ))}
                    
                    {/* Group by Institution */}
                    {Object.entries(topic.fetched_urls.by_institution).map(([inst, urls]) => (
                      urls.length > 0 && (
                        <div key={inst} className="mb-4">
                          <h6 className="text-xs text-violet-400 mb-2 flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            {inst} ({urls.length})
                          </h6>
                          <div className="space-y-2">
                            {urls.map((urlData, i) => (
                              urlData.is_search_url ? (
                                // Search URL
                                <div
                                  key={i}
                                  className="p-3 rounded bg-violet-500/5 border border-violet-500/20"
                                >
                                  <div className="text-xs text-slate-300 mb-2">
                                    <span className="font-mono text-slate-400">"{urlData.keyword}"</span>
                                    <span className="text-slate-500 mx-2">→</span>
                                    <span className="text-slate-400">{urlData.domain}</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <a
                                      href={urlData.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 transition-colors"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      Google
                                    </a>
                                    <a
                                      href={urlData.url.replace('google.com', 'bing.com')}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1 px-2 py-1 text-xs bg-cyan-500/20 text-cyan-300 rounded hover:bg-cyan-500/30 transition-colors"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      Bing
                                    </a>
                                  </div>
                                </div>
                              ) : (
                                // Real article URL
                                <a
                                  key={i}
                                  href={urlData.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block p-3 rounded bg-violet-500/5 border border-violet-500/20 hover:bg-violet-500/10 transition-colors group"
                                >
                                  <div className="flex items-start gap-2">
                                    <ExternalLink className="h-4 w-4 text-violet-400 mt-0.5 flex-shrink-0 group-hover:text-violet-300" />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm text-violet-100 font-medium line-clamp-2 group-hover:text-violet-50">
                                        {urlData.title || urlData.domain}
                                      </div>
                                      {urlData.snippet && (
                                        <div className="text-xs text-slate-400 mt-1 line-clamp-2">
                                          {urlData.snippet}
                                        </div>
                                      )}
                                      <div className="text-xs text-slate-500 mt-1">
                                        <span className="text-violet-400/70">{urlData.domain}</span>
                                      </div>
                                    </div>
                                  </div>
                                </a>
                              )
                            ))}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ScenarioReport({ 
  scenarios, 
  selectedTopics,
  sources,
  situationSummary,
  onBackToTopics,
  onRegenerate,
  onFetchUrls,
  isRegenerating,
  isFetchingUrls,
  isBackcast,
  backcastTargetState,
  backcastTargetYear
}: ScenarioReportProps) {
  // Check if this is a backcast session
  const backcastScenario = scenarios.find(s => s.timeframe === "backcast");
  const showBackcast = isBackcast || !!backcastScenario;
  
  // Parse backcast data if available
  let backcastData: BackcastData | null = null;
  if (backcastScenario) {
    try {
      backcastData = JSON.parse(backcastScenario.content);
    } catch {
      // Content might not be JSON, that's ok
    }
  }
  
  // Sort scenarios: 12 months first, then positive before negative
  const sortedScenarios = [...scenarios].sort((a, b) => {
    if (a.timeframe !== b.timeframe) {
      return a.timeframe === "12_months" ? -1 : 1;
    }
    return a.variant === "positive" ? -1 : 1;
  });

  const scenarios12 = sortedScenarios.filter(s => s.timeframe === "12_months");
  const scenarios36 = sortedScenarios.filter(s => s.timeframe === "36_months");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={onBackToTopics}
          className="text-slate-400 hover:text-slate-100"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Wróć do wyboru tematów
        </Button>
        
        <Button
          variant="outline"
          onClick={onRegenerate}
          disabled={isRegenerating}
          className="border-slate-600 text-slate-300 hover:bg-slate-700"
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", isRegenerating && "animate-spin")} />
          {isRegenerating ? "Regenerowanie..." : "Wygeneruj ponownie"}
        </Button>
      </div>

      {/* Summary Section */}
      <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <FileText className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-slate-100">Podsumowanie Analizy</CardTitle>
              <CardDescription className="text-slate-400">
                Podstawa do wygenerowanych scenariuszy
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-slate-300 mb-2">Wybrane tematy ({selectedTopics.length}):</h4>
            <div className="flex flex-wrap gap-2">
              {selectedTopics.map(topic => (
                <span 
                  key={topic.id}
                  className="px-2 py-1 text-xs bg-violet-500/20 text-violet-200 rounded-full"
                >
                  {topic.name}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sources Section */}
      <SourcesSection sources={sources} onFetchUrls={onFetchUrls} isFetchingUrls={isFetchingUrls} />

      {/* Backcast View - if this is a backcast session */}
      {showBackcast && backcastData && (
        <BackcastView 
          data={backcastData} 
          targetState={backcastTargetState}
          targetYear={backcastTargetYear}
        />
      )}

      {/* Traditional Forecast Scenarios - only if not backcast */}
      {!showBackcast && (
        <>
      {/* 12 Months Scenarios */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-amber-400" />
          Perspektywa 12 Miesięcy
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {scenarios12.map(scenario => (
            <ScenarioCard key={scenario.id} scenario={scenario} />
          ))}
        </div>
      </div>

      {/* 36 Months Scenarios */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-cyan-400" />
          Perspektywa 36 Miesięcy
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {scenarios36.map(scenario => (
            <ScenarioCard key={scenario.id} scenario={scenario} />
          ))}
        </div>
      </div>
        </>
      )}

      {/* Recommendations Section - only for forecast mode */}
      {!showBackcast && (
      <Card className="border-slate-700 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Lightbulb className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-slate-100">Rekomendacje dla Atlantis</CardTitle>
              <CardDescription className="text-slate-400">
                Na podstawie analizy scenariuszy
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h4 className="font-medium text-emerald-300 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Jak osiągnąć scenariusze pozytywne
            </h4>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-1">•</span>
                <span>Dywersyfikacja źródeł dostaw procesorów i komponentów technologicznych</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-1">•</span>
                <span>Intensyfikacja współpracy z Finlandią i krajami nordyckimi w zakresie bezpieczeństwa</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-1">•</span>
                <span>Aktywny udział w projektach odbudowy Ukrainy i pozyskiwanie kontraktów</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-1">•</span>
                <span>Przyspieszenie inwestycji w OZE i infrastrukturę AI</span>
              </li>
            </ul>
          </div>
          
          <div className="space-y-3">
            <h4 className="font-medium text-rose-300 flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Jak uniknąć scenariuszy negatywnych
            </h4>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-rose-400 mt-1">•</span>
                <span>Budowanie rezerw strategicznych i zabezpieczenie łańcuchów dostaw</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-400 mt-1">•</span>
                <span>Wzmocnienie cyberbezpieczeństwa infrastruktury krytycznej</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-400 mt-1">•</span>
                <span>Aktywna dyplomacja w UE przeciwdziałająca podziałom</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-400 mt-1">•</span>
                <span>Przygotowanie planów awaryjnych dla przemysłu motoryzacyjnego</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
