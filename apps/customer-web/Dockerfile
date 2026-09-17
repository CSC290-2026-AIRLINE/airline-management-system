FROM node:20-alpine AS build
WORKDIR /usr/src/app

COPY package.json package-lock.json ./
COPY apps/customer-web/package.json ./apps/customer-web/

RUN npm ci

COPY tsconfig*.json ./
COPY apps/customer-web/ ./apps/customer-web/
RUN npm run build -w apps/customer-web

FROM nginx:alpine AS runner
COPY --from=build /usr/src/app/apps/customer-web/dist /usr/share/nginx/html

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