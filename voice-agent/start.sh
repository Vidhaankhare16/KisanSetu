#!/usr/bin/env bash
# One container = LiveKit worker + notify HTTP server. If either dies, exit so
# Cloud Run recycles the instance.
set -uo pipefail
PORT="${PORT:-8080}"
python agent.py start &
AGENT_PID=$!
uvicorn notify_server:app --host 0.0.0.0 --port "${PORT}" &
UVICORN_PID=$!
wait -n "${AGENT_PID}" "${UVICORN_PID}"
kill "${AGENT_PID}" "${UVICORN_PID}" 2>/dev/null
exit 1
