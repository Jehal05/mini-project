# One image: the API plus the built frontend on one origin (see docs/deployment.md).
FROM node:22-alpine AS web
WORKDIR /app
COPY shared ./shared
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend ./frontend
RUN cd frontend && VITE_API_URL= npx vite build --outDir /app/web

FROM node:22-alpine
ENV NODE_ENV=production STATIC_DIR=/app/web PORT=5000
WORKDIR /app
COPY shared ./shared
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev
COPY backend ./backend
COPY --from=web /app/web ./web
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:5000/api/health || exit 1
WORKDIR /app/backend
CMD ["node", "src/index.js"]
