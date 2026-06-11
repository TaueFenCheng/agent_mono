SHELL := /bin/bash

.PHONY: setup install install-python db-up db-down db-push-ts dev-web dev-web-full dev-desktop dev-desktop-full dev-desktop-tauri dev-cli dev-api-ts dev-api-python dev-docs dev-doc dev-frontend dev-backend build build-ts build-python test test-ts test-python lint clean fix-electron

setup: db-up install db-push-ts install-python

install:
	pnpm install

install-python:
	cd backend/agent-backend-python && uv sync --dev

db-up:
	docker compose -f infra/docker-compose.yml up -d

db-down:
	docker compose -f infra/docker-compose.yml down

db-push-ts:
	pnpm --filter @intelligent-agent/agent-backend-ts prisma:push

dev-web:
	@for pid in $$(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null); do \
	  if ps -p $$pid -o command= 2>/dev/null | grep -q 'rspress'; then \
	    echo "[tangAgent] Error: port 3000 is occupied by RSPress docs (pid $$pid)."; \
	    echo "  Run: kill $$pid"; \
	    echo "  Docs should use port 3002: make dev-doc"; \
	    exit 1; \
	  fi; \
	done
	pnpm dev:web

dev-web-full:
	@bash -lc 'set -euo pipefail; \
	  pnpm dev:api:ts & \
	  API_PID=$$!; \
	  trap "kill $$API_PID 2>/dev/null || true" EXIT INT TERM; \
	  echo "[tangAgent] waiting for backend :8080 ..."; \
	  until nc -z 127.0.0.1 8080; do sleep 1; done; \
	  echo "[tangAgent] backend is up, starting web ..."; \
	  pnpm dev:web'

dev-desktop:
	pnpm dev:desktop

dev-desktop-full:
	@bash -lc 'set -euo pipefail; \
	  pnpm dev:api:ts & \
	  API_PID=$$!; \
	  trap "kill $$API_PID 2>/dev/null || true" EXIT INT TERM; \
	  echo "[tangAgent] waiting for backend :8080 ..."; \
	  until nc -z 127.0.0.1 8080; do sleep 1; done; \
	  echo "[tangAgent] backend is up, starting electron ..."; \
	  pnpm dev:desktop'

dev-desktop-tauri:
	pnpm dev:desktop:tauri

dev-cli:
	pnpm dev:cli

dev-api-ts:
	pnpm dev:api:ts

dev-api-python:
	cd backend/agent-backend-python && uv run uvicorn app.main:app --reload --port 8081

dev-docs dev-doc:
	@echo "[tangAgent] starting docs on http://localhost:3002 (web uses :3000)"
	pnpm docs:dev

dev-frontend:
	@echo "Run one of: make dev-web | make dev-desktop | make dev-desktop-tauri | make dev-cli"

dev-backend:
	@echo "Run in separate terminals: make dev-api-ts and make dev-api-python"

build: build-ts build-python

build-ts:
	pnpm build

build-python:
	cd backend/agent-backend-python && uv run python -m compileall app

test: test-ts test-python

test-ts:
	pnpm test

test-python:
	cd backend/agent-backend-python && uv run pytest -q

lint:
	pnpm lint

clean:
	rm -rf node_modules frontend/*/node_modules backend/agent-backend-ts/node_modules packages/*/node_modules
	rm -rf frontend/web/.next frontend/desktop/dist frontend/desktop-electron/dist frontend/desktop-electron/release backend/agent-backend-ts/dist

fix-electron:
	pnpm fix:electron
