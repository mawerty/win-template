import { useState } from "react";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  DEFAULT_COUNTRY_PROFILE, 
  DEFAULT_SITUATION,
  DEFAULT_CRITERIA,
  type CountryProfile
} from "@/types/analysis";
import { ChevronDown, ChevronUp, Globe, FileText, Loader2, ArrowRight, Building2, Check, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

// Source countries and institutions configuration
const SOURCE_COUNTRIES = [
  { id: "germany", name: "Niemcy", flag: "🇩🇪", region: "europe" },
  { id: "france", name: "Francja", flag: "🇫🇷", region: "europe" },
  { id: "uk", name: "Wielka Brytania", flag: "🇬🇧", region: "europe" },
  { id: "usa", name: "USA", flag: "🇺🇸", region: "americas" },
  { id: "russia", name: "Rosja", flag: "🇷🇺", region: "eurasia" },
  { id: "china", name: "Chiny", flag: "🇨🇳", region: "asia" },
  { id: "india", name: "Indie", flag: "🇮🇳", region: "asia" },
  { id: "saudi_arabia", name: "Arabia Saudyjska", flag: "🇸🇦", region: "middle_east" },
];

const SOURCE_INSTITUTIONS = [
  { id: "eu_commission", name: "Komisja Europejska", icon: "🇪🇺", category: "international" },
  { id: "nato", name: "NATO", icon: "🛡️", category: "security" },
  { id: "un", name: "ONZ", icon: "🇺🇳", category: "international" },
  { id: "oecd", name: "OECD", icon: "📊", category: "economic" },
  { id: "gcc", name: "Gulf Cooperation Council", icon: "🏛️", category: "regional" },
  { id: "iiss", name: "IISS", icon: "🔬", category: "think_tank" },
  { id: "csis", name: "CSIS", icon: "🏛️", category: "think_tank" },
  { id: "chatham_house", name: "Chatham House", icon: "🏛️", category: "think_tank" },
  { id: "ecfr", name: "ECFR", icon: "🏛️", category: "think_tank" },
  { id: "atlantic_council", name: "Atlantic Council", icon: "🏛️", category: "think_tank" },
  { id: "kiel_institute", name: "Kiel Institute", icon: "📈", category: "economic" },
  { id: "nasdaq", name: "NASDAQ", icon: "📈", category: "markets" },
  { id: "lse", name: "London Stock Exchange", icon: "📈", category: "markets" },
  { id: "jpx", name: "Japan Exchange Group", icon: "📈", category: "markets" },
];

const REGIONS = [
  { id: "europe", name: "Europa", color: "blue" },
  { id: "americas", name: "Ameryki", color: "red" },
  { id: "asia", name: "Azja", color: "yellow" },
  { id: "middle_east", name: "Bliski Wschód", color: "orange" },
  { id: "eurasia", name: "Eurazja", color: "purple" },
];

interface InputFormProps {
  onSubmit: (
    profile: CountryProfile, 
    situation: string,
    criteria: string
  ) => Promise<void>;
  isLoading?: boolean;
}

interface FormData {
  situation: string;
  criteria: string;
  profile: CountryProfile;
}

export function InputForm({ onSubmit, isLoading }: InputFormProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [showSources, setShowSources] = useState(false);
  
  // Selected sources state (UI only for now)
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(
    new Set(SOURCE_COUNTRIES.map(c => c.id)) // All selected by default
  );
  const [selectedInstitutions, setSelectedInstitutions] = useState<Set<string>>(
    new Set(SOURCE_INSTITUTIONS.map(i => i.id)) // All selected by default
  );
  
  const toggleCountry = (id: string) => {
    setSelectedCountries(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  
  const toggleInstitution = (id: string) => {
    setSelectedInstitutions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  
  const selectAllCountries = () => setSelectedCountries(new Set(SOURCE_COUNTRIES.map(c => c.id)));
  const deselectAllCountries = () => setSelectedCountries(new Set());
  const selectAllInstitutions = () => setSelectedInstitutions(new Set(SOURCE_INSTITUTIONS.map(i => i.id)));
  const deselectAllInstitutions = () => setSelectedInstitutions(new Set());
  
  const toggleRegion = (regionId: string) => {
    const regionCountries = SOURCE_COUNTRIES.filter(c => c.region === regionId);
    const allSelected = regionCountries.every(c => selectedCountries.has(c.id));
    
    setSelectedCountries(prev => {
      const next = new Set(prev);
      regionCountries.forEach(c => {
        if (allSelected) next.delete(c.id);
        else next.add(c.id);
      });
      return next;
    });
  };
  
  const { register, handleSubmit } = useForm<FormData>({
    defaultValues: {
      situation: DEFAULT_SITUATION,
      criteria: DEFAULT_CRITERIA,
      profile: DEFAULT_COUNTRY_PROFILE,
    },
  });

  const onFormSubmit = async (data: FormData) => {
    await onSubmit(data.profile, data.situation, data.criteria);
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      {/* Data Sources Selection */}
      <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
        <CardHeader 
          className="cursor-pointer select-none" 
          onClick={() => setShowSources(!showSources)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10">
                <MapPin className="h-5 w-5 text-cyan-400" />
              </div>
              <div>
                <CardTitle className="text-lg text-slate-100">Data Sources</CardTitle>
                <CardDescription className="text-slate-400">
                  Select countries and institutions for analysis • {selectedCountries.size} countries, {selectedInstitutions.size} institutions
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-full">
                {selectedCountries.size + selectedInstitutions.size} sources
              </span>
              {showSources ? (
                <ChevronUp className="h-5 w-5 text-slate-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-slate-400" />
              )}
            </div>
          </div>
        </CardHeader>
        
        {showSources && (
          <CardContent className="space-y-6">
            {/* Countries Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-cyan-400" />
                  Countries (Ministries)
                </h3>
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    onClick={selectAllCountries}
                    className="text-xs text-slate-400 hover:text-slate-200 h-7"
                  >
                    Select all
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    onClick={deselectAllCountries}
                    className="text-xs text-slate-400 hover:text-slate-200 h-7"
                  >
                    Deselect all
                  </Button>
                </div>
              </div>
              
              {/* Region filters */}
              <div className="flex flex-wrap gap-2 mb-3">
                {REGIONS.map(region => {
                  const regionCountries = SOURCE_COUNTRIES.filter(c => c.region === region.id);
                  const selectedCount = regionCountries.filter(c => selectedCountries.has(c.id)).length;
                  const allSelected = selectedCount === regionCountries.length;
                  
                  return (
                    <button
                      key={region.id}
                      type="button"
                      onClick={() => toggleRegion(region.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                        allSelected
                          ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50"
                          : selectedCount > 0
                            ? "bg-cyan-500/10 text-cyan-400/70 border-cyan-500/30"
                            : "bg-slate-800 text-slate-500 border-slate-700 hover:border-slate-600"
                      )}
                    >
                      {region.name}
                      <span className="ml-1.5 opacity-70">({selectedCount}/{regionCountries.length})</span>
                    </button>
                  );
                })}
              </div>
              
              {/* Country grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {SOURCE_COUNTRIES.map(country => {
                  const isSelected = selectedCountries.has(country.id);
                  return (
                    <button
                      key={country.id}
                      type="button"
                      onClick={() => toggleCountry(country.id)}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-lg border transition-all text-left",
                        isSelected
                          ? "bg-cyan-500/10 border-cyan-500/50 text-slate-100"
                          : "bg-slate-900/30 border-slate-700 text-slate-500 hover:border-slate-600"
                      )}
                    >
                      <span className="text-xl">{country.flag}</span>
                      <span className="flex-1 text-sm font-medium">{country.name}</span>
                      {isSelected && (
                        <Check className="h-4 w-4 text-cyan-400" />
                      )}
                    </button>
                  );
                })}
              </div>
              
              <p className="text-xs text-slate-500">
                💡 Ministry sources: Foreign Affairs, Defense, Interior, Economy, Trade, Energy, Climate, Digital, Education
              </p>
            </div>
            
            {/* Institutions Section */}
            <div className="space-y-4 pt-4 border-t border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-violet-400" />
                  International Institutions
                </h3>
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    onClick={selectAllInstitutions}
                    className="text-xs text-slate-400 hover:text-slate-200 h-7"
                  >
                    Select all
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    onClick={deselectAllInstitutions}
                    className="text-xs text-slate-400 hover:text-slate-200 h-7"
                  >
                    Deselect all
                  </Button>
                </div>
              </div>
              
              {/* Institution categories */}
              <div className="space-y-3">
                {/* International Organizations */}
                <div>
                  <h4 className="text-xs text-slate-500 mb-2 uppercase tracking-wider">International Organizations</h4>
                  <div className="flex flex-wrap gap-2">
                    {SOURCE_INSTITUTIONS.filter(i => ["international", "security", "regional"].includes(i.category)).map(inst => {
                      const isSelected = selectedInstitutions.has(inst.id);
                      return (
                        <button
                          key={inst.id}
                          type="button"
                          onClick={() => toggleInstitution(inst.id)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all",
                            isSelected
                              ? "bg-violet-500/10 border-violet-500/50 text-slate-100"
                              : "bg-slate-900/30 border-slate-700 text-slate-500 hover:border-slate-600"
                          )}
                        >
                          <span>{inst.icon}</span>
                          <span className="text-sm">{inst.name}</span>
                          {isSelected && <Check className="h-3 w-3 text-violet-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
                
                {/* Think Tanks */}
                <div>
                  <h4 className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Think Tanks</h4>
                  <div className="flex flex-wrap gap-2">
                    {SOURCE_INSTITUTIONS.filter(i => i.category === "think_tank").map(inst => {
                      const isSelected = selectedInstitutions.has(inst.id);
                      return (
                        <button
                          key={inst.id}
                          type="button"
                          onClick={() => toggleInstitution(inst.id)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all",
                            isSelected
                              ? "bg-violet-500/10 border-violet-500/50 text-slate-100"
                              : "bg-slate-900/30 border-slate-700 text-slate-500 hover:border-slate-600"
                          )}
                        >
                          <span>{inst.icon}</span>
                          <span className="text-sm">{inst.name}</span>
                          {isSelected && <Check className="h-3 w-3 text-violet-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
                
                {/* Markets & Economic */}
                <div>
                  <h4 className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Rynki i Ekonomia</h4>
                  <div className="flex flex-wrap gap-2">
                    {SOURCE_INSTITUTIONS.filter(i => ["markets", "economic"].includes(i.category)).map(inst => {
                      const isSelected = selectedInstitutions.has(inst.id);
                      return (
                        <button
                          key={inst.id}
                          type="button"
                          onClick={() => toggleInstitution(inst.id)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all",
                            isSelected
                              ? "bg-violet-500/10 border-violet-500/50 text-slate-100"
                              : "bg-slate-900/30 border-slate-700 text-slate-500 hover:border-slate-600"
                          )}
                        >
                          <span>{inst.icon}</span>
                          <span className="text-sm">{inst.name}</span>
                          {isSelected && <Check className="h-3 w-3 text-violet-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Summary */}
            <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Wybrane źródła:</span>
                <div className="flex items-center gap-4">
                  <span className="text-cyan-400">
                    <Globe className="h-3 w-3 inline mr-1" />
                    {selectedCountries.size} countries
                  </span>
                  <span className="text-violet-400">
                    <Building2 className="h-3 w-3 inline mr-1" />
                    {selectedInstitutions.size} institutions
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Country Profile Section */}
      <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
        <CardHeader 
          className="cursor-pointer select-none" 
          onClick={() => setShowProfile(!showProfile)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Globe className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-lg text-slate-100">Atlantis Country Profile</CardTitle>
                <CardDescription className="text-slate-400">
                  Pre-filled data - click to edit
                </CardDescription>
              </div>
            </div>
            {showProfile ? (
              <ChevronUp className="h-5 w-5 text-slate-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-400" />
            )}
          </div>
        </CardHeader>
        
        {showProfile && (
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile.name" className="text-slate-300">Country name</Label>
              <Input 
                {...register("profile.name")} 
                className="bg-slate-900/50 border-slate-600 text-slate-100 focus:border-emerald-500"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="profile.population" className="text-slate-300">Population</Label>
              <Input 
                {...register("profile.population")} 
                className="bg-slate-900/50 border-slate-600 text-slate-100 focus:border-emerald-500"
              />
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="profile.geography" className="text-slate-300">Geographic location</Label>
              <Input 
                {...register("profile.geography")} 
                className="bg-slate-900/50 border-slate-600 text-slate-100 focus:border-emerald-500"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="profile.climate" className="text-slate-300">Climate</Label>
              <Input 
                {...register("profile.climate")} 
                className="bg-slate-900/50 border-slate-600 text-slate-100 focus:border-emerald-500"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="profile.army" className="text-slate-300">Armed forces</Label>
              <Input 
                {...register("profile.army")} 
                className="bg-slate-900/50 border-slate-600 text-slate-100 focus:border-emerald-500"
              />
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="profile.economy" className="text-slate-300">Economy</Label>
              <textarea 
                {...register("profile.economy")} 
                rows={3}
                className="w-full rounded-md bg-slate-900/50 border border-slate-600 text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 px-3 py-2 text-sm"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="profile.digitalization" className="text-slate-300">Digitalization</Label>
              <Input 
                {...register("profile.digitalization")} 
                className="bg-slate-900/50 border-slate-600 text-slate-100 focus:border-emerald-500"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="profile.currency" className="text-slate-300">Currency</Label>
              <Input 
                {...register("profile.currency")} 
                className="bg-slate-900/50 border-slate-600 text-slate-100 focus:border-emerald-500"
              />
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="profile.key_relations" className="text-slate-300">Key relations</Label>
              <Input 
                {...register("profile.key_relations")} 
                className="bg-slate-900/50 border-slate-600 text-slate-100 focus:border-emerald-500"
              />
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="profile.political_threats" className="text-slate-300">Political and economic threats</Label>
              <textarea 
                {...register("profile.political_threats")} 
                rows={2}
                className="w-full rounded-md bg-slate-900/50 border border-slate-600 text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 px-3 py-2 text-sm"
              />
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="profile.military_threats" className="text-slate-300">Military threats</Label>
              <textarea 
                {...register("profile.military_threats")} 
                rows={2}
                className="w-full rounded-md bg-slate-900/50 border border-slate-600 text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 px-3 py-2 text-sm"
              />
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="profile.milestones" className="text-slate-300">Milestones</Label>
              <textarea 
                {...register("profile.milestones")} 
                rows={2}
                className="w-full rounded-md bg-slate-900/50 border border-slate-600 text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 px-3 py-2 text-sm"
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Situation Description */}
      <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <FileText className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-slate-100">International Situation Description</CardTitle>
              <CardDescription className="text-slate-400">
                Factors affecting the situation with importance weights
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <textarea 
            {...register("situation")} 
            rows={16}
            className="w-full rounded-md bg-slate-900/50 border border-slate-600 text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 px-4 py-3 text-sm leading-relaxed font-mono"
            placeholder="Enter international situation description..."
          />
        </CardContent>
      </Card>

      {/* Success Criteria */}
      <Card className="border-violet-500/30 bg-slate-800/50 backdrop-blur">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-500/10">
              <svg className="h-5 w-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <CardTitle className="text-lg text-slate-100">Success Criteria</CardTitle>
              <CardDescription className="text-slate-400">
                What outcomes do we want to achieve in the scenarios? List goals with importance weights.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <textarea 
            {...register("criteria")} 
            rows={8}
            className="w-full rounded-md bg-slate-900/50 border border-violet-500/30 text-slate-100 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 px-4 py-3 text-sm leading-relaxed font-mono"
            placeholder="e.g. 1. Maximize economic growth (weight: 25)&#10;2. Ensure energy security (weight: 20)&#10;3. Strengthen defense capabilities (weight: 15)"
          />
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-center">
        <Button 
          type="submit" 
          size="lg"
          disabled={isLoading}
          className="text-white px-8 py-6 text-lg font-semibold shadow-lg transition-all bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-emerald-500/25 hover:shadow-emerald-500/40"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Generating topics...
            </>
          ) : (
            <>
              <ArrowRight className="mr-2 h-5 w-5" />
              Generate Analysis Topics
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

