# Cloudflare Containers run linux/amd64. `wrangler deploy` builds and pushes this image.
# Digest is the linux/amd64 manifest for node:24-bookworm-slim.

FROM node:24-bookworm-slim@sha256:a43f7fc3e52e87d12a905f46eea0275def84ca8f2981a5b53fed44d7fb398ee0 AS build

WORKDIR /app
ENV CI=true

COPY package.json ./
RUN corepack enable && corepack install

COPY . .
RUN pnpm install --frozen-lockfile --filter @dash/web...
RUN pnpm --filter @dash/web build

FROM node:24-bookworm-slim@sha256:a43f7fc3e52e87d12a905f46eea0275def84ca8f2981a5b53fed44d7fb398ee0 AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    DASH_DATABASE_PATH=/data/dash.sqlite \
    DASH_SEED_DEMO=false

RUN mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /app/packages/web/.output ./.output

USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
