import { Outlet, Link } from "react-router-dom";
import { Toaster } from "sonner";
import { Shield } from "lucide-react";

export default function Layout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Background Pattern */}
      <div className="fixed inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtNi42MjcgMC0xMiA1LjM3My0xMiAxMnM1LjM3MyAxMiAxMiAxMiAxMi01LjM3MyAxMi0xMi01LjM3My0xMi0xMi0xMnptMCAxOGMtMy4zMTQgMC02LTIuNjg2LTYtNnMyLjY4Ni02IDYtNiA2IDIuNjg2IDYgNi0yLjY4NiA2LTYgNnoiIGZpbGw9IiMxZTI5M2IiIGZpbGwtb3BhY2l0eT0iMC4zIi8+PC9nPjwvc3ZnPg==')] opacity-20 pointer-events-none" />
      
      {/* Header */}
      <header className="relative border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
              <img 
                src="/logo.png" 
                alt="WIN Logo" 
                className="h-12 w-auto"
              />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  <span className="text-blue-500">W</span>
                  <span className="text-slate-700">I</span>
                  <span className="text-slate-700">N</span>
                </h1>
                <p className="text-[10px] text-slate-500 tracking-widest uppercase">World Insight Navigator</p>
              </div>
            </Link>
            
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500 hidden sm:block">
                MSZ Hackathon 2025
              </span>
              <div className="flex items-center gap-2 text-sm text-slate-400 px-3 py-1.5 rounded-full bg-slate-800/50 border border-slate-700/50">
                <Shield className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs">v1.0</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative container mx-auto px-4 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="relative border-t border-slate-800 bg-slate-900/30">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-blue-400">WIN</span> - World Insight Navigator
            </p>
            <p className="text-xs text-slate-600">
              MSZ Hackathon 2025 • Analiza scenariuszy geopolitycznych
            </p>
          </div>
        </div>
      </footer>

      <Toaster 
        position="top-right" 
        toastOptions={{
          style: {
            background: 'rgb(30 41 59)',
            border: '1px solid rgb(51 65 85)',
            color: 'rgb(226 232 240)',
          },
        }}
      />
    </div>
  );
}
