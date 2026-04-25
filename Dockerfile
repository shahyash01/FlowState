# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app

# Copy manifests and install all deps (including dev for build)
COPY package.json package-lock.json ./
RUN npm ci

# ─── Stage 2: Build the Next.js app ──────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ─── Stage 3: Production runner ───────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Copy Next.js standalone output (includes its own minimal node_modules for Next)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy the custom server and supporting modules
# These need express / socket.io which are NOT in standalone's node_modules
COPY --from=builder --chown=nextjs:nodejs /app/server.js ./server.js
COPY --from=builder --chown=nextjs:nodejs /app/simulator.js ./simulator.js
COPY --from=builder --chown=nextjs:nodejs /app/store.js ./store.js
COPY --from=builder --chown=nextjs:nodejs /app/intelligence ./intelligence
COPY --from=builder --chown=nextjs:nodejs /app/routes ./routes

# Copy ALL production node_modules so express/socket.io/genai are available
# (standalone only bundles Next's internal deps — not your custom server deps)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Cloud Run sends traffic on $PORT (default 8080), fallback to 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
