# Cloudflare Containers run linux/amd64. `wrangler deploy` builds and pushes this image.
# Both stages pin the index digest of node:24.22.3-bookworm-slim.

FROM node:24.22.3-bookworm-slim@sha256:4d897dfbf2bed5e4e09128f8b8da96a2bdf36e3cace084a32c9c4e637ec0ff81 AS build

WORKDIR /app
ENV CI=true

COPY package.json ./
RUN corepack enable && corepack install

COPY . .
RUN pnpm install --frozen-lockfile --filter @dash/web...
RUN pnpm --filter @dash/web build

FROM node:24.22.3-bookworm-slim@sha256:4d897dfbf2bed5e4e09128f8b8da96a2bdf36e3cace084a32c9c4e637ec0ff81 AS runtime

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
