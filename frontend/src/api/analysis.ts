import { fetcher } from "./fetcher";
import type { CountryProfile, Topic, Scenario, SessionListItem, TopicWithSources } from "@/types/analysis";

const API_BASE = "/api";

export interface CreateSessionRequest {
  country_profile: CountryProfile;
  situation_description: string;
}

export interface CreateSessionResponse {
  id: number;
  topics: Topic[];
}

export interface SessionResponse {
  id: number;
  country_profile: CountryProfile;
  situation_description: string;
  topics: Topic[];
  scenarios: Scenario[];
}

export interface SessionListResponse {
  sessions: SessionListItem[];
}

export interface GenerateScenariosResponse {
  scenarios: Scenario[];
  sources: TopicWithSources[];
}

export async function createSession(
  countryProfile: CountryProfile,
  situationDescription: string
): Promise<CreateSessionResponse> {
  const payload: CreateSessionRequest = {
    country_profile: countryProfile,
    situation_description: situationDescription,
  };
  
  const response = await fetcher(`${API_BASE}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return response;
}

export async function getSession(sessionId: number): Promise<SessionResponse> {
  return fetcher(`${API_BASE}/sessions/${sessionId}`);
}

export async function listSessions(): Promise<SessionListResponse> {
  return fetcher(`${API_BASE}/sessions`);
}

export async function selectTopics(
  sessionId: number,
  topicIds: number[]
): Promise<{ success: boolean; selected_count: number }> {
  return fetcher(`${API_BASE}/sessions/${sessionId}/select-topics`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ topic_ids: topicIds }),
  });
}

export async function generateScenarios(
  sessionId: number
): Promise<GenerateScenariosResponse> {
  return fetcher(`${API_BASE}/sessions/${sessionId}/generate-scenarios`, {
    method: "POST",
  });
}

export interface FetchUrlsResponse {
  session_id: number;
  topics_with_urls: TopicWithSources[];
}

export async function fetchAllUrls(
  sessionId: number
): Promise<FetchUrlsResponse> {
  return fetcher(`${API_BASE}/sessions/${sessionId}/fetch-all-urls`, {
    method: "POST",
  });
}

export interface TopicWeightUpdate {
  topic_id: number;
  weight: number;
}

export async function updateTopicWeights(
  sessionId: number,
  weights: TopicWeightUpdate[]
): Promise<{ success: boolean; updated_count: number }> {
  return fetcher(`${API_BASE}/sessions/${sessionId}/update-weights`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ weights }),
  });
}

