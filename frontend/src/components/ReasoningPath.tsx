import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ReasoningStep } from "@/types/analysis";
import { 
  ChevronDown, 
  ChevronUp, 
  ArrowRight, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Weight,
  Shield,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";

interface ReasoningPathProps {
  steps: ReasoningStep[];
  variant: "positive" | "negative";
  className?: string;
}

export function ReasoningPath({ steps, variant, className }: ReasoningPathProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!steps || steps.length === 0) {
    return null;
  }

  // Sort by weight (most important first)
  const sortedSteps = [...steps].sort((a, b) => b.source_weight - a.source_weight);

  const getImpactIcon = (impact: string) => {
    switch (impact) {
      case "positive":
        return <TrendingUp className="h-4 w-4 text-emerald-400" />;
      case "negative":
        return <TrendingDown className="h-4 w-4 text-red-400" />;
      default:
        return <Minus className="h-4 w-4 text-slate-400" />;
    }
  };

  const getConfidenceIcon = (confidence: string) => {
    switch (confidence) {
      case "high":
        return <CheckCircle2 className="h-3 w-3 text-emerald-400" />;
      case "medium":
        return <AlertCircle className="h-3 w-3 text-amber-400" />;
      default:
        return <HelpCircle className="h-3 w-3 text-slate-500" />;
    }
  };

  const getConfidenceLabel = (confidence: string) => {
    switch (confidence) {
      case "high":
        return "Wysoka pewność";
      case "medium":
        return "Średnia pewność";
      default:
        return "Niska pewność";
    }
  };

  const getWeightColor = (weight: number) => {
    if (weight >= 25) return "bg-red-500/20 text-red-300 border-red-500/50";
    if (weight >= 15) return "bg-orange-500/20 text-orange-300 border-orange-500/50";
    if (weight >= 10) return "bg-yellow-500/20 text-yellow-300 border-yellow-500/50";
    return "bg-slate-500/20 text-slate-300 border-slate-500/50";
  };

  return (
    <div className={cn("border-t border-slate-700 pt-4 mt-4", className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors w-full"
      >
        <Shield className="h-4 w-4" />
        <span className="font-medium">Ścieżka wnioskowania</span>
        <span className="text-xs text-slate-500">({steps.length} kroków)</span>
        <div className="flex-1" />
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-4 space-y-3">
          {sortedSteps.map((step, idx) => (
            <div
              key={idx}
              className={cn(
                "rounded-lg border p-4 transition-all",
                variant === "positive"
                  ? "bg-emerald-950/30 border-emerald-500/20"
                  : "bg-red-950/30 border-red-500/20"
              )}
            >
              {/* Header with weight and confidence */}
              <div className="flex items-center gap-3 mb-3">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded border",
                    getWeightColor(step.source_weight)
                  )}
                  title="Waga źródłowa"
                >
                  <Weight className="h-3 w-3" />
                  {step.source_weight}
                </span>
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-slate-800 text-slate-300"
                  title={getConfidenceLabel(step.confidence)}
                >
                  {getConfidenceIcon(step.confidence)}
                  {step.confidence}
                </span>
                <div className="flex-1" />
                {getImpactIcon(step.impact)}
              </div>

              {/* Reasoning flow: Fact → Inference */}
              <div className="flex flex-col gap-2">
                {/* Fact */}
                <div className="flex items-start gap-2">
                  <div className="flex-shrink-0 w-16 text-xs font-medium text-slate-500 pt-0.5">
                    FAKT
                  </div>
                  <div className="flex-1 text-sm text-slate-200 bg-slate-900/50 rounded px-3 py-2 font-mono">
                    {step.fact}
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex items-center gap-2 pl-16">
                  <ArrowRight className="h-4 w-4 text-slate-500" />
                  <span className="text-xs text-slate-500">prowadzi do</span>
                </div>

                {/* Inference */}
                <div className="flex items-start gap-2">
                  <div className="flex-shrink-0 w-16 text-xs font-medium text-slate-500 pt-0.5">
                    WNIOSEK
                  </div>
                  <div
                    className={cn(
                      "flex-1 text-sm rounded px-3 py-2",
                      step.impact === "positive"
                        ? "bg-emerald-500/10 text-emerald-200"
                        : step.impact === "negative"
                        ? "bg-red-500/10 text-red-200"
                        : "bg-slate-700/50 text-slate-200"
                    )}
                  >
                    {step.inference}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Summary */}
          <div className="mt-4 p-3 rounded-lg bg-slate-900/50 border border-slate-700">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                Suma wag: {sortedSteps.reduce((acc, s) => acc + s.source_weight, 0)}
              </span>
              <span>
                Wysokiej pewności:{" "}
                {sortedSteps.filter((s) => s.confidence === "high").length}/
                {sortedSteps.length}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact version for report view
export function ReasoningPathCompact({ 
  steps, 
}: { 
  steps: ReasoningStep[]; 
}) {
  if (!steps || steps.length === 0) {
    return null;
  }

  // Take top 3 by weight
  const topSteps = [...steps]
    .sort((a, b) => b.source_weight - a.source_weight)
    .slice(0, 3);

  return (
    <div className="mt-4 space-y-2">
      <div className="text-xs font-medium text-slate-400 flex items-center gap-1">
        <Shield className="h-3 w-3" />
        Kluczowe wnioskowania:
      </div>
      {topSteps.map((step, idx) => (
        <div
          key={idx}
          className="flex items-center gap-2 text-xs bg-slate-900/50 rounded px-2 py-1.5"
        >
          <span
            className={cn(
              "font-mono px-1.5 py-0.5 rounded text-[10px] font-bold",
              step.source_weight >= 25
                ? "bg-red-500/30 text-red-300"
                : step.source_weight >= 15
                ? "bg-orange-500/30 text-orange-300"
                : "bg-slate-600 text-slate-300"
            )}
          >
            W{step.source_weight}
          </span>
          <span className="text-slate-400 truncate flex-1" title={step.fact}>
            {step.fact}
          </span>
          <ArrowRight className="h-3 w-3 text-slate-600 flex-shrink-0" />
          <span
            className={cn(
              "truncate",
              step.impact === "positive"
                ? "text-emerald-400"
                : step.impact === "negative"
                ? "text-red-400"
                : "text-slate-400"
            )}
            title={step.inference}
          >
            {step.inference}
          </span>
        </div>
      ))}
    </div>
  );
}

