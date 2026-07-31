ARG WEBGL_PREVIEW_BASE_IMAGE=hkccr.ccs.tencentyun.com/plugins/webgl-preview@sha256:1e03190d0b44ca204869461862859198a801edb3b4c1bf00e8ee5e8da1d9bfe5
ARG ARTIFACT_TOOL_IMAGE=node:20.19.4-alpine3.22@sha256:df02558528d3d3d0d621f112e232611aecfee7cbc654f6b375765f72bb262799
ARG REQUIRE_APPROVED_BUILD=0
ARG WEBGL_PREVIEW_BUILD_VERSION=

FROM ${WEBGL_PREVIEW_BASE_IMAGE} AS unity-source
ARG WEBGL_PREVIEW_BASE_IMAGE
ARG REQUIRE_PINNED_BASE_IMAGE=0
RUN if [ "${REQUIRE_PINNED_BASE_IMAGE}" = "1" ] && \
      ! printf '%s' "${WEBGL_PREVIEW_BASE_IMAGE}" | grep -Eq '@sha256:[0-9a-f]{64}$'; then \
      printf '%s\n' 'WEBGL_PREVIEW_BASE_IMAGE must be pinned by sha256 digest'; \
      exit 1; \
    fi

FROM ${ARTIFACT_TOOL_IMAGE} AS manifest-builder
WORKDIR /work
COPY --from=unity-source /usr/share/nginx/html/Build ./public/Build
COPY scripts/build-manifest.js ./scripts/build-manifest.js
RUN node scripts/build-manifest.js generate \
      --root public \
      --output public/build-manifest.json

FROM ${ARTIFACT_TOOL_IMAGE} AS shell-builder
ARG REQUIRE_APPROVED_BUILD
ARG WEBGL_PREVIEW_BUILD_VERSION
WORKDIR /work
COPY public ./public
COPY scripts/inject-build-version.js ./scripts/inject-build-version.js
RUN if [ "${REQUIRE_APPROVED_BUILD}" = "1" ]; then \
      node scripts/inject-build-version.js \
        --root public \
        --version "${WEBGL_PREVIEW_BUILD_VERSION}" \
        --require; \
    else \
      node scripts/inject-build-version.js \
        --root public \
        --version "${WEBGL_PREVIEW_BUILD_VERSION}"; \
    fi

FROM unity-source AS runtime
ARG WEBGL_PREVIEW_BASE_IMAGE
ARG WEBGL_PREVIEW_BUILD_VERSION
ENV NGINX_ENVSUBST_FILTER="^HOST_API_BASE$"
LABEL org.opencontainers.image.title="webgl-preview"
LABEL org.opencontainers.image.description="Unity WebGL preview plugin for XRUGC"
LABEL org.opencontainers.image.source="https://github.com/7dgame-com/webgl-preview"
LABEL org.opencontainers.image.base.name="${WEBGL_PREVIEW_BASE_IMAGE}"
LABEL io.7dgame.webgl-preview.build-manifest="/build-manifest.json"
LABEL io.7dgame.webgl-preview.build-version="${WEBGL_PREVIEW_BUILD_VERSION}"

# public/Build is excluded from the context. The real Unity binaries are
# inherited from unity-source and never replaced by Git LFS pointer files.
COPY --from=shell-builder /work/public /usr/share/nginx/html
COPY --from=manifest-builder /work/public/build-manifest.json \
  /usr/share/nginx/html/build-manifest.json
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY nginx-security-headers.conf \
  /etc/nginx/snippets/webgl-preview-security-headers.conf
COPY --chmod=755 scripts/validate-host-api-base.sh \
  /docker-entrypoint.d/15-validate-host-api-base.sh

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/api/health || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

FROM ${ARTIFACT_TOOL_IMAGE} AS final-verifier
ARG REQUIRE_APPROVED_BUILD
ARG WEBGL_PREVIEW_BASE_IMAGE
WORKDIR /verify
COPY scripts/build-manifest.js ./scripts/build-manifest.js
COPY scripts/check-artifact-compatibility.js ./scripts/check-artifact-compatibility.js
COPY scripts/inject-build-version.js ./scripts/inject-build-version.js
COPY --from=runtime /usr/share/nginx/html ./public
RUN node scripts/inject-build-version.js --root public --verify
RUN node scripts/build-manifest.js verify \
      --root public \
      --manifest public/build-manifest.json
RUN if [ "${REQUIRE_APPROVED_BUILD}" = "1" ]; then \
      node scripts/check-artifact-compatibility.js \
        --root public \
        --base-image "${WEBGL_PREVIEW_BASE_IMAGE}"; \
    fi
RUN touch /verified

FROM runtime AS final
# The copy creates a dependency on final-verifier, so a normal Docker build
# cannot skip strict LFS/hash/size/compression validation of the final files.
COPY --from=final-verifier /verified \
  /usr/share/nginx/html/.build-artifacts-verified
