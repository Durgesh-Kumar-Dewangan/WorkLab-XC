# syntax=docker/dockerfile:1
# Front end only (Next.js). The API is backend/ (Python). Build-time API_ORIGIN is baked into the rewrite rules.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
ARG API_ORIGIN=http://api:8000
# Values the browser code needs are fixed at build time. Without NEXT_PUBLIC_WLXC_API_BASE the site would run in a browser-only mode.
ARG NEXT_PUBLIC_WLXC_API_BASE=/api
ARG NEXT_PUBLIC_WLXC_CURRENCY=₹
ARG NEXT_PUBLIC_ADSENSE_CLIENT=
ARG NEXT_PUBLIC_ADSENSE_SLOT_DASHBOARD=
ARG NEXT_PUBLIC_ADSENSE_SLOT_LESSON=
ARG NEXT_PUBLIC_ADSENSE_SLOT_PANEL=
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ENV API_ORIGIN=$API_ORIGIN NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_WLXC_API_BASE=$NEXT_PUBLIC_WLXC_API_BASE NEXT_PUBLIC_WLXC_CURRENCY=$NEXT_PUBLIC_WLXC_CURRENCY     NEXT_PUBLIC_ADSENSE_CLIENT=$NEXT_PUBLIC_ADSENSE_CLIENT NEXT_PUBLIC_ADSENSE_SLOT_DASHBOARD=$NEXT_PUBLIC_ADSENSE_SLOT_DASHBOARD     NEXT_PUBLIC_ADSENSE_SLOT_LESSON=$NEXT_PUBLIC_ADSENSE_SLOT_LESSON NEXT_PUBLIC_ADSENSE_SLOT_PANEL=$NEXT_PUBLIC_ADSENSE_SLOT_PANEL     NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "server.js"]
