FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run db:generate && npm run build

EXPOSE 3000

CMD ["npm", "start"]
