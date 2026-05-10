#!/bin/bash

# Stop development processes for IDS AI Skeleton
# This script stops both the web dev server and API server

echo "🛑 Stopping IDS AI Skeleton development servers..."

# Stop processes by port
echo "Checking for processes on port 3004 (web)..."
WEB_PIDS=$(lsof -ti:3004 2>/dev/null)
if [ -n "$WEB_PIDS" ]; then
  echo "  Found web server process(es): $WEB_PIDS"
  kill -15 $WEB_PIDS 2>/dev/null && echo "  ✓ Stopped web server" || echo "  ⚠ Could not stop web server"
else
  echo "  No web server running on port 3004"
fi

echo "Checking for processes on port 3000 (APIs)..."
API_PIDS=$(lsof -ti:3000 2>/dev/null)
if [ -n "$API_PIDS" ]; then
  echo "  Found API server process(es): $API_PIDS"
  kill -15 $API_PIDS 2>/dev/null && echo "  ✓ Stopped API server" || echo "  ⚠ Could not stop API server"
else
  echo "  No API server running on port 3000"
fi

echo "Checking for processes on port 3999 (IDS Doctor)..."
DOCTOR_PIDS=$(lsof -ti:3999 2>/dev/null)
if [ -n "$DOCTOR_PIDS" ]; then
  echo "  Found IDS Doctor process(es): $DOCTOR_PIDS"
  kill -15 $DOCTOR_PIDS 2>/dev/null && echo "  ✓ Stopped IDS Doctor" || echo "  ⚠ Could not stop IDS Doctor"
else
  echo "  No IDS Doctor sidecar running on port 3999"
fi

# Additional cleanup: Find and kill any nx serve/dev processes
echo "Checking for any remaining nx dev/serve processes..."
NX_PIDS=$(pgrep -f "nx (serve|dev)" 2>/dev/null)
if [ -n "$NX_PIDS" ]; then
  echo "  Found nx process(es): $NX_PIDS"
  kill -15 $NX_PIDS 2>/dev/null && echo "  ✓ Stopped nx processes" || echo "  ⚠ Could not stop some nx processes"
else
  echo "  No nx dev/serve processes found"
fi

# Wait a moment for graceful shutdown
sleep 1

# Force kill if still running
WEB_PIDS=$(lsof -ti:3004 2>/dev/null)
API_PIDS=$(lsof -ti:3000 2>/dev/null)
DOCTOR_PIDS=$(lsof -ti:3999 2>/dev/null)

if [ -n "$WEB_PIDS" ] || [ -n "$API_PIDS" ] || [ -n "$DOCTOR_PIDS" ]; then
  echo "Some processes didn't stop gracefully, force killing..."
  [ -n "$WEB_PIDS" ] && kill -9 $WEB_PIDS 2>/dev/null && echo "  ✓ Force stopped web server"
  [ -n "$API_PIDS" ] && kill -9 $API_PIDS 2>/dev/null && echo "  ✓ Force stopped API server"
  [ -n "$DOCTOR_PIDS" ] && kill -9 $DOCTOR_PIDS 2>/dev/null && echo "  ✓ Force stopped IDS Doctor"
fi

echo "✅ All development servers stopped"
