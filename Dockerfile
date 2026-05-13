ARG NODE_IMAGE=node:20-bookworm-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
COPY public ./public
RUN npm run build
RUN npm prune --omit=dev

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

LABEL org.opencontainers.image.title="webgl-preview"
LABEL org.opencontainers.image.description="Unity WebGL preview plugin for XRUGC"
LABEL org.opencontainers.image.source="https://github.com/7dgame-com/webgl-preview"

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY scripts ./scripts
COPY package.json ./

ENV HOST=0.0.0.0
ENV PORT=3006

EXPOSE 3006
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s CMD node -e "fetch('http://127.0.0.1:3006/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
