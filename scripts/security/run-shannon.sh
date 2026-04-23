#!/usr/bin/env bash
set -euo pipefail

# Shannon web/API scan wrapper.
# Run ONLY against staging/sandbox targets you own.

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required. Install Docker Desktop and retry."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

TARGET_URL="${TARGET_URL:-http://host.docker.internal:3000}"
SCAN_SOURCE_DIR="${SCAN_SOURCE_DIR:-$ROOT_DIR}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/security/reports/shannon}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
SHANNON_REPO_DIR="${SHANNON_REPO_DIR:-$ROOT_DIR/.tools/shannon}"
SHANNON_DOCKER_IMAGE="${SHANNON_DOCKER_IMAGE:-shannon-local}"

if [[ -z "$ANTHROPIC_API_KEY" ]]; then
  echo "ANTHROPIC_API_KEY is required."
  echo "Example: ANTHROPIC_API_KEY=... TARGET_URL=https://staging.example.com npm run security:shannon"
  exit 1
fi

mkdir -p "$OUTPUT_DIR" "$ROOT_DIR/.tools"

if [[ ! -d "$SHANNON_REPO_DIR/.git" ]]; then
  echo "Cloning Shannon into $SHANNON_REPO_DIR"
  git clone https://github.com/KeygraphHQ/shannon.git "$SHANNON_REPO_DIR"
else
  echo "Updating Shannon in $SHANNON_REPO_DIR"
  git -C "$SHANNON_REPO_DIR" pull --ff-only
fi

echo "Building Shannon image: $SHANNON_DOCKER_IMAGE"
docker build -t "$SHANNON_DOCKER_IMAGE" "$SHANNON_REPO_DIR"

echo "Running Shannon scan..."
docker run --rm \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  -e TARGET_URL="$TARGET_URL" \
  -v "$SCAN_SOURCE_DIR:/app/source:ro" \
  -v "$OUTPUT_DIR:/app/output" \
  "$SHANNON_DOCKER_IMAGE"

echo "Shannon scan completed. Reports in: $OUTPUT_DIR"
