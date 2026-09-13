FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/schemas/package.json ./packages/schemas/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
RUN npm ci --ignore-scripts
COPY packages/schemas ./packages/schemas
COPY packages/db ./packages/db
COPY apps/api ./apps/api
RUN npm run build -w @vegan-bangkok/schemas -w @vegan-bangkok/db
ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "--import", "./src/instrument.ts", "src/server.ts"]
