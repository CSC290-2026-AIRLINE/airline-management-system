FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
WORKDIR /usr/src/app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/frontend/package.json ./apps/frontend/

RUN pnpm install --frozen-lockfile --filter frontend...

COPY apps/frontend/ ./apps/frontend/
RUN pnpm --filter frontend build

# Production static server via Nginx
FROM nginx:alpine AS runner
COPY --from=build /usr/src/app/apps/frontend/dist /usr/share/nginx/html

# Clean ASCII Nginx fallback config
RUN printf '%s\n' \
'server {' \
'    listen 80;' \
'    location / {' \
'        root /usr/share/nginx/html;' \
'        index index.html index.htm;' \
'        try_files $uri $uri/ /index.html;' \
'    }' \
'}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]