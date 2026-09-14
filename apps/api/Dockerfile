FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY prisma ./prisma
COPY scripts ./scripts
RUN npm ci --ignore-scripts
RUN npx prisma generate
COPY apps/api ./apps/api
RUN npm run build -w @dms/api
ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 4000
USER node
CMD ["node", "apps/api/dist/main.js"]
