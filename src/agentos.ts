// AgentOS HTTP istemcisi — vscode'dan bagimsiz tutuldu ki elle test edilebilsin.
import * as http from "http";
import * as https from "https";
import { URL } from "url";

export interface AgentOsConfig {
  url: string;
  user?: string;
  password?: string;
  token?: string;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatReply {
  reply: string;
  provider: string;
  model: string;
  elapsed: number;
}

export interface ProviderInfo {
  id: string;
  label: string;
  available: boolean;
  note: string;
}

export interface SearchResult {
  id: string;
  title: string;
  group: string;
  score: number;
  snippet: string;
}

// Sir koda gomulmez: kimlik basliklari yalniz ayarlardan gelen degerlerden kurulur.
function authHeaders(cfg: AgentOsConfig): Record<string, string> {
  const h: Record<string, string> = {};
  if (cfg.user && cfg.password) {
    const raw = Buffer.from(`${cfg.user}:${cfg.password}`).toString("base64");
    h["Authorization"] = `Basic ${raw}`;
  } else if (cfg.token) {
    h["X-Agentos-Token"] = cfg.token;
  }
  return h;
}

function request(
  cfg: AgentOsConfig,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  timeoutMs = 90000
): Promise<any> {
  return new Promise((resolve, reject) => {
    let base: URL;
    try {
      base = new URL(path, cfg.url.replace(/\/+$/, "") + "/");
    } catch (e) {
      reject(new Error(`Gecersiz AgentOS adresi: ${cfg.url}`));
      return;
    }
    const isHttps = base.protocol === "https:";
    const lib = isHttps ? https : http;
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...authHeaders(cfg),
    };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(payload.length);
    }
    const req = lib.request(
      {
        protocol: base.protocol,
        hostname: base.hostname,
        port: base.port || (isHttps ? 443 : 80),
        path: base.pathname + base.search,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode || 0;
          if (status < 200 || status >= 300) {
            let detail = text;
            try {
              const j = JSON.parse(text);
              detail = j.detail || text;
            } catch {
              /* düz metin */
            }
            if (status === 401) {
              detail = "Kimlik dogrulama gerekli — ayarlardan kullanici/sifre veya token girin.";
            }
            reject(new Error(`AgentOS ${status}: ${String(detail).slice(0, 300)}`));
            return;
          }
          try {
            resolve(text ? JSON.parse(text) : null);
          } catch {
            reject(new Error("AgentOS yaniti cozulemedi (gecersiz JSON)."));
          }
        });
      }
    );
    req.on("error", (e) =>
      reject(new Error(`AgentOS'a baglanilamadi (${cfg.url}): ${(e as Error).message}`))
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("Zaman asimi — AgentOS yanit vermedi."));
    });
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

export function fetchProviders(cfg: AgentOsConfig): Promise<ProviderInfo[]> {
  return request(cfg, "GET", "api/chat/providers", undefined, 15000);
}

export function sendChat(
  cfg: AgentOsConfig,
  provider: string,
  messages: ChatMessage[]
): Promise<ChatReply> {
  return request(cfg, "POST", "api/chat", { provider, messages });
}

export function search(cfg: AgentOsConfig, q: string): Promise<{ query: string; results: SearchResult[] }> {
  return request(cfg, "GET", "api/search?q=" + encodeURIComponent(q), undefined, 30000);
}
