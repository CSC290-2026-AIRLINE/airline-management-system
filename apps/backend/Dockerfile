FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
WORKDIR /usr/src/app

# Copy workspace config and package.json
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json ./apps/backend/
COPY database/ ./database/

# Install dependencies
RUN pnpm install --frozen-lockfile --filter backend...

# Generate Prisma Client before compile NestJS
RUN pnpm --filter backend prisma generate

# Copy source code and compile
COPY apps/backend/ ./apps/backend/
RUN pnpm --filter backend build

# Prepare production dependencies
RUN pnpm --filter backend --prod deploy /prod/backend

FROM node:20-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production

USER node
COPY --from=build --chown=node:node /prod/backend ./
COPY --from=build --chown=node:node /usr/src/app/apps/backend/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]