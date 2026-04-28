FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
ARG VITE_CORE_API=
ARG VITE_ROUTING_API=/routing
ARG VITE_BASE_PATH=/
ENV VITE_CORE_API=$VITE_CORE_API
ENV VITE_ROUTING_API=$VITE_ROUTING_API
ENV VITE_BASE_PATH=$VITE_BASE_PATH
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
