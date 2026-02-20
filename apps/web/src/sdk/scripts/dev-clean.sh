#!/bin/sh
# Full clean restart for dev server. Run when you see MODULE_NOT_FOUND or 500 errors.

echo "Stopping any running Next.js processes..."
pkill -f "next dev" 2>/dev/null || true
sleep 1

echo "Clearing .next cache..."
rm -rf apps/web/.next

echo "Starting dev server..."
cd "$(dirname "$0")/.." && pnpm dev
