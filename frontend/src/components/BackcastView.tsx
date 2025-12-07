import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Target, 
  ArrowUp, 
  CheckCircle, 
  AlertTriangle, 
  Zap,
  ChevronDown,
  ChevronUp,
  Calendar,
  Lightbulb
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BackcastData, BackcastStep } from "@/types/analysis";

interface BackcastViewProps {
  data: BackcastData;
  targetState?: string;
  targetYear?: number;
}

function StepCard({ step, isFirst, isLast }: { step: BackcastStep; isFirst: boolean; isLast: boolean }) {
  const [isExpanded, setIsExpanded] = useState(isFirst || isLast);
  
  return (
    <div className="relative">
      {/* Timeline connector */}
      {!isFirst && (
        <div className="absolute left-6 -top-4 h-4 w-0.5 bg-gradient-to-b from-violet-500/50 to-violet-500" />
      )}
      
      {/* Step card */}
      <div 
        className={cn(
          "relative pl-14 pb-6",
          isLast && "pb-0"
        )}
      >
        {/* Year marker */}
        <div className={cn(
          "absolute left-3 top-0 flex h-7 w-7 items-center justify-center rounded-full border-2",
          isFirst 
            ? "bg-violet-500 border-violet-400 text-white" 
            : isLast 
              ? "bg-emerald-500 border-emerald-400 text-white"
              : "bg-slate-800 border-slate-600 text-slate-300"
        )}>
          {isFirst ? (
            <Target className="h-4 w-4" />
          ) : isLast ? (
            <Zap className="h-4 w-4" />
          ) : (
            <Calendar className="h-3 w-3" />
          )}
        </div>
        
        {/* Content */}
        <Card className={cn(
          "border transition-all cursor-pointer hover:border-slate-500",
          isFirst 
            ? "border-violet-500/50 bg-violet-950/30" 
            : isLast 
              ? "border-emerald-500/50 bg-emerald-950/30"
              : "border-slate-700 bg-slate-800/50"
        )}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={cn(
                  "text-2xl font-bold font-mono",
                  isFirst ? "text-violet-400" : isLast ? "text-emerald-400" : "text-slate-300"
                )}>
                  {step.year}
                </span>
                {isFirst && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30">
                    CEL
                  </span>
                )}
                {isLast && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    START
                  </span>
                )}
              </div>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              )}
            </div>
            <CardTitle className="text-sm text-slate-200 font-normal leading-relaxed">
              {step.state}
            </CardTitle>
          </CardHeader>
          
          {isExpanded && (
            <CardContent className="pt-0 space-y-3">
              {/* Prerequisites (for target year) */}
              {step.prerequisites_met && step.prerequisites_met.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-violet-400 font-medium flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Spełnione warunki
                  </div>
                  <ul className="text-sm text-slate-300 space-y-1">
                    {step.prerequisites_met.map((p, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-violet-400 mt-1">•</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Actions required (for middle years) */}
              {step.actions_required && step.actions_required.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-amber-400 font-medium flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    Wymagane działania
                  </div>
                  <ul className="text-sm text-slate-300 space-y-1">
                    {step.actions_required.map((a, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-amber-400 mt-1">→</span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Key milestones */}
              {step.key_milestones && step.key_milestones.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-blue-400 font-medium flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    Kamienie milowe
                  </div>
                  <ul className="text-sm text-slate-300 space-y-1">
                    {step.key_milestones.map((m, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-blue-400 mt-1">◆</span>
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Immediate actions (for current year) */}
              {step.immediate_actions && step.immediate_actions.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    Natychmiastowe działania
                  </div>
                  <ul className="text-sm text-slate-300 space-y-1">
                    {step.immediate_actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-emerald-400 mt-1">★</span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Critical path */}
              {step.critical_path && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <div className="text-xs text-emerald-400 font-medium mb-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Ścieżka krytyczna
                  </div>
                  <p className="text-sm text-emerald-200">{step.critical_path}</p>
                </div>
              )}
              
              {/* Reasoning */}
              {step.reasoning && (
                <div className="pt-2 border-t border-slate-700">
                  <div className="text-xs text-slate-500 flex items-center gap-1 mb-1">
                    <Lightbulb className="h-3 w-3" />
                    Uzasadnienie
                  </div>
                  <p className="text-xs text-slate-400 italic">{step.reasoning}</p>
                </div>
              )}
            </CardContent>
          )}
        </Card>
        
        {/* Arrow down to next step */}
        {!isLast && (
          <div className="flex justify-center py-2">
            <ArrowUp className="h-4 w-4 text-slate-600 rotate-180" />
          </div>
        )}
      </div>
    </div>
  );
}

export function BackcastView({ data, targetState, targetYear }: BackcastViewProps) {
  const [showChainOfThought, setShowChainOfThought] = useState(false);
  
  // Use provided values or fall back to data values
  const displayTargetState = targetState || data.target_state;
  const displayTargetYear = targetYear || data.target_year;
  
  const feasibility = data.feasibility_assessment;
  const steps = data.backcast_steps || [];
  
  // Sort steps by year descending (target year first)
  const sortedSteps = [...steps].sort((a, b) => b.year - a.year);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm mb-4">
          <Target className="h-4 w-4" />
          Analiza Backcasting
        </div>
        <h2 className="text-xl font-semibold text-slate-100 mb-2">
          Ścieżka do celu: {displayTargetYear}
        </h2>
        <p className="text-slate-400 max-w-2xl mx-auto">
          {displayTargetState}
        </p>
      </div>
      
      {/* Feasibility Assessment */}
      {feasibility && (
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className={cn(
                "p-1.5 rounded-lg",
                feasibility.score >= 70 
                  ? "bg-emerald-500/20" 
                  : feasibility.score >= 40 
                    ? "bg-amber-500/20" 
                    : "bg-rose-500/20"
              )}>
                <Target className={cn(
                  "h-4 w-4",
                  feasibility.score >= 70 
                    ? "text-emerald-400" 
                    : feasibility.score >= 40 
                      ? "text-amber-400" 
                      : "text-rose-400"
                )} />
              </div>
              Ocena wykonalności
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Score bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Poziom wykonalności</span>
                <span className={cn(
                  "font-mono font-bold",
                  feasibility.score >= 70 
                    ? "text-emerald-400" 
                    : feasibility.score >= 40 
                      ? "text-amber-400" 
                      : "text-rose-400"
                )}>
                  {feasibility.score}%
                </span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all",
                    feasibility.score >= 70 
                      ? "bg-emerald-500" 
                      : feasibility.score >= 40 
                        ? "bg-amber-500" 
                        : "bg-rose-500"
                  )}
                  style={{ width: `${feasibility.score}%` }}
                />
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4">
              {/* Obstacles */}
              <div className="space-y-2">
                <div className="text-xs text-rose-400 font-medium flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Główne przeszkody
                </div>
                <ul className="text-sm text-slate-300 space-y-1">
                  {feasibility.main_obstacles.map((o, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-rose-400 mt-0.5">✗</span>
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* Enablers */}
              <div className="space-y-2">
                <div className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Czynniki wspierające
                </div>
                <ul className="text-sm text-slate-300 space-y-1">
                  {feasibility.enablers.map((e, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-emerald-400 mt-0.5">✓</span>
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            
            {/* Recommendation */}
            <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
              <div className="text-xs text-slate-500 mb-1">Rekomendacja</div>
              <p className="text-sm text-slate-200">{feasibility.recommendation}</p>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Timeline */}
      <Card className="border-slate-700 bg-slate-800/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-violet-400" />
            Ścieżka wsteczna
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {sortedSteps.map((step, idx) => (
              <StepCard 
                key={step.year} 
                step={step} 
                isFirst={idx === 0}
                isLast={idx === sortedSteps.length - 1}
              />
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Chain of Thought */}
      {data.chain_of_thought && (
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader>
            <button
              onClick={() => setShowChainOfThought(!showChainOfThought)}
              className="w-full flex items-center justify-between"
            >
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-400" />
                Logika analizy (Chain of Thought)
              </CardTitle>
              {showChainOfThought ? (
                <ChevronUp className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              )}
            </button>
          </CardHeader>
          {showChainOfThought && (
            <CardContent>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                {data.chain_of_thought}
              </p>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

