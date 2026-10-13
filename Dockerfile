FROM node:24-bookworm-slim AS dependencies
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json
RUN npm ci

FROM dependencies AS source
COPY client ./client
COPY server ./server
COPY shared ./shared
COPY alvis-blueprint ./alvis-blueprint

FROM source AS client-build
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npm run build --workspace @alvis/client

FROM source AS server-build
RUN npm run build --workspace @alvis/server

FROM node:24-bookworm-slim AS client
ENV NODE_ENV=production
WORKDIR /workspace/client
COPY --from=client-build --chown=node:node /workspace/node_modules /workspace/node_modules
COPY --from=client-build --chown=node:node /workspace/client /workspace/client
COPY --from=client-build --chown=node:node /workspace/shared /workspace/shared
COPY --from=client-build --chown=node:node /workspace/alvis-blueprint/schemas /workspace/alvis-blueprint/schemas
USER node
EXPOSE 3000
CMD ["node","../node_modules/next/dist/bin/next","start","--hostname","0.0.0.0","--port","3000"]

FROM node:24-bookworm-slim AS server
ENV NODE_ENV=production SERVER_HOST=0.0.0.0 SERVER_PORT=4000
WORKDIR /workspace/server
COPY --from=server-build --chown=node:node /workspace/node_modules /workspace/node_modules
COPY --from=server-build --chown=node:node /workspace/server /workspace/server
COPY --from=server-build --chown=node:node /workspace/shared /workspace/shared
COPY --from=server-build --chown=node:node /workspace/alvis-blueprint /workspace/alvis-blueprint
USER node
EXPOSE 4000
CMD ["node","scripts/launch.mjs","start"]

FROM source AS worker
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /workspace/server
USER node
CMD ["node","scripts/job.mjs","worker"]
