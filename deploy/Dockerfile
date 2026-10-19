# Imagen de core (API + UI compilada + migraciones). Se construye desde la raíz del repo.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/core/package.json apps/core/
COPY apps/ui/package.json apps/ui/
RUN pnpm install --frozen-lockfile --filter "@mi-setup/core..." --filter "@mi-setup/ui..."
COPY packages/shared packages/shared
COPY apps/core apps/core
COPY apps/ui apps/ui
RUN pnpm --filter "@mi-setup/core..." build \
  && pnpm --filter @mi-setup/ui build \
  && pnpm --filter @mi-setup/core deploy --prod /out \
  && cp -r apps/ui/dist /out/public

FROM node:22-alpine AS runtime
# ffmpeg: convertir audio y video (Convertidor) y cortar clips; yt-dlp: traer tus streams de Twitch, Kick y YouTube (Clips).
RUN apk add --no-cache ffmpeg yt-dlp
ENV NODE_ENV=production \
    UI_DIR=/app/public \
    UPLOADS_DIR=/data/uploads \
    ARCHIVOS_DIR=/data/archivos
WORKDIR /app
COPY --from=build --chown=node:node /out ./
RUN mkdir -p /data/uploads /data/archivos && chown node:node /data/uploads /data/archivos
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
