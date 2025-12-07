import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { InputForm } from "@/components/InputForm";
import type { CountryProfile } from "@/types/analysis";
import { createSession } from "@/api/analysis";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NewSessionPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (
    profile: CountryProfile, 
    situation: string
  ) => {
    setIsLoading(true);
    
    try {
      const response = await createSession(profile, situation);
      
      toast.success(`Utworzono sesję prognozowania z ${response.topics.length} tematami!`);
      navigate(`/session/${response.id}`);
    } catch (error: unknown) {
      console.error("Error creating session:", error);
      const err = error as { status?: number; payload?: { detail?: string }; message?: string };
      
      if (err.status === 0 || err.message?.includes("fetch")) {
        toast.error("Nie można połączyć z serwerem. Sprawdź czy backend działa.");
      } else {
        toast.error(`Błąd: ${err.payload?.detail || err.message || "Nieznany błąd"}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="text-slate-400 hover:text-slate-100"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Powrót
        </Button>
      </div>

      {/* Hero */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mb-4">
          <Sparkles className="h-4 w-4" />
          Nowa Analiza
        </div>
        <h1 className="text-3xl font-bold text-slate-100 mb-3">
          Wprowadź Dane do Analizy
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto">
          Podaj profil państwa Atlantis oraz opis aktualnej sytuacji międzynarodowej.
          Na podstawie tych danych wygenerujemy tematy badawcze.
        </p>
      </div>

      {/* Form */}
      <InputForm 
        onSubmit={handleSubmit} 
        isLoading={isLoading} 
      />
    </div>
  );
}

