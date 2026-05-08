# ── Stage 1: install dependencies ─────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Native build tools — needed if better-sqlite3 must compile from source
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

# ── Stage 2: build ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# Copy source files explicitly so the build context is unambiguous
COPY app/               ./app/
COPY components/        ./components/
COPY lib/               ./lib/
COPY package*.json      ./
COPY server.ts          ./
COPY tsconfig.json      tsconfig.server.json \
     next.config.mjs    tailwind.config.ts \
     postcss.config.js  ./

ENV NODE_ENV=production
RUN npm run build

# ── Stage 3: production runner ─────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next           ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules    ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/next.config.mjs ./next.config.mjs
COPY --from=builder --chown=nextjs:nodejs /app/package.json    ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/lib/schema.sql  ./lib/schema.sql

RUN mkdir -p /app/db && chown nextjs:nodejs /app/db

USER nextjs

EXPOSE 3000

CMD ["node", ".next/server-build/server.js"]
