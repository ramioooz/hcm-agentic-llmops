FROM node:22-alpine AS tooling

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run db:generate && npm run build

FROM node:22-alpine AS runtime-dependencies

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --omit=peer --omit=optional --legacy-peer-deps --ignore-scripts

FROM node:22-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=runtime-dependencies /app/node_modules ./node_modules
COPY --from=tooling /app/dist ./dist
COPY --from=tooling /app/package.json ./package.json
COPY --from=tooling /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

CMD ["npm", "start"]
