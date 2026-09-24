FROM node:24-alpine AS base

FROM base AS build
WORKDIR /usr/src/app

COPY package.json package-lock.json tsconfig*.json ./
COPY apps/backend/package.json ./apps/backend/
COPY db/ ./db/

RUN npm ci --ignore-scripts

COPY apps/backend/ ./apps/backend/

ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npm --workspace=apps/backend exec prisma -- generate

RUN npm run build -w apps/backend

FROM node:24-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV PORT=8080

USER node

COPY --from=build --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=build --chown=node:node /usr/src/app/apps/backend ./apps/backend

WORKDIR /usr/src/app/apps/backend

EXPOSE 8080
CMD ["node", "dist/src/main.js"]