#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Copy .env.example → .env if it doesn't exist
if [ ! -f "$ROOT/orchestrator/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/orchestrator/.env"
  echo "[setup] Copied .env.example → orchestrator/.env  (fill in real keys if you have them)"
fi

echo ""
echo "╔════════════════════════════════════════╗"
echo "║       AgentGuild — Starting Up         ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Start agents (all 12 in the background)
echo "[1/3] Starting 12 agents..."
node "$ROOT/agents/start-all.js" &
AGENTS_PID=$!
sleep 2

# Start orchestrator
echo "[2/3] Starting orchestrator (port 4000)..."
cd "$ROOT/orchestrator" && node server.js &
ORCH_PID=$!
sleep 2

# Start frontend
echo "[3/3] Starting frontend (port 3000)..."
cd "$ROOT/frontend" && npm start &
FRONT_PID=$!

echo ""
echo "✅ AgentGuild running:"
echo "   Frontend  → http://localhost:3000"
echo "   API       → http://localhost:4000/api/metrics"
echo ""
echo "Press Ctrl+C to stop everything."
echo ""

cleanup() {
  echo "Stopping..."
  kill $AGENTS_PID $ORCH_PID $FRONT_PID 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

wait
