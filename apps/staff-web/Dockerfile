FROM node:24-alpine AS build
WORKDIR /usr/src/app

COPY package.json package-lock.json ./
COPY apps/staff-web/package.json ./apps/staff-web/

RUN npm ci

COPY tsconfig*.json ./
COPY apps/staff-web/ ./apps/staff-web/
RUN npm run build -w apps/staff-web

FROM nginx:alpine AS runner
COPY --from=build /usr/src/app/apps/staff-web/dist /usr/share/nginx/html

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