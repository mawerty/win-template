/**
 * Mock mode setup - intercepts fetch calls and returns static JSON data
 * Import this at app startup to enable mock mode
 */

const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === "true";

interface MockRouteHandler {
  pattern: RegExp;
  getPath: (match: RegExpMatchArray, url: string) => string;
}

const mockRoutes: MockRouteHandler[] = [
  // Sessions list
  { pattern: /\/api\/sessions$/, getPath: () => "/mock-data/sessions.json" },
  // Session details
  { pattern: /\/api\/sessions\/(\d+)$/, getPath: (m) => `/mock-data/session-${m[1]}.json` },
  // Session report
  { pattern: /\/api\/sessions\/(\d+)\/report$/, getPath: (m) => `/mock-data/session-${m[1]}-report.json` },
  // Session sources
  { pattern: /\/api\/sessions\/(\d+)\/sources$/, getPath: (m) => `/mock-data/session-${m[1]}-sources.json` },
  // Session progress
  { pattern: /\/api\/sessions\/(\d+)\/progress$/, getPath: (m) => `/mock-data/session-${m[1]}-progress.json` },
  // Topic details
  { pattern: /\/api\/topics\/(\d+)$/, getPath: (m) => `/mock-data/topic-${m[1]}.json` },
  // Topic fetch-urls
  { pattern: /\/api\/topics\/(\d+)\/fetch-urls/, getPath: (m) => `/mock-data/topic-${m[1]}.json` },
  // Topic synthesis
  { pattern: /\/api\/topics\/(\d+)\/synthesis$/, getPath: (m) => `/mock-data/topic-${m[1]}-synthesis.json` },
  // Topic cached summaries
  { pattern: /\/api\/topics\/(\d+)\/cached-summaries$/, getPath: (m) => `/mock-data/topic-${m[1]}-cached-summaries.json` },
  // Generate country summaries -> returns synthesis
  { pattern: /\/api\/topics\/(\d+)\/generate-country-summaries/, getPath: (m) => `/mock-data/topic-${m[1]}-synthesis.json` },
  // Generate synthesis -> returns synthesis
  { pattern: /\/api\/topics\/(\d+)\/generate-synthesis/, getPath: (m) => `/mock-data/topic-${m[1]}-synthesis.json` },
  // Process articles -> returns cached summaries
  { pattern: /\/api\/topics\/(\d+)\/process-articles/, getPath: (m) => `/mock-data/topic-${m[1]}-cached-summaries.json` },
];

// Mock responses for mutation endpoints
const mockMutationResponses: Record<string, () => unknown> = {
  "select-topics": () => ({ success: true, selected_count: 0 }),
  "update-weights": () => ({ success: true, updated_count: 0 }),
  "regenerate-topics": () => ({ topics: [] }),
  "add-topic": () => ({ topic: { id: 999, name: "Mock Topic", keywords: [], weight: 50 } }),
  "process-all": () => ({ topics_processed: 0, urls_fetched: 0, articles_summarized: 0, countries_processed: 0, syntheses_generated: 0, topic_results: [] }),
  "generate-report": () => ({ sections: [], topics_used: [], generated_at: new Date().toISOString() }),
  "update-report": () => ({ report: { sections: [], topics_used: [] }, new_topics_processed: 0 }),
  "reset": () => ({ success: true }),
};

// Get default data for endpoints without mock files
function getDefaultData(url: string): unknown {
  if (url.includes("/sessions") && url.split("/").length <= 3) {
    return { sessions: [], recent_topics: [] };
  }
  if (url.includes("/report")) return { has_report: false, sections: [], topics_used: [] };
  if (url.includes("/sources")) return { user_facts: [], sources_by_topic: {}, all_citations: {}, total_sources: 0 };
  if (url.includes("/synthesis")) return { has_synthesis: false, country_summaries: [], synthesis: "" };
  if (url.includes("/cached-summaries")) return { has_summaries: false, all_summaries: [], by_source: {} };
  if (url.includes("/progress")) return { is_processing: false, step: "done", current: 0, total: 0, percent: 100, message: "Ready" };
  return {};
}

// Store original fetch
const originalFetch = window.fetch.bind(window);

// Mock fetch implementation
async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  
  // Only intercept API calls
  if (!url.includes("/api/")) {
    return originalFetch(input, init);
  }
  
  const method = init?.method?.toUpperCase() || "GET";
  const urlPath = url.split("?")[0];
  
  console.log(`[MOCK] ${method} ${urlPath}`);
  
  // Handle DELETE requests
  if (method === "DELETE") {
    console.log(`[MOCK] DELETE -> success`);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  
  // Handle POST/PUT mutations with mock responses
  if (method === "POST" || method === "PUT") {
    for (const [key, handler] of Object.entries(mockMutationResponses)) {
      if (urlPath.includes(key)) {
        console.log(`[MOCK] ${method} ${key} -> mock response`);
        return new Response(JSON.stringify(handler()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
  }
  
  // Try to find matching mock route
  for (const route of mockRoutes) {
    const match = urlPath.match(route.pattern);
    if (match) {
      const jsonPath = route.getPath(match, urlPath);
      console.log(`[MOCK] ${urlPath} -> ${jsonPath}`);
      
      try {
        const response = await originalFetch(jsonPath);
        if (response.ok) {
          const data = await response.json();
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      } catch (e) {
        console.warn(`[MOCK] Failed to load ${jsonPath}:`, e);
      }
      
      // Return default data if file not found
      const defaultData = getDefaultData(urlPath);
      console.log(`[MOCK] Using default data for ${urlPath}`);
      return new Response(JSON.stringify(defaultData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
  
  // No matching route - return empty response
  console.warn(`[MOCK] No mock for: ${urlPath}`);
  return new Response(JSON.stringify(getDefaultData(urlPath)), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Setup mock mode
export function setupMockMode(): void {
  if (!MOCK_MODE) {
    console.log("[MOCK] Mock mode disabled");
    return;
  }
  
  console.log("🎭 MOCK MODE ENABLED - Reading from static JSON files");
  console.log("📁 Data source: /mock-data/*.json");
  
  // Override global fetch
  window.fetch = mockFetch as typeof fetch;
}

export function isMockModeEnabled(): boolean {
  return MOCK_MODE;
}

