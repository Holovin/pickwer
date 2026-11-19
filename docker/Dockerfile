FROM node:26-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# SWS 2.x matches custom headers by URL, including on 404 responses.
RUN npm run build && \
    for asset in dist/assets/*; do \
      [ -e "$asset" ] || continue; \
      printf '\n[[advanced.headers]]\nsource = "/%s"\nheaders.Cache-Control = "public, max-age=31536000, immutable"\n' "${asset#dist/}" >> docker/sws.toml; \
    done

FROM ghcr.io/static-web-server/static-web-server:2.44.0@sha256:2c1a7c3e0feaea5859307403b74e1c575f3ec1499094fc077344173d11abaae2

COPY --from=build /app/dist/ /public/
COPY --from=build /app/docker/sws.toml /etc/sws.toml
ENV SERVER_CONFIG_FILE=/etc/sws.toml
USER 65532:65532
EXPOSE 8080
