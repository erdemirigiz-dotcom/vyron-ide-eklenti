# Changelog

All notable changes to the VYRON AgentOS extension are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Streaming replies, inline patch application, multi-file context, persisted
  history and an optional English UI — see the roadmap in the README.

## [0.1.0] — 2026-09-02

First release. Runs against a live AgentOS instance in code-server and desktop
VS Code.

### Added

- **AgentOS chat side panel** (`vyron.chatView` in the `vyronSidebar` activity-bar
  container): provider dropdown populated from `GET /api/chat/providers`, message
  history, busy state, and a reply footer showing the model that actually answered
  and the elapsed seconds.
- **`AgentOS: Secili kodu AgentOS'a sor`** (`vyron.sorSecili`) — sends the editor
  selection fenced with its `languageId` plus a question from an input box.
  Available in the editor context menu when there is a selection.
- **`AgentOS: AgentOS'ta ara`** (`vyron.ara`) — semantic search over the notes
  index via `GET /api/search?q=`; results render in the same panel.
- **`AgentOS: Sohbet panelini ac`** (`vyron.paneliAc`) — reveals the panel from
  the command palette.
- **Settings** under `vyron.agentos.*`: `url`, `user`, `password`, `token`,
  `defaultProvider`.
- **`verify.js`** — standalone smoke test that exercises all three endpoints
  against a running AgentOS without launching an Extension Host.
- Extension icon, showcase README with an architecture diagram, and this
  changelog.

### Security

- `user`, `password` and `token` are declared `scope: "machine"`, so a workspace
  `.vscode/settings.json` from an untrusted repository cannot override them or
  redirect credentials to another host.
- Webview runs under a strict CSP (`default-src 'none'` plus a per-render script
  nonce); model output is inserted as text, never as HTML.
- Credentials are read from VS Code settings only — never hardcoded, never
  logged, never passed into the webview.
- `.gitignore` excludes `.env*`, `*.key`, `*.pem` and `*.jks`; the repository
  history was scanned before publication and contains no secret material.

### Notes

- No runtime dependencies: the HTTP client is Node's own `http`/`https`.
- `src/agentos.ts` intentionally imports nothing from `vscode`, which is what
  makes `verify.js` possible.

[Unreleased]: https://github.com/erdemirigiz-dotcom/vyron-ide-eklenti/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/erdemirigiz-dotcom/vyron-ide-eklenti/releases/tag/v0.1.0
