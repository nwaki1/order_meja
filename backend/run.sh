#!/usr/bin/env bash
#
# Run the Sportiva backend (+ Postgres) with Docker.
# Usage: bash run.sh
#
# Prompts for a port (with a default), then starts the stack via docker compose.
# No local Rust/cargo install needed — Rust lives inside the Docker build.

set -euo pipefail

# docker-compose.yml lives in the repo root, one level up from this script.
cd "$(dirname "$0")/.."

DEFAULT_PORT=3001

# Make sure docker is available.
if ! command -v docker >/dev/null 2>&1; then
    echo "Error: 'docker' not found. Install Docker Desktop first: https://docker.com" >&2
    exit 1
fi

# Pick the compose command (new 'docker compose' vs legacy 'docker-compose').
if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
else
    echo "Error: docker compose plugin not found." >&2
    exit 1
fi

read -r -p "Run on which port? [${DEFAULT_PORT}]: " PORT_INPUT
PORT="${PORT_INPUT:-$DEFAULT_PORT}"

# Validate the port is a number in the valid range.
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    echo "Error: '$PORT' is not a valid port (must be 1-65535)." >&2
    exit 1
fi

echo "Starting Sportiva backend + Postgres on port ${PORT}..."

# docker-compose.yml reads ${PORT} for both the app and the published port.
export PORT

# Pull base images only if not already cached locally.
# This avoids Docker timing out when authenticating to Docker Hub unnecessarily.
REQUIRED_IMAGES=("rust:1.88-slim-bookworm" "debian:bookworm-slim")
for img in "${REQUIRED_IMAGES[@]}"; do
    if docker image inspect "$img" >/dev/null 2>&1; then
        echo "  [cache] $img"
    else
        echo "  [pull]  $img ..."
        if ! docker pull "$img"; then
            echo "Error: Could not pull '$img'. Check your internet connection." >&2
            exit 1
        fi
    fi
done

$COMPOSE up --build
