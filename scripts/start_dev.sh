#!/usr/bin/env bash
# Starts SatQuery AI backend (port 8000) and Next.js frontend (port 3000) concurrently.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Trap SIGINT/SIGTERM to kill child processes
cleanup() {
    echo "Stopping SatQuery servers..."
    kill $(jobs -p) 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

echo "Starting Backend (Uvicorn on :8000)..."
cd "$ROOT_DIR/satquery_backend" && python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

echo "Starting Frontend (Next.js on :3000)..."
cd "$ROOT_DIR/frontend" && ./node_modules/.bin/next dev --port 3000 &
FRONTEND_PID=$!

wait $BACKEND_PID $FRONTEND_PID
