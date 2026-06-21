#!/usr/bin/env bash
# Wait for Ollama, then start wrangler dev with local LLM env (same Docker network).
set -euo pipefail

OLLAMA_ROOT="${OLLAMA_HOST:-http://ollama:11434}"
OLLAMA_ROOT="${OLLAMA_ROOT%/}"
OLLAMA_ROOT="${OLLAMA_ROOT%/v1}"
MODEL="${OLLAMA_MODEL:-llama3.2}"

echo "[mailagent] waiting for Ollama at ${OLLAMA_ROOT}..."
for _ in $(seq 1 90); do
  if curl -sf "${OLLAMA_ROOT}/api/tags" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! curl -sf "${OLLAMA_ROOT}/api/tags" >/dev/null 2>&1; then
  echo "[mailagent] ERROR: Ollama not reachable at ${OLLAMA_ROOT}" >&2
  exit 1
fi

export WORKSPACE_LLM_PROVIDER="${WORKSPACE_LLM_PROVIDER:-local}"
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-${OLLAMA_ROOT}/v1}"
export LOCAL_LLM_BASE_URL="${LOCAL_LLM_BASE_URL:-$OLLAMA_BASE_URL}"
export OLLAMA_MODEL="${MODEL}"
export LOCAL_LLM_MODEL="${LOCAL_LLM_MODEL:-$MODEL}"

echo "[mailagent] local LLM → ${OLLAMA_BASE_URL} model=${OLLAMA_MODEL}"
echo "[mailagent] starting wrangler dev --local on 0.0.0.0:8787 (mount repo at /app)"

exec npx wrangler dev --local --ip 0.0.0.0 --port 8787
