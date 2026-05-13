FROM nginx:1.19.0-alpine AS prod-stage

LABEL org.opencontainers.image.title="webgl-preview"
LABEL org.opencontainers.image.description="Unity WebGL preview plugin for XRUGC"
LABEL org.opencontainers.image.source="https://github.com/7dgame-com/webgl-preview"

RUN rm -rf /usr/share/nginx/html/*

COPY public /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/api/health || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
