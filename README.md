# TokenLens MCP

Token intelligence layer for AI editors — analyze conversations, estimate costs, detect waste, and generate optimized prompts.

## Quick Start

```bash
npm install
cp .env.example .env   # fill in your values
npm run build
npm start              # HTTP server on port 3000
npm run stdio          # stdio transport for Claude Desktop
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `analyze_conversation` | Token count, cost estimate, waste detection |
| `improve_prompt` | Rewrite vague prompts into precise ones (local, no API) |
| `smart_compress` | Compress context by importance score |
| `estimate_cost` | Pre-flight cost estimate across all models |
| `get_budget_status` | Daily token budget and alert level |
| `weekly_summary` | Weekly usage vs last week |
| `export_report` | Markdown report saved to `~/.tokenlens/reports/` |

## REST Endpoints (Chrome Extension)

```
POST /analyze-direct      Analyze a conversation (no auth)
POST /improve-prompt      Local prompt improvement (no auth)
POST /improve-prompt-ai   AI-powered prompt improvement (user API key)
POST /generate-prompt     AI prompt generation (user API key)
GET  /dashboard           Web UI
GET  /health              Health check
```

## Configuration

Copy `.env.example` to `.env` and set:

```
PORT=3000
ADMIN_SECRET=<strong-random-secret>
```

AI provider keys are **not required on the server** — the Chrome Extension passes the user's own key per-request. Server-side keys are only needed if you add server-managed AI features.

## Security

**Your API keys are never stored on our servers. All keys are stored locally on your device only.**

- The Chrome Extension saves API keys to browser `localStorage` — they never leave your machine
- The `/generate-prompt` and `/improve-prompt-ai` endpoints receive your key only for the duration of the API call and do not log or persist it
- The MCP server stores session analytics in a local SQLite database (`~/.tokenlens/sessions.db`) — no data is sent to external services
- Set a strong `ADMIN_SECRET` in your `.env` before exposing the server to any network

## Hosted Server

The production server is available at:

```
https://tokenlens-mcp-production.up.railway.app
```

| Endpoint | URL |
|----------|-----|
| Health   | `https://tokenlens-mcp-production.up.railway.app/health` |
| SSE (MCP)| `https://tokenlens-mcp-production.up.railway.app/sse` |
| Dashboard| `https://tokenlens-mcp-production.up.railway.app/dashboard` |
| Chrome Extension default server URL | `https://tokenlens-mcp-production.up.railway.app` |

## Claude Desktop Setup

**Option A — Hosted (recommended):** connect via SSE to the production server.

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tokenlens": {
      "url": "https://tokenlens-mcp-production.up.railway.app/sse",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

**Option B — Local stdio:** run the server on your own machine.

```json
{
  "mcpServers": {
    "tokenlens": {
      "command": "node",
      "args": ["/path/to/TokenLens MCP/dist/stdio.js"]
    }
  }
}
```
