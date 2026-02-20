
cat > scripts/vercel-submodules.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

echo "==> init submodules"

# If your submodule is private, set GITHUB_PAT in Vercel env vars (read-only PAT).
if [ -n "${GITHUB_PAT:-}" ]; then
  git config --global url."https://${GITHUB_PAT}:x-oauth-basic@github.com/".insteadOf "https://github.com/"
  git config --global url."https://${GITHUB_PAT}:x-oauth-basic@github.com/".insteadOf "git@github.com:"
fi

git submodule sync --recursive
git submodule update --init --recursive

echo "==> submodules ready"
