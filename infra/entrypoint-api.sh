#!/bin/sh
set -e

echo "⏳ Syncing Prisma schema to database..."
cd /app/backend/agent-backend-ts
pnpm exec prisma db push --skip-generate ${PRISMA_DB_PUSH_FLAGS:-}

echo "🚀 Starting API server..."
exec node /app/backend/agent-backend-ts/dist/main.js
