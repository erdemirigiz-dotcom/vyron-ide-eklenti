import * as vscode from "vscode";
import { AgentOsConfig, fetchProviders, sendChat, search, ChatMessage } from "./agentos";

function readConfig(): AgentOsConfig {
  const c = vscode.workspace.getConfiguration("vyron.agentos");
  return {
    url: (c.get<string>("url") || "http://127.0.0.1:8100").trim(),
    user: (c.get<string>("user") || "").trim(),
    password: c.get<string>("password") || "",
    token: (c.get<string>("token") || "").trim(),
  };
}

function defaultProvider(): string {
  return (vscode.workspace.getConfiguration("vyron.agentos").get<string>("defaultProvider") || "cerebras").trim();
}

class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "vyron.chatView";
  private view?: vscode.WebviewView;
  private readonly pending: object[] = [];

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.ctx.extensionUri] };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage(async (msg) => {
      try {
        if (msg.type === "ready") {
          void this.loadProviders();
          while (this.pending.length) {
            view.webview.postMessage(this.pending.shift());
          }
        } else if (msg.type === "send") {
          await this.handleSend(msg.provider, msg.messages as ChatMessage[]);
        } else if (msg.type === "search") {
          await this.runSearch(String(msg.q || ""));
        }
      } catch (e) {
        this.post({ type: "error", text: (e as Error).message });
      }
    });
  }

  private post(m: object): void {
    if (this.view) {
      this.view.webview.postMessage(m);
    } else {
      this.pending.push(m);
    }
  }

  private async loadProviders(): Promise<void> {
    try {
      const list = await fetchProviders(readConfig());
      this.post({ type: "providers", list, def: defaultProvider() });
    } catch (e) {
      this.post({ type: "error", text: "Saglayicilar alinamadi: " + (e as Error).message });
    }
  }

  private async handleSend(provider: string, messages: ChatMessage[]): Promise<void> {
    this.post({ type: "busy", on: true });
    try {
      const reply = await sendChat(readConfig(), provider, messages);
      this.post({ type: "reply", ...reply });
    } catch (e) {
      this.post({ type: "error", text: (e as Error).message });
    } finally {
      this.post({ type: "busy", on: false });
    }
  }

  private async runSearch(q: string): Promise<void> {
    q = q.trim();
    if (q.length < 2) {
      this.post({ type: "error", text: "Arama en az 2 karakter olmali." });
      return;
    }
    this.post({ type: "busy", on: true });
    try {
      const res = await search(readConfig(), q);
      this.post({ type: "search-results", query: res.query, results: res.results });
    } catch (e) {
      this.post({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      this.post({ type: "busy", on: false });
    }
  }

  // Komutlardan cagrilir: paneli acar, secili kodu + soruyu sohbete enjekte eder.
  public async reveal(): Promise<void> {
    await vscode.commands.executeCommand("vyron.chatView.focus");
  }

  public async askWithCode(question: string, code: string, lang: string): Promise<void> {
    await this.reveal();
    const content = code
      ? `${question}\n\n\`\`\`${lang}\n${code}\n\`\`\``
      : question;
    this.post({ type: "ask", provider: defaultProvider(), content });
  }

  public async showSearch(q: string): Promise<void> {
    await this.reveal();
    await this.runSearch(q);
  }

  private html(webview: vscode.Webview): string {
    const nonce = String(Math.random()).slice(2) + Date.now().toString(36);
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 6px; margin: 0; }
  #bar { display: flex; gap: 6px; margin-bottom: 6px; }
  select, textarea, button, input {
    font-family: inherit; font-size: 12px; color: var(--vscode-input-foreground);
    background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px; padding: 4px;
  }
  select { flex: 1; }
  #msgs { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
  .m { padding: 6px 8px; border-radius: 4px; white-space: pre-wrap; word-break: break-word; }
  .user { background: var(--vscode-editor-inactiveSelectionBackground); }
  .bot { background: var(--vscode-textCodeBlock-background, rgba(127,127,127,.12)); }
  .meta { font-size: 10px; opacity: .65; margin-top: 3px; }
  .err { color: var(--vscode-errorForeground); }
  .res { border-left: 2px solid var(--vscode-focusBorder); padding-left: 6px; margin: 4px 0; }
  .res b { font-size: 12px; }
  .res small { opacity: .7; }
  #input { display: flex; flex-direction: column; gap: 6px; }
  textarea { width: 100%; box-sizing: border-box; resize: vertical; min-height: 46px; }
  .row { display: flex; gap: 6px; }
  button { cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 5px 10px; }
  button.sec { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button:disabled { opacity: .5; cursor: default; }
  #status { font-size: 11px; opacity: .7; min-height: 14px; }
</style>
</head>
<body>
  <div id="bar">
    <select id="provider" title="Saglayici"></select>
  </div>
  <div id="msgs"></div>
  <div id="input">
    <textarea id="text" placeholder="AgentOS'a yaz... (Ctrl+Enter gonderir)"></textarea>
    <div class="row">
      <button id="send">Gonder</button>
      <button id="searchBtn" class="sec">Ara</button>
      <button id="clear" class="sec">Temizle</button>
    </div>
    <div id="status"></div>
  </div>
<script nonce="${nonce}">
  const vscodeApi = acquireVsCodeApi();
  const messages = [];               // {role, content}
  const msgsEl = document.getElementById('msgs');
  const providerEl = document.getElementById('provider');
  const textEl = document.getElementById('text');
  const sendBtn = document.getElementById('send');
  const searchBtn = document.getElementById('searchBtn');
  const clearBtn = document.getElementById('clear');
  const statusEl = document.getElementById('status');

  function esc(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

  function bubble(cls, text, meta){
    const d = document.createElement('div');
    d.className = 'm ' + cls;
    d.innerHTML = esc(text) + (meta ? '<div class="meta">'+esc(meta)+'</div>' : '');
    msgsEl.appendChild(d);
    d.scrollIntoView({block:'end'});
  }

  function doSend(){
    const p = providerEl.value || 'cerebras';
    const t = textEl.value.trim();
    if (!t) { return; }
    messages.push({role:'user', content:t});
    bubble('user', t);
    textEl.value = '';
    vscodeApi.postMessage({type:'send', provider:p, messages});
  }

  sendBtn.addEventListener('click', doSend);
  searchBtn.addEventListener('click', () => {
    const t = textEl.value.trim();
    if (t) { vscodeApi.postMessage({type:'search', q:t}); }
  });
  clearBtn.addEventListener('click', () => { messages.length = 0; msgsEl.innerHTML=''; statusEl.textContent=''; });
  textEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doSend(); }
  });

  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (m.type === 'providers') {
      providerEl.innerHTML = '';
      (m.list||[]).forEach(p => {
        const o = document.createElement('option');
        o.value = p.id; o.textContent = p.label + (p.available ? '' : ' (kapali)');
        if (p.id === m.def) { o.selected = true; }
        providerEl.appendChild(o);
      });
    } else if (m.type === 'reply') {
      messages.push({role:'assistant', content:m.reply});
      bubble('bot', m.reply, m.provider + ' · ' + m.model + ' · ' + m.elapsed + 's');
    } else if (m.type === 'error') {
      const d = document.createElement('div');
      d.className = 'm bot err'; d.textContent = 'Hata: ' + m.text;
      msgsEl.appendChild(d); d.scrollIntoView({block:'end'});
    } else if (m.type === 'busy') {
      sendBtn.disabled = m.on; searchBtn.disabled = m.on;
      statusEl.textContent = m.on ? 'AgentOS dusunuyor...' : '';
    } else if (m.type === 'ask') {
      if (m.provider) { providerEl.value = m.provider; }
      messages.push({role:'user', content:m.content});
      bubble('user', m.content);
      vscodeApi.postMessage({type:'send', provider: providerEl.value || m.provider, messages});
    } else if (m.type === 'search-results') {
      const wrap = document.createElement('div');
      wrap.className = 'm bot';
      let html = '<b>Arama: '+esc(m.query)+'</b>';
      if (!m.results || !m.results.length) { html += '<div>Sonuc yok.</div>'; }
      (m.results||[]).forEach(r => {
        html += '<div class="res"><b>'+esc(r.title)+'</b> <small>('+esc(r.group)+' · '+r.score+')</small><br>'+esc(r.snippet||'')+'</div>';
      });
      wrap.innerHTML = html;
      msgsEl.appendChild(wrap); wrap.scrollIntoView({block:'end'});
    }
  });

  vscodeApi.postMessage({type:'ready'});
</script>
</body>
</html>`;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ChatViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vyron.paneliAc", () => provider.reveal())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vyron.sorSecili", async () => {
      const ed = vscode.window.activeTextEditor;
      const code = ed ? ed.document.getText(ed.selection) : "";
      const lang = ed ? ed.document.languageId : "";
      const question = await vscode.window.showInputBox({
        prompt: code ? "Secili kod hakkinda AgentOS'a sorun" : "AgentOS'a sorun",
        placeHolder: "Ornek: Bu fonksiyon ne yapiyor, hatasi var mi?",
      });
      if (question === undefined) {
        return;
      }
      await provider.askWithCode(question.trim() || "Bu kodu acikla:", code, lang);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vyron.ara", async () => {
      const ed = vscode.window.activeTextEditor;
      const sel = ed ? ed.document.getText(ed.selection).trim() : "";
      const q = await vscode.window.showInputBox({
        prompt: "AgentOS notlarinda ara",
        value: sel,
        placeHolder: "Aranacak kelime",
      });
      if (q === undefined || q.trim().length < 2) {
        return;
      }
      await provider.showSearch(q.trim());
    })
  );
}

export function deactivate(): void {
  /* kaynak yok */
}
