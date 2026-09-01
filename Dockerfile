# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:24-alpine

# ---------- deps: full dependency tree (incl. dev) ----------
FROM ${NODE_IMAGE} AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
# The image ships an older npm that does not gate install scripts, so a plain
# `npm ci` runs prisma's engine postinstall as needed. The fallback keeps this
# working if the base image later moves to npm >= 11.19, which blocks them.
RUN npm ci || (npm ci --ignore-scripts && npm install-scripts approve prisma @prisma/engines unrs-resolver)

# ---------- builder: prisma generate + next build ----------
FROM ${NODE_IMAGE} AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# ---------- migrator: one-shot image that runs `prisma migrate deploy` ----------
FROM ${NODE_IMAGE} AS migrator
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------- runner: minimal standalone server ----------
FROM ${NODE_IMAGE} AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

RUN mkdir -p /data/attachments && chown -R nextjs:nodejs /data
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
