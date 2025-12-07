import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Plus, 
  FileText, 
  Calendar, 
  Trash2, 
  ChevronRight, 
  Sparkles,
  Hash,
  CheckCircle,
  Link2,
  TrendingUp,
  ExternalLink,
} from "lucide-react";
import { listSessions } from "@/api/analysis";
import type { SessionListItem, RecentTopic, GlobalRecentTopic } from "@/types/analysis";
import { cn } from "@/lib/utils";

interface SessionsResponse {
  sessions: SessionListItem[];
  recent_topics: GlobalRecentTopic[];
}

export default function SessionsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [recentTopics, setRecentTopics] = useState<GlobalRecentTopic[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const response = await listSessions() as SessionsResponse;
      setSessions(response.sessions);
      setRecentTopics(response.recent_topics || []);
    } catch (error) {
      console.error("Error loading sessions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (sessionId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!confirm("Czy na pewno chcesz usunąć tę sesję?")) return;
    
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      setRecentTopics(prev => prev.filter(t => t.session_id !== sessionId));
    } catch (error) {
      console.error("Error deleting session:", error);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("pl-PL", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Hero */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mb-4">
          <Sparkles className="h-4 w-4" />
          Powered by Gemini AI
        </div>
        <h1 className="text-4xl font-bold text-slate-100 mb-3">
          Atlantis Analyst
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto">
          Narzędzie analityczne dla ambasadora państwa Atlantis przy UE.
          Generuj scenariusze geopolityczne z pełnym wyjaśnieniem logiki analizy.
        </p>
      </div>

      {/* New Session Button */}
      <div className="flex justify-center mb-8">
        <Button
          size="lg"
          onClick={() => navigate("/new")}
          className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white px-8 py-6 text-lg font-semibold shadow-lg shadow-emerald-500/25"
        >
          <Plus className="mr-2 h-5 w-5" />
          Nowa Analiza
        </Button>
      </div>

      {/* Recent Topics Section - Global */}
      {recentTopics.length > 0 && (
        <Card className="border-violet-500/30 bg-slate-800/50 backdrop-blur mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-100 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-violet-400" />
              Ostatnie Tematy
            </CardTitle>
            <CardDescription className="text-slate-400">
              Najważniejsze tematy ze wszystkich analiz (kliknij aby otworzyć)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {recentTopics.map((topic) => (
                <GlobalTopicChip key={topic.id} topic={topic} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sessions List */}
      <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
            <FileText className="h-5 w-5 text-violet-400" />
            Historia Analiz
          </CardTitle>
          <CardDescription className="text-slate-400">
            Wszystkie zapisane sesje analityczne
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Brak zapisanych analiz</p>
              <p className="text-sm mt-2">Kliknij "Nowa Analiza" aby rozpocząć</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-lg border border-slate-700 bg-slate-900/50 hover:bg-slate-900/80 hover:border-slate-600 transition-all overflow-hidden"
                >
                  {/* Session Header - clickable to go to session */}
                  <Link
                    to={`/session/${session.id}`}
                    className="block p-4 group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-slate-100 group-hover:text-emerald-400 transition-colors">
                          {session.name || `Sesja #${session.id}`}
                        </h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(session.created_at)}
                          </span>
                          <span>
                            {session.topics_count} tematów
                            {session.selected_topics_count > 0 && (
                              <span className="text-emerald-400"> ({session.selected_topics_count} wybranych)</span>
                            )}
                          </span>
                          {session.has_scenarios && (
                            <span className="text-violet-400">
                              {session.scenarios_count} scenariuszy
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => handleDelete(session.id, e)}
                          className="text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                      </div>
                    </div>
                  </Link>
                  
                  {/* Recent Topics - quick links */}
                  {session.recent_topics && session.recent_topics.length > 0 && (
                    <div className="px-4 pb-4 pt-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                        <Hash className="h-3 w-3" />
                        Tematy:
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {session.recent_topics.map((topic) => (
                          <TopicChip key={topic.id} topic={topic} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TopicChip({ topic }: { topic: RecentTopic }) {
  return (
    <Link
      to={`/topic/${topic.id}`}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all",
        "border hover:scale-105",
        topic.selected 
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20"
          : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
      )}
    >
      {/* Status indicators */}
      {topic.has_synthesis && (
        <Sparkles className="h-3 w-3 text-violet-400" />
      )}
      {!topic.has_synthesis && topic.has_cached_urls && (
        <Link2 className="h-3 w-3 text-blue-400" />
      )}
      {topic.selected && !topic.has_synthesis && !topic.has_cached_urls && (
        <CheckCircle className="h-3 w-3 text-emerald-400" />
      )}
      
      {/* Topic name */}
      <span className="truncate max-w-[150px]">{topic.name}</span>
      
      {/* Weight badge */}
      <span className={cn(
        "px-1 py-0.5 rounded text-[10px] font-medium",
        topic.weight >= 70 ? "bg-red-500/20 text-red-300" :
        topic.weight >= 40 ? "bg-amber-500/20 text-amber-300" :
        "bg-slate-600/50 text-slate-400"
      )}>
        {topic.weight}
      </span>
    </Link>
  );
}

function GlobalTopicChip({ topic }: { topic: GlobalRecentTopic }) {
  return (
    <Link
      to={`/topic/${topic.id}`}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all",
        "border hover:scale-105 group",
        topic.has_synthesis 
          ? "bg-violet-500/10 border-violet-500/30 text-violet-300 hover:bg-violet-500/20"
          : topic.has_cached_urls
          ? "bg-blue-500/10 border-blue-500/30 text-blue-300 hover:bg-blue-500/20"
          : topic.selected
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20"
          : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
      )}
    >
      {/* Status icon */}
      {topic.has_synthesis ? (
        <Sparkles className="h-3.5 w-3.5 text-violet-400" />
      ) : topic.has_cached_urls ? (
        <Link2 className="h-3.5 w-3.5 text-blue-400" />
      ) : topic.selected ? (
        <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Hash className="h-3.5 w-3.5 text-slate-500" />
      )}
      
      {/* Topic name */}
      <span className="truncate max-w-[200px]">{topic.name}</span>
      
      {/* Weight badge */}
      <span className={cn(
        "px-1.5 py-0.5 rounded text-[10px] font-bold",
        topic.weight >= 70 ? "bg-red-500/20 text-red-300" :
        topic.weight >= 40 ? "bg-amber-500/20 text-amber-300" :
        "bg-slate-600/50 text-slate-400"
      )}>
        {topic.weight}
      </span>
      
      {/* Session indicator */}
      <span className="text-[10px] text-slate-500 hidden group-hover:inline">
        {topic.session_name}
      </span>
      
      {/* External link icon */}
      <ExternalLink className="h-3 w-3 text-slate-600 group-hover:text-current opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}
