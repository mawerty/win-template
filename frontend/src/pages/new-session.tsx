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
    situation: string,
    criteria: string
  ) => {
    setIsLoading(true);
    
    try {
      const response = await createSession(profile, situation, criteria);
      
      toast.success(`Created forecast session with ${response.topics.length} topics!`);
      navigate(`/session/${response.id}`);
    } catch (error: unknown) {
      console.error("Error creating session:", error);
      const err = error as { status?: number; payload?: { detail?: string }; message?: string };
      
      if (err.status === 0 || err.message?.includes("fetch")) {
        toast.error("Cannot connect to server. Check if backend is running.");
      } else {
        toast.error(`Error: ${err.payload?.detail || err.message || "Unknown error"}`);
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
          Back
        </Button>
      </div>

      {/* Hero */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mb-4">
          <Sparkles className="h-4 w-4" />
          New Analysis
        </div>
        <h1 className="text-3xl font-bold text-slate-100 mb-3">
          Enter Analysis Data
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto">
          Provide Atlantis country profile and current international situation description.
          Based on this data, we will generate research topics.
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

