import type {
  CreatePayload,
  DashboardStats,
  ListParams,
  Transcription,
  TranscriptionPage,
} from "@/types";

// Public URL of the backend as seen from the *browser* (baked in at build time).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const WS_URL = API_URL.replace(/^http/, "ws");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      ...init,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    throw new Error("Cannot reach the server. Is the backend running?");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(typeof body?.detail === "string" ? body.detail : `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  list(params: ListParams = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
    return request<TranscriptionPage>(`/api/transcriptions?${qs}`);
  },
  get: (id: string) => request<Transcription>(`/api/transcriptions/${id}`),
  create: (body: CreatePayload) =>
    request<Transcription>("/api/transcriptions", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: { title?: string; content?: string }) =>
    request<Transcription>(`/api/transcriptions/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (id: string) => request<void>(`/api/transcriptions/${id}`, { method: "DELETE" }),
  stats: () => request<DashboardStats>("/api/dashboard/stats"),
  languages: () => request<string[]>("/api/languages"),
};
