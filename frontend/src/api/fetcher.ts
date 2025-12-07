const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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

export async function apiFetch<TData, TBody = unknown>({
  url,
  method = "GET",
  body,
  headers,
  signal,
}: FetcherOptions<TBody>): Promise<TData> {
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
