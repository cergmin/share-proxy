FROM node:24-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@10.30.1

FROM base AS builder
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/admin-web ./apps/admin-web
RUN pnpm install --frozen-lockfile

WORKDIR /app/apps/admin-web
RUN pnpm run build

FROM nginx:alpine AS runner
COPY apps/admin-web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/apps/admin-web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
