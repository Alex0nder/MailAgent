# Workspace Agent — local LLM (Ollama / LM Studio)

Run summarize, draft-reply, and reminders **without cloud API keys** by pointing MailAgent at an OpenAI-compatible server on the **same machine as the API process**.

## What works where

| Setup | Local ML on user's PC |
|-------|------------------------|
| **`npm run dev`** — API on `127.0.0.1:8787`, Ollama on `:11434` | ✅ Same host, HTTP to localhost |
| **Self-host Worker deployed to Cloudflare** (user's account, `wrangler deploy`) | ❌ Worker runs on **Cloudflare edge**, not on the user's computer — it cannot call `127.0.0.1` on their Mac/PC |
| **Hosted prod** (`api.webmailagent.com`) | ❌ Same — edge cannot reach user's localhost |
| **Ollama exposed via public URL** (ngrok, tailnet, LAN IP) | ⚠️ Possible if `LOCAL_LLM_BASE_URL` is reachable from the internet — security/ops burden on the user |

There is no embedded model inside MailAgent: inference is always **HTTP to an OpenAI-compatible server** (Ollama, LM Studio, llama.cpp, vLLM, etc.).

### If the user runs ML on their computer

```text
┌─────────────────────────────────────────────────────────┐
│  User's computer (one machine)                          │
│                                                         │
│   Ollama :11434  ◄──HTTP──  MailAgent API :8787         │
│   (llama3.2)                (wrangler dev / local)      │
│                                    ▲                    │
│                                    │ MCP / curl          │
│                              Cursor / Codex             │
└─────────────────────────────────────────────────────────┘
```

This is the supported “local ML” path today: **API + Ollama on one box**, typically `npm run dev`.

```text
┌──────────────┐         ┌────────────────────┐         ┌─────────────┐
│ User's PC    │   ✗     │ Cloudflare Worker  │         │ User's PC   │
│ Ollama       │ ◄─no─── │ (self-host or prod)│         │ (optional)  │
└──────────────┘         └────────────────────┘         └─────────────┘
```

Deployed Worker (even self-host MIT) **never** sees Ollama on the user's desktop unless the user publishes Ollama to a URL the edge can reach.

**Practical choices for end users:**

| Goal | Recommendation |
|------|----------------|
| No cloud LLM cost, data stays on device | Run `ollama serve` + `npm run dev`; point MCP at `http://127.0.0.1:8787` |
| Hosted MailAgent + cloud LLM | Use prod API + xAI/OpenAI/DeepSeek secrets (current prod setup) |
| Self-host MailAgent on Cloudflare + local ML | Not supported without exposing Ollama or running API locally anyway |
| **Docker Compose (one command)** | ✅ Ollama + MailAgent API in one network — see below |

## Docker Compose (recommended for end users)

Single-machine install: Ollama pulls a model, MailAgent API talks to `http://ollama:11434/v1` inside the stack.

```bash
# 1. Backend secrets (Neon + Resend — same as SETUP.md)
cp .dev.vars.example .dev.vars
# edit DATABASE_URL, RESEND_*, API_KEY, INBOX_DOMAIN
npm run db:migrate

# 2. Start stack (first run downloads model — may take minutes)
npm run dev:docker:ollama
# optional model: OLLAMA_MODEL=qwen2.5:3b npm run dev:docker:ollama

# 3. MCP / .env on host
MAILAGENT_API_URL=http://127.0.0.1:8787
MAILAGENT_API_KEY=<same as API_KEY in .dev.vars>
```

| Service | URL |
|---------|-----|
| MailAgent API | http://127.0.0.1:8787 |
| Ollama (host) | http://127.0.0.1:11434 |
| Compose file | `examples/docker-compose.ollama.yml` |

Stop: `docker compose -f examples/docker-compose.ollama.yml down`  
Reset models volume: add `-v` (re-downloads model).

```text
┌──────────── docker compose network ────────────┐
│  ollama:11434  ◄──HTTP──  mailagent:8787       │
│       ▲                         ▲              │
└───────┼─────────────────────────┼──────────────┘
        │ published               │ published
   localhost:11434           localhost:8787  ← Cursor / MCP
```

Requires Docker Desktop (or Docker Engine + compose plugin). Still needs `.dev.vars` for Postgres/Resend — only **LLM** stays local.

## Quick start (Ollama on host, no Docker)

```bash
# 1. Install & pull a model
brew install ollama          # or https://ollama.com
ollama pull llama3.2         # or qwen2.5:3b, mistral, …

# 2. .dev.vars — local API only (not wrangler secrets on deployed edge Worker)
WORKSPACE_LLM_PROVIDER=local
OLLAMA_MODEL=llama3.2

# 3. Start stack
ollama serve                 # default :11434
npm run dev

# 4. Probe (admin key)
curl -s -X POST -H "Authorization: Bearer $API_KEY" \
  http://127.0.0.1:8787/v1/workspace/models/probe | jq
```

Expected readiness:

```json
{
  "provider": "local",
  "model": "llama3.2",
  "configured": true,
  "localOnly": true
}
```

## Config reference

| Variable | Default | Purpose |
|----------|---------|---------|
| `WORKSPACE_LLM_PROVIDER` | — | Set to `local` or `ollama` |
| `OLLAMA_MODEL` | `llama3.2` | Model tag (`ollama list`) |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434/v1` | Ollama OpenAI API |
| `LOCAL_LLM_BASE_URL` | same as Ollama | LM Studio / custom server |
| `LOCAL_LLM_MODEL` | — | Alias for model name |
| `LOCAL_LLM_API_KEY` | — | Only if your local server requires auth |

Alternative (explicit URL):

```bash
WORKSPACE_LLM_PROVIDER=custom
LLM_BASE_URL=http://127.0.0.1:1234/v1    # LM Studio default
LLM_MODEL=your-model
```

## LM Studio

1. Start local server (OpenAI compatible, usually port **1234**).
2. `.dev.vars`:

```bash
WORKSPACE_LLM_PROVIDER=local
LOCAL_LLM_BASE_URL=http://127.0.0.1:1234/v1
LOCAL_LLM_MODEL=your-loaded-model
```

## Model tips

- Prefer models with JSON instruction following (`llama3.2`, `qwen2.5`, `mistral`).
- **First probe after cold start** can take 1–3 minutes while Ollama loads the model into RAM — looks like a hang; wait or use a smaller model: `OLLAMA_MODEL=qwen2.5:3b`.
- Local LLM requests abort after **180s** (cloud: 60s).
- If `probe` returns `llm_invalid_json`, try another model or a larger quant.
- Local servers may ignore `response_format: json_object`; MailAgent retries without it automatically.

## Fallback chain

With `WORKSPACE_LLM_PROVIDER=local`, only the local endpoint is used unless you also set cloud keys — then cloud providers can be added as fallback in `custom` mode.

## Related

- [WORKSPACE-AUTONOMY.md](./WORKSPACE-AUTONOMY.md) — policy & execute-reply
- [WORKSPACE-AGENT-PBR.md](./WORKSPACE-AGENT-PBR.md) — roadmap
