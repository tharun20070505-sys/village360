FROM node:22-bookworm-slim
WORKDIR /srv/village360
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev --workspace=backend --include-workspace-root=false && npm cache clean --force
COPY shared shared
COPY backend/src backend/src
COPY backend/scripts backend/scripts
USER node
WORKDIR /srv/village360/backend
ENV NODE_ENV=production
EXPOSE 5000
CMD ["node","src/server.js"]
