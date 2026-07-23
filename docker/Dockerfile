# syntax=docker/dockerfile:1
# Production-like local test: build the package + a chosen example in the
# monorepo, then serve the static example with nginx. Pick the example via the
# EXAMPLE build arg (docs | react).
ARG EXAMPLE=docs

# ---- build stage ----------------------------------------------------------
FROM node:22-alpine AS build
ARG EXAMPLE
RUN corepack enable
WORKDIR /app

# Copy the whole workspace (node_modules/dist are excluded via .dockerignore).
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @deepnoid/biewer build
RUN pnpm --filter @biewer/example-${EXAMPLE} build

# ---- serve stage ----------------------------------------------------------
FROM nginx:alpine AS serve
ARG EXAMPLE
COPY --from=build /app/examples/${EXAMPLE}/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
