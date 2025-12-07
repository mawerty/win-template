import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Topic } from "@/types/analysis";
import { Search, Check, Loader2, ArrowLeft, Sparkles, Weight, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopicGridProps {
  topics: Topic[];
  onSelectTopics: (topicIds: number[]) => void;
  onUpdateWeights: (weights: { topic_id: number; weight: number }[]) => void;
  onGenerateScenarios: () => Promise<void>;
  onBack: () => void;
  isLoading?: boolean;
}

export function TopicGrid({ 
  topics, 
  onSelectTopics, 
  onUpdateWeights,
  onGenerateScenarios,
  onBack,
  isLoading 
}: TopicGridProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [localWeights, setLocalWeights] = useState<Record<number, number>>({});
  const [editingWeight, setEditingWeight] = useState<number | null>(null);

  // Initialize local weights from topics
  useEffect(() => {
    const weights: Record<number, number> = {};
    for (const topic of topics) {
      weights[topic.id] = topic.weight;
    }
    setLocalWeights(weights);
  }, [topics]);

  // Sort topics by weight (descending)
  const sortedTopics = [...topics].sort((a, b) => {
    const weightA = localWeights[a.id] ?? a.weight;
    const weightB = localWeights[b.id] ?? b.weight;
    return weightB - weightA;
  });

  const toggleTopic = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
    onSelectTopics(Array.from(newSelected));
  };

  const selectAll = () => {
    const allIds = new Set(topics.map(t => t.id));
    setSelectedIds(allIds);
    onSelectTopics(Array.from(allIds));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
    onSelectTopics([]);
  };

  const handleWeightChange = (topicId: number, weight: number) => {
    const clampedWeight = Math.max(1, Math.min(100, weight));
    setLocalWeights(prev => ({ ...prev, [topicId]: clampedWeight }));
  };

  const handleWeightBlur = (topicId: number) => {
    setEditingWeight(null);
    // Send update to backend
    const weights = Object.entries(localWeights).map(([id, weight]) => ({
      topic_id: Number(id),
      weight,
    }));
    onUpdateWeights(weights);
  };

  const getWeightColor = (weight: number) => {
    if (weight >= 80) return "text-red-400 bg-red-500/20 border-red-500/50";
    if (weight >= 60) return "text-orange-400 bg-orange-500/20 border-orange-500/50";
    if (weight >= 40) return "text-yellow-400 bg-yellow-500/20 border-yellow-500/50";
    return "text-slate-400 bg-slate-500/20 border-slate-500/50";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-slate-400 hover:text-slate-100"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Wróć do danych
        </Button>
        
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">
            Wybrano: <span className="text-emerald-400 font-semibold">{selectedIds.size}</span> / {topics.length}
          </span>
          <Button variant="outline" size="sm" onClick={selectAll} className="border-slate-600 text-slate-300 hover:bg-slate-700">
            Zaznacz wszystkie
          </Button>
          <Button variant="outline" size="sm" onClick={deselectAll} className="border-slate-600 text-slate-300 hover:bg-slate-700">
            Odznacz wszystkie
          </Button>
        </div>
      </div>

      {/* Topic Grid */}
      <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-500/10">
              <Search className="h-5 w-5 text-violet-400" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg text-slate-100">Tematy do Analizy</CardTitle>
              <CardDescription className="text-slate-400">
                Wybierz tematy i dostosuj ich wagi. Tematy posortowane według ważności.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Info className="h-3 w-3" />
              <span>Kliknij wagę, aby edytować</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sortedTopics.map((topic, index) => {
              const isSelected = selectedIds.has(topic.id);
              const isHovered = hoveredId === topic.id;
              const weight = localWeights[topic.id] ?? topic.weight;
              const isEditing = editingWeight === topic.id;
              
              return (
                <div
                  key={topic.id}
                  className="relative"
                  onMouseEnter={() => setHoveredId(topic.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div
                    className={cn(
                      "w-full p-4 rounded-lg border-2 transition-all duration-200",
                      "hover:shadow-lg",
                      isSelected
                        ? "border-emerald-500 bg-emerald-500/10 shadow-emerald-500/20"
                        : "border-slate-600 bg-slate-900/30 hover:border-slate-500"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleTopic(topic.id)}
                        className={cn(
                          "flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all mt-0.5",
                          isSelected
                            ? "bg-emerald-500 border-emerald-500"
                            : "border-slate-500 hover:border-slate-400"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </button>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            onClick={() => toggleTopic(topic.id)}
                            className={cn(
                              "text-sm font-medium leading-tight text-left",
                              isSelected ? "text-emerald-100" : "text-slate-200"
                            )}
                          >
                            {topic.name}
                          </button>
                          
                          {/* Weight Badge */}
                          <div className="flex-shrink-0">
                            {isEditing ? (
                              <input
                                type="number"
                                min={1}
                                max={100}
                                value={weight}
                                onChange={(e) => handleWeightChange(topic.id, Number.parseInt(e.target.value) || 50)}
                                onBlur={() => handleWeightBlur(topic.id)}
                                onKeyDown={(e) => e.key === "Enter" && handleWeightBlur(topic.id)}
                                autoFocus
                                className={cn(
                                  "w-14 h-6 text-xs font-bold rounded border text-center",
                                  "bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500",
                                  getWeightColor(weight)
                                )}
                              />
                            ) : (
                              <button
                                onClick={() => setEditingWeight(topic.id)}
                                className={cn(
                                  "flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded border transition-all",
                                  "hover:scale-105",
                                  getWeightColor(weight)
                                )}
                                title="Kliknij, aby zmienić wagę"
                              >
                                <Weight className="h-3 w-3" />
                                {weight}
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {/* Rationale */}
                        {topic.rationale && (
                          <p className="mt-1 text-xs text-slate-500 line-clamp-1">
                            {topic.rationale}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Keywords Tooltip */}
                  {isHovered && !isEditing && (
                    <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg shadow-xl min-w-[250px] max-w-[350px]">
                      <div className="text-xs text-slate-400 mb-1">Słowa kluczowe:</div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {topic.keywords.map((keyword, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 text-xs bg-slate-700 text-slate-200 rounded"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                      {topic.rationale && (
                        <>
                          <div className="text-xs text-slate-400 mb-1">Uzasadnienie:</div>
                          <p className="text-xs text-slate-300">{topic.rationale}</p>
                        </>
                      )}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                        <div className="border-8 border-transparent border-t-slate-900" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Weight Legend */}
      <div className="flex items-center justify-center gap-4 text-xs">
        <span className="text-slate-500">Legenda wag:</span>
        <span className={cn("px-2 py-0.5 rounded border", getWeightColor(85))}>80-100 Krytyczne</span>
        <span className={cn("px-2 py-0.5 rounded border", getWeightColor(65))}>60-79 Wysokie</span>
        <span className={cn("px-2 py-0.5 rounded border", getWeightColor(45))}>40-59 Średnie</span>
        <span className={cn("px-2 py-0.5 rounded border", getWeightColor(25))}>1-39 Niskie</span>
      </div>

      {/* Generate Button */}
      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={onGenerateScenarios}
          disabled={selectedIds.size === 0 || isLoading}
          className="bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white px-8 py-6 text-lg font-semibold shadow-lg shadow-violet-500/25 transition-all hover:shadow-violet-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Generowanie scenariuszy...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              Generuj Scenariusze ({selectedIds.size} tematów)
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
