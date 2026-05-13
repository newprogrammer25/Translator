import type { Language } from "./types";

const RAW_BASE = import.meta.env.VITE_API_BASE ?? "";
export const API_BASE = RAW_BASE.replace(/\/$/, "");

/** Returns the base URL for direct fetch calls (used by HealthBadge etc.) */
export function apiBase(): string {
  return API_BASE;
}

export function apiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}

export function wsUrl(path: string): string {
  const base = API_BASE || `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;
  const url = new URL(path, base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export interface HealthResponse {
  status: "ok";
  has_api_key: boolean;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(apiUrl("/api/health"));
  if (!res.ok) throw new Error(`health ${res.status}`);
  return res.json();
}

export async function fetchLanguages(): Promise<Language[]> {
  const res = await fetch(apiUrl("/api/languages"));
  if (!res.ok) throw new Error(`languages ${res.status}`);
  const data = (await res.json()) as { languages: Language[] };
  return data.languages;
}

export interface SSEHandlers {
  onDelta?: (chunk: string) => void;
  onDone?: () => void;
  onError?: (msg: string) => void;
  signal?: AbortSignal;
}

/**
 * Stream a Server-Sent Events response from a POST request.
 *
 * Performance notes:
 *   - Uses a streaming reader so tokens render as they arrive (no buffering).
 *   - Decodes incrementally with a stream:true TextDecoder to avoid losing multi-byte chars.
 */
export async function streamSSE(
  path: string,
  body: unknown,
  handlers: SSEHandlers,
): Promise<void> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: handlers.signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    handlers.onError?.(text || `request failed: ${res.status}`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      handleSseBlock(block, handlers);
    }
  }
  if (buffer.trim()) handleSseBlock(buffer, handlers);
}

function handleSseBlock(block: string, handlers: SSEHandlers): void {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return;
  const dataStr = dataLines.join("\n");
  if (event === "delta") {
    try {
      const parsed = JSON.parse(dataStr) as { content?: string };
      if (parsed.content) handlers.onDelta?.(parsed.content);
    } catch {
      handlers.onDelta?.(dataStr);
    }
  } else if (event === "done") {
    handlers.onDone?.();
  } else if (event === "error") {
    try {
      const parsed = JSON.parse(dataStr) as { message?: string };
      handlers.onError?.(parsed.message ?? dataStr);
    } catch {
      handlers.onError?.(dataStr);
    }
  }
}

export interface TranslateBody {
  text: string;
  source: string;
  target: string;
  formal?: boolean;
}

export function streamTranslate(body: TranslateBody, handlers: SSEHandlers): Promise<void> {
  return streamSSE("/api/translate", body, handlers);
}

export interface DialogueBody {
  messages: { role: "user" | "assistant"; content: string }[];
  bot_language: string;
  user_language: string;
  persona?: string;
}

export function streamDialogue(body: DialogueBody, handlers: SSEHandlers): Promise<void> {
  return streamSSE("/api/dialogue", body, handlers);
}
