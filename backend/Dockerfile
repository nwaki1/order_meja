# --- Build stage ---
# Rust 1.88+ needed because some transitive crates now use Edition 2024
# and newer dependencies require rustc >= 1.86.
FROM rust:1.88-slim-bookworm AS builder

WORKDIR /app

# Cache dependencies
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Build actual source
COPY src ./src
COPY migrations ./migrations
RUN touch src/main.rs && cargo build --release

# --- Runtime stage ---
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/sportiva-backend ./sportiva-backend
COPY --from=builder /app/migrations ./migrations

EXPOSE 3000

CMD ["./sportiva-backend"]
