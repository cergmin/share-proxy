FROM node:24-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@10.30.1

FROM base AS builder
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/admin-api ./apps/admin-api
RUN pnpm install --frozen-lockfile

WORKDIR /app/apps/admin-api
RUN pnpm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/admin-api/package.json ./apps/admin-api/
COPY --from=builder /app/apps/admin-api/dist ./apps/admin-api/dist
COPY --from=builder /app/apps/admin-api/node_modules ./apps/admin-api/node_modules

WORKDIR /app/apps/admin-api
EXPOSE 3000
CMD ["npm", "run", "start"]
