# Build from the folder that holds BOTH projects:
#
#   RUST/data-obfuscator/
#     ├─ data-obfuscator/   (the Rust program)
#     └─ App/               (this app)
#
#   cd RUST/data-obfuscator
#   docker build -f App/deploy/Dockerfile -t data-obfuscator-app .
#   docker run -d --name obfuscator -p 127.0.0.1:8787:8787 --read-only --tmpfs /tmp \
#       -v obfuscator-jobs:/data -e HOST=0.0.0.0 -e JOBS_DIR=/data data-obfuscator-app

FROM rust:1-bookworm AS rust
WORKDIR /src
COPY data-obfuscator/ ./
# The build script bumps the version number in the source tree; stop that inside the image.
RUN DATA_OBFUSCATOR_NO_BUMP=1 cargo build --release

FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY App/package.json App/package-lock.json ./
RUN npm ci
COPY App/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 JOBS_DIR=/data
WORKDIR /app
COPY --from=web /app/package.json ./
COPY --from=web /app/node_modules ./node_modules
COPY --from=web /app/dist ./dist
COPY --from=web /app/server ./server
COPY --from=web /app/src/shared ./src/shared
COPY --from=web /app/tsconfig.json /app/app.config.ts ./
COPY --from=rust /src/target/release/data-obfuscator /app/bin/data-obfuscator
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "server/index.ts"]
