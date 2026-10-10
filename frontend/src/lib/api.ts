import type {
  AnalyzeResponse, LLMInterpretRequest, LLMInterpretResponse, LLMStatus,
  Preset, RenderRequest, RenderResponse, StemsJobResponse, UploadResponse,
} from "./types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) throw new Error(await errorText(res));
  return res.json() as Promise<T>;
}

/** FastAPI errors are `{detail: "..."}`: surface the detail, not the JSON. */
async function errorText(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const detail = JSON.parse(text)?.detail;
    if (typeof detail === "string") return detail;
  } catch {
    /* not JSON */
  }
  return `${res.status} ${res.statusText}: ${text}`;
}

export const api = {
  health: () => request<{ status: string }>("/health"),

  upload: async (file: File): Promise<UploadResponse> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/upload`, { method: "POST", body: fd });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
  },

  analyze: (trackId: string) =>
    request<AnalyzeResponse>(`/analyze/${trackId}`),

  startStems: (trackId: string) =>
    request<StemsJobResponse>(`/stems/${trackId}`, { method: "POST" }),

  getStems: (trackId: string) =>
    request<StemsJobResponse>(`/stems/${trackId}`),

  llmStatus: () => request<LLMStatus>("/llm/status"),

  interpret: (req: LLMInterpretRequest) =>
    request<LLMInterpretResponse>("/llm/interpret", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  /** WAV blob of the processed window (max 30 s). */
  renderPreview: async (req: RenderRequest, signal?: AbortSignal): Promise<Blob> => {
    const res = await fetch(`${BASE}/render/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
    if (!res.ok) throw new Error(await errorText(res));
    return res.blob();
  },

  renderExport: (req: RenderRequest) =>
    request<RenderResponse>("/render/export", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  renderFileUrl: (renderId: string) => `${BASE}/render/file/${renderId}`,

  listPresets: () => request<Preset[]>("/presets"),
  createPreset: (preset: Preset) =>
    request<Preset>("/presets", { method: "POST", body: JSON.stringify(preset) }),
  deletePreset: (name: string) =>
    request<void>(`/presets/${encodeURIComponent(name)}`, { method: "DELETE" }),
  listGenreTemplates: () => request<Preset[]>("/genre-templates"),
};
