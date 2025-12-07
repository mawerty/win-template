import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";

import App from "./App";
import { queryClient } from "./lib/query-client";
import { setupMockMode } from "./api/mock-setup";
import "./index.css";

// Enable mock mode if VITE_MOCK_MODE=true (reads from static JSON instead of API)
setupMockMode();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster position="bottom-right" />
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>
);

