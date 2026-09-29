# Grail Wars — single-process production image.
#
# One Node process serves the built client (client/dist), the REST API, and the
# Socket.IO server on the same port.

FROM node:24-alpine AS build

WORKDIR /app

# Install with the lockfile, with every workspace manifest present.
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY . .
# Builds the Vite client into client/dist (which the server serves statically).
RUN npm run build

# ---------------------------------------------------------------------------

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# node_modules is needed at runtime, including the `tsx` loader the server runs
# under, so the full tree is carried over rather than pruned.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/tsconfig.base.json ./
COPY --from=build /app/shared ./shared
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/client/package.json ./client/package.json

# Writable cache directory for the research cache.
RUN mkdir -p /app/server/.cache && chown -R node:node /app/server/.cache
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
