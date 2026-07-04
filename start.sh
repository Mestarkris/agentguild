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

# Kill any stale processes on our ports
echo "[cleanup] Clearing ports 3000, 4000-4012..."
kill $(lsof -ti:3000) 2>/dev/null || true
kill $(lsof -ti:4000) 2>/dev/null || true
for p in $(seq 4001 4012); do kill $(lsof -ti:$p) 2>/dev/null || true; done
sleep 1

# Build frontend if no .next build exists
if [ ! -d "$ROOT/frontend/.next/BUILD_ID" ]; then
  echo "[0/3] Building frontend (first run)..."
  cd "$ROOT/frontend" && npm run build
  echo "[0/3] Frontend build complete."
  echo ""
fi

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
sleep 2

echo ""
echo "✅ AgentGuild running:"
echo "   Frontend   → http://localhost:3000"
echo "   Jobs       → http://localhost:3000/jobs"
echo "   Marketplace→ http://localhost:3000/marketplace"
echo "   Dashboard  → http://localhost:3000/dashboard"
echo "   API        → http://localhost:4000/api/metrics"
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
