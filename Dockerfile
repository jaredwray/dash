# Cloudflare Containers run linux/amd64. `wrangler deploy` builds and pushes this image.
# Both stages pin the index digest of node:24.22.2-bookworm-slim.

FROM node:24.22.2-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS build

WORKDIR /app
ENV CI=true

COPY package.json ./
RUN corepack enable && corepack install

COPY . .
RUN pnpm install --frozen-lockfile --filter @dash/web...
RUN pnpm --filter @dash/web build

FROM node:24.22.2-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    DASH_SEED_DEMO=false

COPY --from=build --chown=node:node /app/packages/web/.output ./.output

USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
