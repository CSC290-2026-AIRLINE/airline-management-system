FROM node:24-alpine AS base

FROM base AS build
WORKDIR /usr/src/app

COPY package.json package-lock.json tsconfig*.json ./
COPY apps/backend/package.json ./apps/backend/
COPY db/ ./db/

RUN npm ci

# RUn prisma generate via binary in node_modules
RUN ./node_modules/.bin/prisma generate --schema=db/prisma/schema.prisma

COPY apps/backend/ ./apps/backend/
RUN npm run build -w apps/backend

FROM node:24-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV PORT=8080

USER node
COPY --from=build --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=build --chown=node:node /usr/src/app/apps/backend/package.json ./
COPY --from=build --chown=node:node /usr/src/app/apps/backend/dist ./dist

EXPOSE 8080
CMD ["node", "dist/main.js"]