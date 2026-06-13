# --- Build stage ---
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Pin pnpm to the version used locally; newer pnpm (11.x via corepack) enforces a
# minimumReleaseAge supply-chain policy that rejects freshly published deps.
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Public API base URL is baked into the client bundle at build time (Vite).
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm build

# --- Runtime stage (TanStack Start SSR node server, listens on :3000) ---
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server-node.mjs ./server-node.mjs
EXPOSE 3000
CMD ["node", "server-node.mjs"]
