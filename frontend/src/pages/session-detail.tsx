import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  Loader2, 
  Sparkles, 
  Check, 
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Weight,
  Link as LinkIcon,
  Plus,
  RefreshCw,
  FileText,
  Play,
  MessageSquare,
  Zap,
  BookOpen,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Topic, Scenario, AnalysisSession } from "@/types/analysis";
import { getSession, selectTopics, updateTopicWeights } from "@/api/analysis";
import { AnalysisTreeNav } from "@/components/AnalysisTreeNav";

// View modes
type ViewMode = "topics" | "processing" | "report";

interface ProcessingStatus {
  topics_processed: number;
  topics_total: number;
  urls_fetched: number;
  articles_summarized: number;
  countries_processed: number;
  syntheses_generated: number;
  current_step: string;
  topic_results: Array<{
    topic_id: number;
    topic_name: string;
    urls_count: number;
    articles_count: number;
    countries_count: number;
    synthesis_generated: boolean;
    error?: string;
  }>;
}

interface ProgressStatus {
  is_processing: boolean;
  step: string;
  current: number;
  total: number;
  percent: number;
  message: string;
  sub_step: string;
}

// Evolution history for each section
interface EvolutionStep {
  iteration: number;
  score: number;
  scores: { 
    hall?: number;  // 0-50: hallucinations
    cite?: number;  // 0-35: citations (format + density)
    bias?: number;  // 0-35: source credibility
    qual?: number;  // 0-30: quality
  };
  feedback: string;
  content: string;
}

interface EvolutionStats {
  initial_score: number;
  final_score: number;
  improvement: number;
  iterations: number;
  history: EvolutionStep[];
}

interface ReportSection {
  type: string;
  title: string;
  content: string;
  sources: Array<{ type: string; citation: string }>;
  evolution?: EvolutionStats | null;
}

interface FinalReport {
  sections: ReportSection[];
  topics_used: Array<{ id: number; name: string; weight: number }>;
  generated_at: string;
  evolution_stats?: Record<string, EvolutionStats>;
}

