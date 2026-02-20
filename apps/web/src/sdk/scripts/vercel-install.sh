#!/bin/sh
set -eu

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

# Use PAT for private submodules (optional). Set GITHUB_PAT in Vercel env vars.
if [ -n "${GITHUB_PAT:-}" ]; then
  git config --global url."https://${GITHUB_PAT}:x-oauth-basic@github.com/".insteadOf "https://github.com/"
  git config --global url."https://${GITHUB_PAT}:x-oauth-basic@github.com/".insteadOf "git@github.com:"
fi

git submodule sync --recursive
git submodule update --init --recursive

corepack enable >/dev/null 2>&1 || true
corepack prepare pnpm@8.15.6 --activate >/dev/null 2>&1 || true

pnpm install --frozen-lockfile
