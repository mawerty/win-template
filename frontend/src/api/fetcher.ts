const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Mock mode - reads from static JSON files instead of API
const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === "true";

export type FetcherOptions<TBody = unknown> = {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: TBody;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export type ErrorWrapper<TError = unknown> = {
  status: number;
  payload: TError;
};

// ============================================================================
// MOCK DATA FETCHER - maps API routes to static JSON files
// ============================================================================

interface MockRouteConfig {
  pattern: RegExp;
  getPath: (match: RegExpMatchArray) => string;
  // For POST requests that should return data (like they did something)
  mockResponse?: (match: RegExpMatchArray, body?: unknown) => unknown;
}

const mockRoutes: MockRouteConfig[] = [
  // Sessions list
  {
    pattern: /^\/api\/sessions$/,
    getPath: () => "/mock-data/sessions.json",
  },
  // Session details
  {
    pattern: /^\/api\/sessions\/(\d+)$/,
    getPath: (m) => `/mock-data/session-${m[1]}.json`,
  },
  // Session report
  {
    pattern: /^\/api\/sessions\/(\d+)\/report$/,
    getPath: (m) => `/mock-data/session-${m[1]}-report.json`,
  },
  // Session sources
  {
    pattern: /^\/api\/sessions\/(\d+)\/sources$/,
    getPath: (m) => `/mock-data/session-${m[1]}-sources.json`,
  },
  // Session progress (always returns not processing in mock)
  {
    pattern: /^\/api\/sessions\/(\d+)\/progress$/,
    getPath: (m) => `/mock-data/session-${m[1]}-progress.json`,
  },
  // Topic details
  {
    pattern: /^\/api\/topics\/(\d+)$/,
    getPath: (m) => `/mock-data/topic-${m[1]}.json`,
  },
  // Topic fetch-urls
  {
    pattern: /^\/api\/topics\/(\d+)\/fetch-urls/,
    getPath: (m) => `/mock-data/topic-${m[1]}.json`,
  },
  // Topic synthesis
  {
    pattern: /^\/api\/topics\/(\d+)\/synthesis$/,
    getPath: (m) => `/mock-data/topic-${m[1]}-synthesis.json`,
  },
  // Topic cached summaries
  {
    pattern: /^\/api\/topics\/(\d+)\/cached-summaries$/,
    getPath: (m) => `/mock-data/topic-${m[1]}-cached-summaries.json`,
  },
  // Topic country summaries (returns synthesis data)
  {
    pattern: /^\/api\/topics\/(\d+)\/generate-country-summaries/,
    getPath: (m) => `/mock-data/topic-${m[1]}-synthesis.json`,
  },
  // Topic synthesis generation (returns synthesis data)
  {
    pattern: /^\/api\/topics\/(\d+)\/generate-synthesis/,
    getPath: (m) => `/mock-data/topic-${m[1]}-synthesis.json`,
  },
];

// Mock responses for POST actions that don't need real data
const mockPostResponses: Record<string, (body?: unknown) => unknown> = {
  "/api/sessions/\\d+/select-topics": () => ({ success: true, selected_count: 0 }),
  "/api/sessions/\\d+/update-weights": () => ({ success: true, updated_count: 0 }),
};

async function fetchMock<T>(url: string, _options?: RequestInit): Promise<T> {
  // Strip query params for route matching
  const urlPath = url.split("?")[0];
  
  // Find matching mock route
  for (const route of mockRoutes) {
    const match = urlPath.match(route.pattern);
    if (match) {
      const jsonPath = route.getPath(match);
      console.log(`[MOCK] ${url} -> ${jsonPath}`);
      
      try {
        const response = await fetch(jsonPath);
        if (!response.ok) {
          // File doesn't exist - return empty/default data
          console.warn(`[MOCK] File not found: ${jsonPath}`);
          return getDefaultMockData(urlPath) as T;
        }
        return response.json();
      } catch (e) {
        console.warn(`[MOCK] Error loading ${jsonPath}:`, e);
        return getDefaultMockData(urlPath) as T;
      }
    }
  }
  
  // Check for POST mock responses
  for (const [pattern, handler] of Object.entries(mockPostResponses)) {
    if (new RegExp(pattern).test(urlPath)) {
      console.log(`[MOCK] POST ${url} -> mock response`);
      return handler() as T;
    }
  }
  
  console.warn(`[MOCK] No mock route for: ${url}`);
  return getDefaultMockData(urlPath) as T;
}

function getDefaultMockData(url: string): unknown {
  // Return sensible defaults for different endpoints
  if (url.includes("/sessions") && !url.includes("/")) {
    return { sessions: [], recent_topics: [] };
  }
  if (url.includes("/report")) {
    return { has_report: false, sections: [], topics_used: [] };
  }
  if (url.includes("/sources")) {
    return { user_facts: [], sources_by_topic: {}, all_citations: {}, total_sources: 0 };
  }
  if (url.includes("/synthesis")) {
    return { has_synthesis: false, country_summaries: [], synthesis: "" };
  }
  if (url.includes("/cached-summaries")) {
    return { has_summaries: false, all_summaries: [], by_source: {} };
  }
  if (url.includes("/progress")) {
    return { is_processing: false, step: "done", current: 0, total: 0, percent: 100, message: "Ready" };
  }
  return {};
}

// ============================================================================
// MAIN FETCHERS
// ============================================================================

export async function apiFetch<TData, TBody = unknown>({
  url,
  method = "GET",
  body,
  headers,
  signal,
}: FetcherOptions<TBody>): Promise<TData> {
  // Use mock mode if enabled
  if (MOCK_MODE) {
    return fetchMock<TData>(url, { method, body: body ? JSON.stringify(body) : undefined });
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw { status: response.status, payload: errorPayload };
  }

  if (response.status === 204) {
    return undefined as TData;
  }

  return response.json();
}

// Simple fetcher for direct use
export async function fetcher<T>(url: string, options?: RequestInit): Promise<T> {
  // Use mock mode if enabled
  if (MOCK_MODE) {
    return fetchMock<T>(url, options);
  }

  let response: Response;
  
  try {
    response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
  } catch (networkError) {
    // Network error (server down, CORS, etc.)
    throw { 
      status: 0, 
      message: "Nie można połączyć z serwerem",
      payload: { detail: "Sprawdź czy backend działa" }
    };
  }

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
    throw { status: response.status, payload: errorPayload };
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export function buildQueryString(
  params: Record<string, string | number | boolean | undefined | null>
): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  }
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}

// Helper to check if we're in mock mode
export function isMockMode(): boolean {
  return MOCK_MODE;
}

// Global fetch wrapper that works with mock mode
// Use this instead of raw fetch() for API calls
export async function apiFetchRaw(url: string, options?: RequestInit): Promise<Response> {
  if (MOCK_MODE) {
    // For mock mode, simulate a Response object
    const data = await fetchMock<unknown>(url, options);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  
  return fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
}
