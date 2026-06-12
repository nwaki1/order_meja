#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# ── helpers ──────────────────────────────────────────────────────────────────

ask_port() {
    local label="$1"
    local default="$2"
    local port_input port
    read -r -p "Port untuk $label? [$default]: " port_input
    port="${port_input:-$default}"
    if ! [[ "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
        echo "Error: '$port' bukan port yang valid (1-65535)." >&2
        exit 1
    fi
    echo "$port"
}

run_frontend() {
    local port="$1"
    if ! command -v pnpm >/dev/null 2>&1; then
        echo "Error: 'pnpm' tidak ditemukan. Install dengan: npm install -g pnpm" >&2
        exit 1
    fi
    if [ ! -d "frontend-admin/node_modules" ]; then
        echo "node_modules belum ada, menjalankan pnpm install..."
        pnpm --dir frontend-admin install
    fi
    echo "Menjalankan frontend-admin di port $port..."
    pnpm --dir frontend-admin exec vite dev --port "$port"
}

run_backend() {
    local port="$1"
    if ! command -v docker >/dev/null 2>&1; then
        echo "Error: 'docker' tidak ditemukan. Install Docker Desktop terlebih dahulu." >&2
        exit 1
    fi
    if docker compose version >/dev/null 2>&1; then
        COMPOSE="docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
        COMPOSE="docker-compose"
    else
        echo "Error: docker compose plugin tidak ditemukan." >&2
        exit 1
    fi

    REQUIRED_IMAGES=("rust:1.88-slim-bookworm" "debian:bookworm-slim")
    for img in "${REQUIRED_IMAGES[@]}"; do
        if docker image inspect "$img" >/dev/null 2>&1; then
            echo "  [cache] $img"
        else
            echo "  [pull]  $img ..."
            docker pull "$img"
        fi
    done

    echo "Menjalankan backend + Postgres di port $port..."
    export PORT="$port"
    $COMPOSE up --build
}

# ── pilihan service ───────────────────────────────────────────────────────────

echo ""
echo "Pilih service yang ingin dijalankan:"
echo "  1) Frontend"
echo "  2) Backend"
echo "  3) Both (frontend + backend)"
echo ""
read -r -p "Pilihan [1/2/3]: " choice

case "$choice" in
    1)
        fe_port=$(ask_port "frontend" 3000)
        run_frontend "$fe_port"
        ;;
    2)
        be_port=$(ask_port "backend" 3001)
        run_backend "$be_port"
        ;;
    3)
        fe_port=$(ask_port "frontend" 3000)
        be_port=$(ask_port "backend" 3001)

        # Jalankan backend di background, frontend di foreground
        (
            export PORT="$be_port"
            run_backend "$be_port"
        ) &
        BE_PID=$!

        # Beri jeda singkat agar output backend tidak tumpang tindih
        sleep 1

        run_frontend "$fe_port"

        # Kalau frontend dihentikan (Ctrl+C), matikan backend juga
        kill "$BE_PID" 2>/dev/null || true
        wait "$BE_PID" 2>/dev/null || true
        ;;
    *)
        echo "Pilihan tidak valid. Masukkan 1, 2, atau 3." >&2
        exit 1
        ;;
esac
