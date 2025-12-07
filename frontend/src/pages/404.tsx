import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="p-4 rounded-full bg-amber-500/10 mb-6">
        <AlertTriangle className="h-12 w-12 text-amber-400" />
      </div>
      <h1 className="text-4xl font-bold text-slate-100 mb-2">404</h1>
      <p className="text-lg text-slate-400 mb-6">
        Strona nie została znaleziona
      </p>
      <Button asChild>
        <Link to="/">
          <Home className="mr-2 h-4 w-4" />
          Wróć do strony głównej
        </Link>
      </Button>
    </div>
  );
}