// ============================================================================
// EVOLUTION HISTORY PANEL - Shows v1, v2, v3... with feedback
// ============================================================================
function EvolutionHistoryPanel({ 
  evolution, 
  sectionType 
}: { 
  evolution: EvolutionStats; 
  sectionType: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  
  if (!evolution.history || evolution.history.length === 0) return null;
  
  const getScoreColor = (score: number) => {
    if (score >= 130) return "text-emerald-400";  // Green: 87%+
    if (score >= 100) return "text-yellow-400";   // Yellow: 67%+
    if (score >= 75) return "text-orange-400";    // Orange: 50%+
    return "text-red-400";                        // Red: <50%
  };
  
  const extractPriority = (feedback: string) => {
    const match = feedback.match(/PRIORITY[:\s]*(.+?)(?:\n|IMPROVEMENTS|HALLUCINATIONS|$)/i);
    return match ? match[1].trim().slice(0, 100) : null;
  };

  return (
    <div className="mt-4 border-t border-slate-700/50 pt-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <Sparkles className="h-4 w-4 text-violet-400" />
        <span>Evolution History</span>
        <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full">
          {evolution.iterations} versions
        </span>
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      
      {isExpanded && (
        <div className="mt-3 space-y-2">
          {/* Version Timeline */}
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {evolution.history.map((step, idx) => (
              <button
                key={step.iteration}
                onClick={() => setSelectedVersion(selectedVersion === step.iteration ? null : step.iteration)}
                className={cn(
                  "flex-shrink-0 px-3 py-2 rounded-lg border transition-all",
                  selectedVersion === step.iteration
                    ? "bg-violet-500/20 border-violet-500 text-violet-200"
                    : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600"
                )}
              >
                <div className="text-xs font-mono mb-1">v{step.iteration}</div>
                <div className={cn("text-sm font-bold", getScoreColor(step.score))}>
                  {step.score}/150
                </div>
                {step.scores && (
                  <div className="text-[10px] text-slate-500 mt-1">
                    H:{step.scores.hall || 0} C:{step.scores.cite || 0} B:{step.scores.bias || 0}
                  </div>
                )}
              </button>
            ))}
            
            {/* Arrow showing improvement */}
            <div className="flex-shrink-0 px-2 text-slate-500">→</div>
            
            {/* Final Result */}
            <div className="flex-shrink-0 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <div className="text-xs text-emerald-400 mb-1">Final</div>
              <div className={cn("text-sm font-bold", getScoreColor(evolution.final_score))}>
                {evolution.final_score}/150
              </div>
              {evolution.improvement > 0 && (
                <div className="text-[10px] text-emerald-400 mt-1">
                  +{evolution.improvement} pts
                </div>
              )}
            </div>
          </div>
          
          {/* Selected Version Details */}
          {selectedVersion !== null && (
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              {evolution.history.filter(s => s.iteration === selectedVersion).map(step => {
                const priority = extractPriority(step.feedback);
                return (
                  <div key={step.iteration}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-slate-200">
                        Version {step.iteration} - Reviewer Score
                      </h4>
                      <span className={cn("font-mono text-lg", getScoreColor(step.score))}>
                        {step.score}/150
                      </span>
                    </div>
                    
                    {/* Score breakdown */}
                    {step.scores && (
                      <div className="flex flex-wrap gap-3 mb-3 text-xs">
                        <div className="flex items-center gap-1 bg-violet-500/20 px-2 py-1 rounded">
                          <span className="text-slate-400">🛡️ hall:</span>
                          <span className={(step.scores.hall ?? 0) >= 40 ? "text-emerald-400" : "text-amber-400"}>
                            {step.scores.hall ?? 0}/50
                          </span>
                        </div>
                        <div className="flex items-center gap-1 bg-emerald-500/20 px-2 py-1 rounded">
                          <span className="text-slate-400">📝 cite:</span>
                          <span className={(step.scores.cite ?? 0) >= 25 ? "text-emerald-400" : "text-amber-400"}>
                            {step.scores.cite ?? 0}/35
                          </span>
                        </div>
                        <div className="flex items-center gap-1 bg-cyan-500/20 px-2 py-1 rounded">
                          <span className="text-slate-400">🔍 bias:</span>
                          <span className={(step.scores.bias ?? 0) >= 25 ? "text-emerald-400" : "text-amber-400"}>
                            {step.scores.bias ?? 0}/35
                          </span>
                        </div>
                        <div className="flex items-center gap-1 bg-amber-500/20 px-2 py-1 rounded">
                          <span className="text-slate-400">✨ qual:</span>
                          <span className={(step.scores.qual ?? 0) >= 20 ? "text-emerald-400" : "text-amber-400"}>
                            {step.scores.qual ?? 0}/30
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* Priority feedback */}
                    {priority && (
                      <div className="bg-slate-900/50 rounded p-3 mb-3">
                        <div className="text-xs text-violet-400 mb-1 flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          Priority fix:
                        </div>
                        <p className="text-sm text-slate-300 italic">"{priority}"</p>
                      </div>
                    )}
                    
                    {/* Full feedback (collapsible) */}
                    <details className="text-xs">
                      <summary className="text-slate-500 cursor-pointer hover:text-slate-300">
                        View full reviewer feedback...
                      </summary>
                      <pre className="mt-2 p-3 bg-slate-900/50 rounded text-slate-400 whitespace-pre-wrap text-[11px] max-h-60 overflow-y-auto">
                        {step.feedback}
                      </pre>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [session, setSession] = useState<any>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingWeight, setEditingWeight] = useState<number | null>(null);
  const [localWeights, setLocalWeights] = useState<Record<number, number>>({});
  
  // New states
  const [viewMode, setViewMode] = useState<ViewMode>("topics");
  const [feedback, setFeedback] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressStatus | null>(null);
  const [finalReport, setFinalReport] = useState<FinalReport | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  
  // Report modification
  const [isUpdatingReport, setIsUpdatingReport] = useState(false);
  
  // Sources legend with new format [Country-T#-N]
  interface SourceData {
    id: string;
    citation: string;
    type: string;
    country?: string;
    topic_id?: number;
    topic_name?: string;
    title: string;
    url: string | null;
    content?: string;
    weight?: number;
  }
  
  interface TopicSources {
    topic_id: number;
    topic_name: string;
    topic_citation: string;
    countries: Record<string, SourceData[]>;
  }
  
  const [sourcesData, setSourcesData] = useState<{
    user_facts: SourceData[];
    sources_by_topic: Record<number, TopicSources>;
    all_citations: Record<string, SourceData>;
    total_sources: number;
  } | null>(null);
  const [showSourcesLegend, setShowSourcesLegend] = useState(true);  // Default open
  
  // Scroll to citation in legend
  const scrollToCitation = (citationId: string) => {
    const element = document.getElementById(`source-${citationId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ring-2', 'ring-cyan-400');
      setTimeout(() => element.classList.remove('ring-2', 'ring-cyan-400'), 2000);
    }
  };

  useEffect(() => {
    if (sessionId) {
      loadSession(Number.parseInt(sessionId));
    }
  }, [sessionId]);

  useEffect(() => {
    const weights: Record<number, number> = {};
    const selected = new Set<number>();
    for (const topic of topics) {
      weights[topic.id] = topic.weight;
      if (topic.selected) selected.add(topic.id);
    }
    setLocalWeights(weights);
    setSelectedIds(selected);
  }, [topics]);

  const loadSession = async (id: number) => {
    setIsLoading(true);
    try {
      const data = await getSession(id);
      setSession(data);
      setTopics(data.topics);
      
      // Check if we have a final report
      const reportRes = await fetch(`/api/sessions/${id}/report`);
      if (reportRes.ok) {
        const reportData = await reportRes.json();
        if (reportData.has_report) {
          setFinalReport(reportData);
          setViewMode("report");
          
          // Also load sources legend
          const sourcesRes = await fetch(`/api/sessions/${id}/sources`);
          if (sourcesRes.ok) {
            const sourcesJson = await sourcesRes.json();
            setSourcesData(sourcesJson);
          }
        }
      }
    } catch (error) {
      console.error("Error loading session:", error);
      toast.error("Unable to load session");
      navigate("/");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleTopic = async (topicId: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(topicId)) {
      newSelected.delete(topicId);
    } else {
      newSelected.add(topicId);
    }
    setSelectedIds(newSelected);
    
    try {
      await selectTopics(Number(sessionId), Array.from(newSelected));
      setTopics(prev => prev.map(t => ({
        ...t,
        selected: newSelected.has(t.id)
      })));
    } catch (error) {
      console.error("Error selecting topics:", error);
    }
  };

  const handleSelectAll = async () => {
    const allIds = new Set(topics.map(t => t.id));
    setSelectedIds(allIds);
    try {
      await selectTopics(Number(sessionId), Array.from(allIds));
      setTopics(prev => prev.map(t => ({ ...t, selected: true })));
    } catch (error) {
      console.error("Error selecting all:", error);
    }
  };

  const handleDeselectAll = async () => {
    setSelectedIds(new Set());
    try {
      await selectTopics(Number(sessionId), []);
      setTopics(prev => prev.map(t => ({ ...t, selected: false })));
    } catch (error) {
      console.error("Error deselecting all:", error);
    }
  };

  const handleWeightChange = (topicId: number, weight: number) => {
    const clampedWeight = Math.max(1, Math.min(100, weight));
    setLocalWeights(prev => ({ ...prev, [topicId]: clampedWeight }));
  };

  const handleWeightBlur = async (topicId: number) => {
    setEditingWeight(null);
    try {
      const weights = Object.entries(localWeights).map(([id, weight]) => ({
        topic_id: Number(id),
        weight,
      }));
      await updateTopicWeights(Number(sessionId), weights);
      setTopics(prev => prev.map(t => ({
        ...t,
        weight: localWeights[t.id] ?? t.weight
      })));
    } catch (error) {
      console.error("Error updating weights:", error);
    }
  };

  const handleRegenerateTopics = async () => {
    if (!feedback.trim()) {
      toast.error("Provide feedback to change analysis direction");
      return;
    }
    
    setIsRegenerating(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/regenerate-topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      
      if (!response.ok) throw new Error("Failed to regenerate");
      
      const data = await response.json();
      setTopics(data.topics);
      setFeedback("");
      toast.success(`Generated ${data.topics.length} new topics!`);
    } catch (error) {
      console.error("Error regenerating:", error);
      toast.error("Error regenerating topics");
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleAddCustomTopic = async () => {
    if (!newTopicName.trim()) {
      toast.error("Enter topic name");
      return;
    }
    
    setIsAddingTopic(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/add-topic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTopicName }),
      });
      
      if (!response.ok) throw new Error("Failed to add topic");
      
      const data = await response.json();
      setTopics(prev => [...prev, data.topic]);
      setSelectedIds(prev => new Set([...prev, data.topic.id]));
      setNewTopicName("");
      toast.success("Topic added!");
    } catch (error) {
      console.error("Error adding topic:", error);
      toast.error("Error adding topic");
    } finally {
      setIsAddingTopic(false);
    }
  };

  const handleProcessAll = async () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one topic");
      return;
    }
    
    setViewMode("processing");
    setIsProcessing(true);
    setProgress({
      is_processing: true,
      step: "start",
      current: 0,
      total: selectedIds.size * 4,
      percent: 0,
      message: "Initializing...",
      sub_step: ""
    });
    setProcessingStatus({
      topics_processed: 0,
      topics_total: selectedIds.size,
      urls_fetched: 0,
      articles_summarized: 0,
      countries_processed: 0,
      syntheses_generated: 0,
      current_step: "Initializing...",
      topic_results: [],
    });
    
    // Start polling for progress
    const pollInterval = setInterval(async () => {
      try {
        const progressRes = await fetch(`/api/sessions/${sessionId}/progress`);
        if (progressRes.ok) {
          const progressData = await progressRes.json();
          setProgress(progressData);
          if (!progressData.is_processing) {
            clearInterval(pollInterval);
          }
        }
      } catch (e) {
        console.error("Progress poll error:", e);
      }
    }, 1000);
    
    try {
      const response = await fetch(`/api/sessions/${sessionId}/process-all`, {
        method: "POST",
      });
      
      clearInterval(pollInterval);
      
      if (!response.ok) throw new Error("Processing failed");
      
      const result = await response.json();
      setProcessingStatus(result);
      setProgress(null);
      toast.success(`Processed ${result.topics_processed} topics!`);
      
      // Refresh session to get updated topics with syntheses
      const sessionData = await getSession(Number(sessionId));
      setTopics(sessionData.topics);
    } catch (error) {
      clearInterval(pollInterval);
      console.error("Error processing:", error);
      toast.error("Error processing");
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/generate-report`, {
        method: "POST",
      });
      
      if (!response.ok) throw new Error("Report generation failed");
      
      const result = await response.json();
      setFinalReport(result);
      setViewMode("report");
      
      // Load sources for the legend
      const sourcesRes = await fetch(`/api/sessions/${sessionId}/sources`);
      if (sourcesRes.ok) {
        const sourcesJson = await sourcesRes.json();
        setSourcesData(sourcesJson);
      }
      
      toast.success("Raport wygenerowany!");
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Error generating report");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Update report with modified topics (only process new ones)
  const handleUpdateReport = async () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one topic");
      return;
    }
    
    setIsUpdatingReport(true);
    try {
      // Call the incremental update endpoint
      const response = await fetch(`/api/sessions/${sessionId}/update-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback: "",
          selected_topic_ids: Array.from(selectedIds),
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Update failed");
      }
      
      const result = await response.json();
      
      // Refresh topics to get updated synthesis status
      const sessionData = await getSession(Number(sessionId));
      setTopics(sessionData.topics);
      
      // Update selected IDs based on new topics
      const newSelectedIds = new Set<number>();
      for (const t of sessionData.topics) {
        if (t.selected) newSelectedIds.add(t.id);
      }
      setSelectedIds(newSelectedIds);
      
      // Update final report
      setFinalReport(result.report);
      
      // Reload sources for the legend
      const sourcesRes = await fetch(`/api/sessions/${sessionId}/sources`);
      if (sourcesRes.ok) {
        const sourcesJson = await sourcesRes.json();
        setSourcesData(sourcesJson);
      }
      
      toast.success(`Report updated! Processed ${result.new_topics_processed} new topics.`);
    } catch (error) {
      console.error("Error updating report:", error);
      toast.error(error instanceof Error ? error.message : "Error updating report");
    } finally {
      setIsUpdatingReport(false);
    }
  };
  
  // Add a new topic
  const handleAddTopic = async (topicName: string) => {
    setIsAddingTopic(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/add-topic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: topicName, weight: 50 }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to add topic");
      }
      
      const result = await response.json();
      const newTopic = result.topic;
      
      // Add to topics list
      setTopics(prev => [...prev, newTopic]);
      
      // Auto-select the new topic
      setSelectedIds(prev => new Set([...prev, newTopic.id]));
      
      toast.success(`Added topic: ${newTopic.name}`);
    } catch (error) {
      console.error("Error adding topic:", error);
      toast.error(error instanceof Error ? error.message : "Error adding topic");
    } finally {
      setIsAddingTopic(false);
    }
  };

  const getWeightColor = (weight: number) => {
    if (weight >= 80) return "text-red-400 bg-red-500/20 border-red-500/50";
    if (weight >= 60) return "text-orange-400 bg-orange-500/20 border-orange-500/50";
    if (weight >= 40) return "text-yellow-400 bg-yellow-500/20 border-yellow-500/50";
    return "text-slate-400 bg-slate-500/20 border-slate-500/50";
  };

  const sortedTopics = [...topics].sort((a, b) => {
    const weightA = localWeights[a.id] ?? a.weight;
    const weightB = localWeights[b.id] ?? b.weight;
    return weightB - weightA;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  // Helper to prepare topics for tree nav
  const treeNavTopics = topics.map(t => ({
    id: t.id,
    name: t.name,
    weight: localWeights[t.id] ?? t.weight,
    has_synthesis: !!t.synthesis,
    has_urls: !!t.has_cached_urls,
  }));

  // ====================
  // FULL-SCREEN TOPIC SELECTION VIEW
  // ====================
  if (viewMode === "topics") {
    return (
      <div className="min-h-screen bg-slate-900">
        {/* Header */}
        <div className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  onClick={() => navigate("/")}
                  className="text-slate-400 hover:text-slate-100"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <div>
                  <h1 className="text-xl font-bold text-slate-100">
                    {session?.name || `Sesja #${sessionId}`}
                  </h1>
                  <p className="text-sm text-slate-400">
                    Select topics for analysis
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-400">
                  {selectedIds.size} / {topics.length} selected
                </span>
                <Button
                  onClick={handleProcessAll}
                  disabled={selectedIds.size === 0 || isProcessing}
                  size="lg"
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                >
                  <Play className="mr-2 h-5 w-5" />
                  Start Analysis
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Quick Actions */}
          <div className="flex items-center gap-4 mb-6">
            <Button variant="outline" size="sm" onClick={handleSelectAll} className="border-slate-700">
              <Check className="mr-2 h-4 w-4" />
              Select all
            </Button>
            <Button variant="outline" size="sm" onClick={handleDeselectAll} className="border-slate-700">
              Deselect all
            </Button>
            
            {finalReport && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setViewMode("report")}
                className="border-violet-500/50 text-violet-400"
              >
                <FileText className="mr-2 h-4 w-4" />
                View Report
              </Button>
            )}
          </div>

          {/* Topics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {sortedTopics.map((topic) => {
              const isSelected = selectedIds.has(topic.id);
              const weight = localWeights[topic.id] ?? topic.weight;
              const isEditing = editingWeight === topic.id;
              
              return (
                <Card
                  key={topic.id}
                  className={cn(
                    "border transition-all cursor-pointer hover:shadow-lg",
                    isSelected
                      ? "border-emerald-500/50 bg-emerald-500/10 shadow-emerald-500/10"
                      : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                  )}
                  onClick={() => handleToggleTopic(topic.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <div
                        className={cn(
                          "flex-shrink-0 w-5 h-5 rounded border mt-0.5 flex items-center justify-center transition-all",
                          isSelected
                            ? "bg-emerald-500 border-emerald-500"
                            : "border-slate-500"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {topic.situation_factor && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-400 uppercase">
                                {topic.situation_factor}
                              </span>
                            )}
                            <h3 className={cn(
                              "text-sm font-medium leading-tight",
                              isSelected ? "text-emerald-100" : "text-slate-200"
                            )}>
                              {topic.name}
                            </h3>
                          </div>
                          
                          {/* Weight */}
                          {isEditing ? (
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={weight}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleWeightChange(topic.id, Number.parseInt(e.target.value) || 50);
                              }}
                              onBlur={() => handleWeightBlur(topic.id)}
                              onKeyDown={(e) => e.key === "Enter" && handleWeightBlur(topic.id)}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                              className={cn(
                                "w-14 h-6 text-xs font-bold rounded border text-center",
                                "bg-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500",
                                getWeightColor(weight)
                              )}
                            />
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingWeight(topic.id);
                              }}
                              className={cn(
                                "flex items-center gap-1 px-2 py-1 text-xs font-bold rounded border",
                                getWeightColor(weight)
                              )}
                            >
                              <Weight className="h-3 w-3" />
                              {weight}
                            </button>
                          )}
                        </div>
                        
                        {/* Rationale */}
                        {topic.rationale && (
                          <p className="text-xs text-slate-500 mb-2 line-clamp-2">
                            {topic.rationale}
                          </p>
                        )}
                        
                        {/* Status indicators */}
                        <div className="flex items-center gap-3 text-[10px]">
                          {topic.has_cached_urls && (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <LinkIcon className="h-3 w-3" /> URLs
                            </span>
                          )}
                          {topic.synthesis && (
                            <span className="text-violet-400 flex items-center gap-1">
                              <FileText className="h-3 w-3" /> Synthesis
                            </span>
                          )}
                          <Link
                            to={`/topic/${topic.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-slate-500 hover:text-violet-400 flex items-center gap-1"
                          >
                            Details <ChevronRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Add Custom Topic */}
          <Card className="border-slate-700 bg-slate-800/50 mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-slate-100 flex items-center gap-2">
                <Plus className="h-4 w-4 text-emerald-400" />
                Add Custom Topic
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  placeholder="Topic name (e.g. 'Impact of AI on EU labor market')"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  onKeyDown={(e) => e.key === "Enter" && handleAddCustomTopic()}
                />
                <Button
                  onClick={handleAddCustomTopic}
                  disabled={isAddingTopic || !newTopicName.trim()}
                  className="bg-emerald-500 hover:bg-emerald-600"
                >
                  {isAddingTopic ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Feedback for Regeneration */}
          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-slate-100 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-violet-400" />
                Change Analysis Direction
              </CardTitle>
              <CardDescription>
                If topics don't match your needs, describe what you're looking for
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="e.g. 'More topics on energy security, less on trade. Focus on China relations.'"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500 min-h-[80px] resize-none"
                />
                <Button
                  onClick={handleRegenerateTopics}
                  disabled={isRegenerating || !feedback.trim()}
                  variant="outline"
                  className="border-violet-500/50 text-violet-400 hover:bg-violet-500/10 self-end"
                >
                  {isRegenerating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Regenerate
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ====================
  // PROCESSING VIEW
  // ====================
  if (viewMode === "processing") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <Card className="border-slate-700 bg-slate-800/50 w-full max-w-2xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4">
              {isProcessing ? (
                <Loader2 className="h-16 w-16 animate-spin text-emerald-500" />
              ) : (
                <Zap className="h-16 w-16 text-emerald-500" />
              )}
            </div>
            <CardTitle className="text-2xl text-slate-100">
              {isProcessing ? "Processing Topics..." : "Processing Complete!"}
            </CardTitle>
            <CardDescription>
              {isProcessing 
                ? progress?.message || "Initializing..."
                : `Processed ${processingStatus?.topics_processed || 0} topics`
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Real-time Progress Bar */}
            {isProcessing && progress && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">{progress.sub_step || progress.step}</span>
                  <span className="text-emerald-400 font-mono">{progress.percent}%</span>
                </div>
                <div className="h-3 bg-slate-900 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-500 to-violet-500 transition-all duration-500 ease-out"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <div className="text-center text-xs text-slate-500">
                  Krok {progress.current} z {progress.total}
                </div>
              </div>
            )}

            {processingStatus && (
              <>
                {/* Progress Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-900/50 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-emerald-400">
                      {processingStatus.urls_fetched}
                    </div>
                    <div className="text-xs text-slate-500">URLs fetched</div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-blue-400">
                      {processingStatus.articles_summarized}
                    </div>
                    <div className="text-xs text-slate-500">Articles summarized</div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-orange-400">
                      {processingStatus.countries_processed}
                    </div>
                    <div className="text-xs text-slate-500">Countries analyzed</div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-violet-400">
                      {processingStatus.syntheses_generated}
                    </div>
                    <div className="text-xs text-slate-500">Syntheses generated</div>
                  </div>
                </div>

                {/* Topic Results */}
                {processingStatus.topic_results.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-slate-300">Results per topic:</h4>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {processingStatus.topic_results.map((tr) => (
                        <div 
                          key={tr.topic_id}
                          className={cn(
                            "flex items-center justify-between p-2 rounded text-xs",
                            tr.error ? "bg-red-500/10" : "bg-slate-900/50"
                          )}
                        >
                          <span className="text-slate-300 truncate flex-1">{tr.topic_name}</span>
                          <div className="flex items-center gap-3 text-slate-500">
                            <span>{tr.urls_count} URL</span>
                            <span>{tr.articles_count} art.</span>
                            <span>{tr.countries_count} ctry.</span>
                            {tr.synthesis_generated && (
                              <Check className="h-4 w-4 text-emerald-400" />
                            )}
                            {tr.error && (
                              <span className="text-red-400">!</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setViewMode("topics")}
                className="flex-1 border-slate-700"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Topics
              </Button>
              <Button
                onClick={handleGenerateReport}
                disabled={isGeneratingReport || (processingStatus?.syntheses_generated || 0) === 0}
                className="flex-1 bg-gradient-to-r from-violet-500 to-purple-500"
              >
                {isGeneratingReport ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                Generate Final Report
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ====================
  // FINAL REPORT VIEW WITH SIDEBAR
  // ====================
  if (viewMode === "report" && finalReport) {
    const getSectionIcon = (type: string) => {
      switch (type) {
        case "situation": return <Globe className="h-5 w-5" />;
        case "positive_12m": return <TrendingUp className="h-5 w-5 text-emerald-400" />;
        case "negative_12m": return <TrendingDown className="h-5 w-5 text-red-400" />;
        case "positive_36m": return <TrendingUp className="h-5 w-5 text-emerald-400" />;
        case "negative_36m": return <TrendingDown className="h-5 w-5 text-red-400" />;
        case "recommendations": return <Lightbulb className="h-5 w-5 text-yellow-400" />;
        default: return <BookOpen className="h-5 w-5" />;
      }
    };

    const getSectionStyle = (type: string) => {
      if (type.includes("positive")) return "border-emerald-500/30 bg-emerald-500/5";
      if (type.includes("negative")) return "border-red-500/30 bg-red-500/5";
      if (type === "recommendations") return "border-yellow-500/30 bg-yellow-500/5";
      return "border-slate-700 bg-slate-800/50";
    };

    return (
      <div className="min-h-screen bg-slate-900 flex">
        {/* Sidebar */}
        <AnalysisTreeNav
          sessionId={Number(sessionId)}
          sessionName={session?.name || `Sesja #${sessionId}`}
          topics={treeNavTopics}
          hasReport={true}
        />

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          {/* Header */}
          <div className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Button
                    variant="ghost"
                    onClick={() => setViewMode("topics")}
                    className="text-slate-400 hover:text-slate-100"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Topics
                  </Button>
                  <div>
                    <h1 className="text-xl font-bold text-slate-100">
                      📊 Final Report
                    </h1>
                    <p className="text-sm text-slate-400">
                      Based on {finalReport.topics_used.length} topics
                    </p>
                  </div>
                </div>
                
                <Button
                  onClick={handleGenerateReport}
                  disabled={isGeneratingReport}
                  variant="outline"
                  className="border-slate-700"
                >
                  {isGeneratingReport ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Regenerate
                </Button>
              </div>
            </div>
          </div>

          {/* Report Content */}
          <div className="max-w-4xl mx-auto px-6 py-8">
            {/* Sections */}
            <div className="space-y-6">
              {finalReport.sections.map((section, idx) => (
                <Card key={idx} className={cn("border", getSectionStyle(section.type))}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-slate-100 flex items-center gap-3">
                      {getSectionIcon(section.type)}
                      {section.title}
                      {/* Evolution score badge */}
                      {section.evolution && (
                        <span className="ml-auto text-xs font-normal px-2 py-1 rounded-full bg-violet-500/20 text-violet-300">
                          Score: {section.evolution.final_score}/150
                          {section.evolution.improvement > 0 && (
                            <span className="text-emerald-400 ml-1">+{section.evolution.improvement}</span>
                          )}
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReportContent text={section.content} topicsUsed={finalReport.topics_used} />
                    </div>
                    
                    {/* Evolution History Accordion */}
                    {section.evolution && section.evolution.history && section.evolution.history.length > 0 && (
                      <EvolutionHistoryPanel evolution={section.evolution} sectionType={section.type} />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Generated at */}
            <div className="mt-8 text-center text-xs text-slate-500">
              Generated: {new Date(finalReport.generated_at).toLocaleString("en-US")}
            </div>

            {/* === SOURCES LEGEND with anchors === */}
            {sourcesData && sourcesData.total_sources > 0 && (
              <Card id="sources-legend" className="border-slate-700 bg-slate-800/50 mt-6">
                <CardHeader className="pb-3">
                  <button
                    onClick={() => setShowSourcesLegend(!showSourcesLegend)}
                    className="w-full flex items-center justify-between"
                  >
                    <CardTitle className="text-lg text-slate-100 flex items-center gap-3">
                      <LinkIcon className="h-5 w-5 text-cyan-400" />
                      📚 Sources Legend
                      <span className="text-xs font-normal px-2 py-1 rounded-full bg-cyan-500/20 text-cyan-300">
                        {sourcesData.total_sources} źródeł
                      </span>
                    </CardTitle>
                    {showSourcesLegend ? (
                      <ChevronUp className="h-5 w-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-slate-400" />
                    )}
                  </button>
                  <CardDescription className="text-slate-400 text-sm mt-2">
                    Click on citation in text to navigate here. Format: [Country-T#-N] e.g. [USA-T5-1]
                  </CardDescription>
                </CardHeader>
                
                {showSourcesLegend && (
                  <CardContent className="pt-0 space-y-6">
                    {/* User Facts */}
                    {sourcesData.user_facts.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-amber-300 mb-3 flex items-center gap-2">
                          <BookOpen className="h-4 w-4" />
                          Fakty Bazowe (Ground Truth)
                        </h4>
                        <div className="space-y-2 ml-6">
                          {sourcesData.user_facts.map((src) => (
                            <div 
                              key={src.id}
                              id={`source-${src.id}`}
                              className="flex items-start gap-3 p-2 rounded bg-amber-500/5 border border-amber-500/20 transition-all"
                            >
                              <span className="flex-shrink-0 px-2 py-0.5 rounded text-xs font-mono bg-amber-500/20 text-amber-300">
                                {src.citation}
                              </span>
                              <div className="flex-1">
                                <p className="text-sm text-slate-200">{src.content}</p>
                                {src.weight && (
                                  <span className="text-xs text-slate-500">weight: {src.weight}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Sources by Topic */}
                    {Object.values(sourcesData.sources_by_topic).map((topicData) => (
                      <div key={topicData.topic_id} className="border-t border-slate-700/50 pt-4">
                        <h4 className="text-sm font-semibold text-violet-300 mb-3 flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Temat #{topicData.topic_id}: {topicData.topic_name}
                          <span className="text-xs text-slate-500 font-mono">{topicData.topic_citation}</span>
                        </h4>
                        
                        {Object.entries(topicData.countries).map(([country, sources]) => (
                          <div key={country} className="mb-3 ml-4">
                            <h5 className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-2">
                              <Globe className="h-3 w-3" />
                              {country}
                              <span className="text-slate-600">({sources.length})</span>
                            </h5>
                            <div className="space-y-1.5 ml-4">
                              {sources.map((src) => (
                                <div 
                                  key={src.id}
                                  id={`source-${src.id}`}
                                  className="flex items-start gap-2 p-2 rounded bg-slate-900/50 border border-slate-700/30 transition-all hover:border-cyan-500/30"
                                >
                                  <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                    {src.citation}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-slate-300 line-clamp-1" title={src.title}>
                                      {src.title || "Untitled"}
                                    </p>
                                    {src.url && (
                                      <a 
                                        href={src.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-[10px] text-cyan-400 hover:text-cyan-300 truncate block"
                                      >
                                        🔗 {new URL(src.url).hostname}
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            )}
            
            {/* === MODIFY REPORT SECTION === */}
            <ReportModificationPanel
              topics={topics}
              selectedIds={selectedIds}
              onToggleTopic={handleToggleTopic}
              onUpdateReport={handleUpdateReport}
              onAddTopic={handleAddTopic}
              isUpdating={isUpdatingReport}
              isAddingTopic={isAddingTopic}
              sessionId={Number(sessionId)}
            />
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Helper component to render report content with CLICKABLE citations that scroll to legend
function ReportContent({ 
  text, 
  topicsUsed = [] 
}: { 
  text: string; 
  topicsUsed?: Array<{ id: number; name: string; weight: number }>;
}) {
  const lines = text.split('\n').filter(line => line.trim());
  
  // Extract citation ID from [Country-T#-N] or [USER-x] format
  const getCitationId = (citation: string): string | null => {
    const clean = citation.replace(/[\[\]]/g, '').trim();
    // Match patterns like:
    // - USA-T5-1, Germany-T3-2 (country with topic and number)
    // - USA-T5, Germany-T3 (country with topic, no number)
    // - USER-a, USER-b (user facts)
    // - Saudi Arabia-T5-1 (countries with spaces)
    if (clean.match(/^[\w\s]+-T\d+-\d+$/) || clean.match(/^[\w\s]+-T\d+$/) || clean.match(/^USER-[a-z]$/i)) {
      return clean;
    }
    return null;
  };
  
  // Scroll to source in legend
  const scrollToSource = (citationId: string) => {
    // First scroll to sources legend
    const legendEl = document.getElementById('sources-legend');
    if (legendEl) {
      legendEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    // Then highlight specific source after a short delay
    setTimeout(() => {
      const sourceEl = document.getElementById(`source-${citationId}`);
      if (sourceEl) {
        sourceEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        sourceEl.classList.add('ring-2', 'ring-cyan-400', 'bg-cyan-500/10');
        setTimeout(() => {
          sourceEl.classList.remove('ring-2', 'ring-cyan-400', 'bg-cyan-500/10');
        }, 3000);
      }
    }, 300);
  };
  
  const renderWithCitations = (content: string) => {
    // Match [anything] pattern - includes multi-citation like [USA-T5-1, Germany-T5-2]
    const parts = content.split(/(\[[A-Za-z0-9\s\-,]+\])/g);
    
    return parts.map((part, i) => {
      if (part.match(/^\[[A-Za-z0-9\s\-,]+\]$/)) {
        // Extract inner content and split by comma for multi-citations
        const inner = part.slice(1, -1); // Remove [ and ]
        const citations = inner.split(/,\s*/).map(c => c.trim()).filter(Boolean);
        
        // If multiple citations, render each separately
        if (citations.length > 1) {
          return (
            <span key={i}>
              [
              {citations.map((cite, ci) => {
                const citationId = getCitationId(`[${cite}]`);
                const isUser = cite.startsWith('USER-');
                const bgClass = isUser 
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' 
                  : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
                return (
                  <span key={ci}>
                    {ci > 0 && ', '}
                    <button 
                      onClick={() => citationId && scrollToSource(citationId)}
                      className={`font-mono text-xs ${bgClass} px-0.5 rounded cursor-pointer hover:opacity-80 transition-colors border`}
                      title="Click to go to source"
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
        
        // Single citation
        const citationId = getCitationId(part);
        
        // USER facts - amber color
        if (part.startsWith('[USER-')) {
          return (
            <button 
              key={i}
              onClick={() => citationId && scrollToSource(citationId)}
              className="font-mono text-xs bg-amber-500/20 text-amber-300 px-1 rounded cursor-pointer hover:bg-amber-500/40 transition-colors border border-amber-500/30"
              title="Click to go to source"
            >
              {part}
            </button>
          );
        }
        
        // Country sources with T# format - cyan color
        if (citationId) {
          return (
            <button 
              key={i}
              onClick={() => scrollToSource(citationId)}
              className="font-mono text-xs bg-cyan-500/20 text-cyan-300 px-1 rounded cursor-pointer hover:bg-cyan-500/40 transition-colors border border-cyan-500/30"
              title="Click to go to source"
            >
              {part}
            </button>
          );
        }
        
        // Other citations - default style
        return (
          <span 
            key={i} 
            className="font-mono text-xs bg-slate-600/30 text-slate-400 px-1 rounded"
          >
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="space-y-4 text-slate-300 leading-relaxed">
      {lines.map((line, idx) => (
        <p key={idx}>{renderWithCitations(line)}</p>
      ))}
    </div>
  );
}

// Panel to modify the report - manage topics
function ReportModificationPanel({
  topics,
  selectedIds,
  onToggleTopic,
  onUpdateReport,
  onAddTopic,
  isUpdating,
  isAddingTopic,
  sessionId,
}: {
  topics: Topic[];
  selectedIds: Set<number>;
  onToggleTopic: (id: number) => void;
  onUpdateReport: () => void;
  onAddTopic: (name: string) => Promise<void>;
  isUpdating: boolean;
  isAddingTopic: boolean;
  sessionId: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  
  // Count topics with/without synthesis
  const selectedWithSynthesis = topics.filter(t => selectedIds.has(t.id) && t.synthesis);
  const selectedWithoutSynthesis = topics.filter(t => selectedIds.has(t.id) && !t.synthesis);
  const unselectedWithSynthesis = topics.filter(t => !selectedIds.has(t.id) && t.synthesis);
  
  const handleAddTopic = async () => {
    if (!newTopicName.trim()) return;
    await onAddTopic(newTopicName.trim());
    setNewTopicName("");
  };
  
  return (
    <Card className="border-slate-700 bg-slate-800/50 mt-12">
      <CardHeader 
        className="cursor-pointer hover:bg-slate-700/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-violet-400" />
            Modify Report
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {selectedIds.size} selected • {selectedWithoutSynthesis.length} to process
            </span>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            )}
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-6">
          {/* Add new topic */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">
              Add new topic
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTopic()}
                placeholder="e.g. 'Impact of AI on EU labor market'"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <Button
                onClick={handleAddTopic}
                disabled={isAddingTopic || !newTopicName.trim()}
                className="bg-emerald-500 hover:bg-emerald-600"
              >
                {isAddingTopic ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              AI wygeneruje słowa kluczowe automatycznie
            </p>
          </div>
          
          {/* Topic selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-slate-300">
                Manage topics
              </label>
              <div className="text-xs text-slate-500">
                🟢 ready • 🟣 to process
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto p-1">
              {topics.map((topic) => {
                const isSelected = selectedIds.has(topic.id);
                const hasSynthesis = !!topic.synthesis;
                
                return (
                  <div
                    key={topic.id}
                    onClick={() => onToggleTopic(topic.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                      isSelected
                        ? hasSynthesis
                          ? "border-emerald-500/50 bg-emerald-500/10"
                          : "border-violet-500/50 bg-violet-500/10"
                        : "border-slate-700 bg-slate-900/50 hover:border-slate-600"
                    )}
                  >
                    {/* Checkbox */}
                    <div
                      className={cn(
                        "flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-all",
                        isSelected
                          ? hasSynthesis
                            ? "bg-emerald-500 border-emerald-500"
                            : "bg-violet-500 border-violet-500"
                          : "border-slate-500"
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    
                    {/* Topic info */}
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "text-sm truncate",
                        isSelected ? "text-slate-100" : "text-slate-400"
                      )}>
                        {topic.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        weight: {topic.weight}
                      </div>
                    </div>
                    
                    {/* Status indicator */}
                    <div className="flex items-center gap-2 text-xs">
                      {hasSynthesis ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> ready
                        </span>
                      ) : (
                        <span className="text-slate-500">
                          new
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Summary & Action */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-700">
            <div className="text-sm text-slate-400">
              {selectedWithSynthesis.length > 0 && (
                <span className="text-emerald-400 mr-3">
                  ✓ {selectedWithSynthesis.length} ready
                </span>
              )}
              {selectedWithoutSynthesis.length > 0 && (
                <span className="text-violet-400">
                  ⟳ {selectedWithoutSynthesis.length} to process
                </span>
              )}
              {unselectedWithSynthesis.length > 0 && (
                <span className="text-slate-500 ml-3">
                  ({unselectedWithSynthesis.length} unused)
                </span>
              )}
            </div>
            
            <Button
              onClick={onUpdateReport}
              disabled={isUpdating || selectedIds.size === 0}
              className="bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600"
            >
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Update Report
                  {selectedWithoutSynthesis.length > 0 && (
                    <span className="ml-2 text-xs opacity-75">
                      (+{selectedWithoutSynthesis.length} new)
                    </span>
                  )}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
