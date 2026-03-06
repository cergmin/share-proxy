FROM node:24-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@10.30.1

FROM base AS builder
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/proxy ./apps/proxy
RUN pnpm install --frozen-lockfile

WORKDIR /app/apps/proxy
RUN pnpm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/proxy/package.json ./apps/proxy/
COPY --from=builder /app/apps/proxy/dist ./apps/proxy/dist
COPY --from=builder /app/apps/proxy/node_modules ./apps/proxy/node_modules

WORKDIR /app/apps/proxy
EXPOSE 3001
CMD ["npm", "run", "start"]
