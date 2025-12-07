import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles, GitBranch, MessageSquare, TrendingUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface EvolutionStep {
  iteration: number;
  score: number;
  scores: {
    hall?: number;  // 0-50: hallucinations
    cite?: number;  // 0-35: citations (format + density)
    bias?: number;  // 0-35: source credibility (Russia/China attribution, single-source)
    qual?: number;  // 0-30: quality
  };
  feedback: string;
  content: string;
}

interface EvolutionData {
  initial_score: number;
  final_score: number;
  improvement: number;
  iterations: number;
  history: EvolutionStep[];
}

interface Props {
  evolution: EvolutionData | null | undefined;
  title?: string;
}

export function EvolutionHistory({ evolution, title = "Evolution history" }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);

  if (!evolution || !evolution.history || evolution.history.length === 0) {
    return (
      <div className="mt-4 border border-slate-700/50 rounded-lg bg-slate-800/20 px-4 py-3">
        <div className="flex items-center gap-3 text-slate-500">
          <GitBranch className="h-4 w-4" />
          <span className="text-sm">No evolution history - refresh synthesis 🔄</span>
        </div>
      </div>
    );
  }

  const { history, initial_score, final_score, improvement } = evolution;
  const isImproved = improvement > 0;

  return (
    <div className="mt-4 border border-slate-700 rounded-lg bg-slate-800/30 overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <GitBranch className="h-4 w-4 text-violet-400" />
          <span className="font-medium text-slate-200">{title}</span>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full font-mono",
              isImproved ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
            )}>
              {initial_score.toFixed(0)} → {final_score.toFixed(0)}
            </span>
            {isImproved && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                +{improvement.toFixed(0)}
              </span>
            )}
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="border-t border-slate-700">
          {/* Iteration tabs */}
          <div className="flex gap-1 p-2 bg-slate-900/50 border-b border-slate-700">
            {history.map((step, idx) => {
              const scores = step.scores || {};
              const hasHallIssue = scores.hall !== undefined && scores.hall < 40;
              const hasCiteIssue = scores.cite !== undefined && scores.cite < 25;
              const hasBiasIssue = scores.bias !== undefined && scores.bias < 25;
              
              return (
                <button
                  key={step.iteration}
                  onClick={() => setSelectedStep(selectedStep === idx ? null : idx)}
                  className={cn(
                    "px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                    selectedStep === idx
                      ? "bg-violet-500/30 text-violet-200 border border-violet-500/50"
                      : "bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                  )}
                >
                  <span>v{step.iteration}</span>
                  <span className={cn(
                    "font-mono text-xs",
                    step.score >= 130 ? "text-emerald-400" : step.score >= 100 ? "text-amber-400" : "text-red-400"
                  )}>
                    {step.score}/150
                  </span>
                  {hasHallIssue && (
                    <span title="Hallucination issue">
                      <AlertTriangle className="h-3 w-3 text-red-400" />
                    </span>
                  )}
                  {hasCiteIssue && (
                    <span title="Insufficient citations">
                      <AlertTriangle className="h-3 w-3 text-emerald-400" />
                    </span>
                  )}
                  {hasBiasIssue && (
                    <span title="Source credibility issue">
                      <AlertTriangle className="h-3 w-3 text-cyan-400" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected step details */}
          {selectedStep !== null && history[selectedStep] && (
            <div className="p-4 space-y-4">
              {/* Score breakdown */}
              <div className="flex flex-wrap gap-3">
                {history[selectedStep].scores && Object.entries(history[selectedStep].scores).map(([key, value]) => {
                  const getLabel = (k: string) => {
                    switch (k) {
                      case "hall": return "🛡️ hallucinations";
                      case "cite": return "📝 citations";
                      case "bias": return "🔍 credibility";
                      case "qual": return "✨ quality";
                      default: return k;
                    }
                  };
                  
                  const getMax = (k: string) => {
                    switch (k) {
                      case "hall": return 50;
                      case "cite": return 35;
                      case "bias": return 35;
                      case "qual": return 30;
                      default: return 25;
                    }
                  };
                  
                  const getScoreColor = (k: string, v: number) => {
                    const max = getMax(k);
                    const ratio = v / max;
                    if (ratio >= 0.8) return "text-emerald-400";
                    if (ratio >= 0.6) return "text-amber-400";
                    return "text-red-400";
                  };
                  
                  const getBgColor = (k: string) => {
                    switch (k) {
                      case "hall": return "bg-violet-500/20";
                      case "cite": return "bg-emerald-500/20";
                      case "bias": return "bg-cyan-500/20";
                      case "qual": return "bg-amber-500/20";
                      default: return "bg-slate-700/50";
                    }
                  };
                  
                  return (
                  <div 
                    key={key}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm flex items-center gap-2",
                        getBgColor(key)
                    )}
                  >
                      <span className="text-slate-400">
                        {getLabel(key)}
                    </span>
                    <span className={cn(
                      "font-mono font-bold",
                        getScoreColor(key, value as number)
                    )}>
                        {value}/{getMax(key)}
                    </span>
                  </div>
                  );
                })}
              </div>

              {/* Feedback section */}
              {history[selectedStep].feedback && (
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2 text-sm text-slate-400">
                    <MessageSquare className="h-4 w-4" />
                    <span>Agent feedback</span>
                  </div>
                  <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                    {history[selectedStep].feedback}
                  </pre>
                </div>
              )}

              {/* Content preview */}
              {history[selectedStep].content && (
                <div>
                  <button
                    onClick={() => {
                      const el = document.getElementById(`content-${selectedStep}`);
                      if (el) el.classList.toggle("hidden");
                    }}
                    className="text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1"
                  >
                    <Sparkles className="h-3 w-3" />
                    Show/hide v{history[selectedStep].iteration} text
                  </button>
                  <div 
                    id={`content-${selectedStep}`}
                    className="hidden mt-2 bg-slate-900/70 rounded-lg p-4 max-h-64 overflow-y-auto"
                  >
                    <pre className="text-xs text-slate-400 whitespace-pre-wrap font-sans">
                      {history[selectedStep].content}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Summary at bottom */}
          <div className="px-4 py-3 bg-slate-900/30 border-t border-slate-700 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {history.length} iterations • AlphaEvolve + Anti-Poisoning
            </span>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Final quality:</span>
              <span className={cn(
                "font-mono font-bold",
                final_score >= 130 ? "text-emerald-400" : final_score >= 100 ? "text-amber-400" : "text-red-400"
              )}>
                {final_score.toFixed(0)}/150
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

