FROM node:22-alpine AS base
RUN apk add --no-cache ffmpeg=9.0.1-r0
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
RUN npx prisma generate && npm run build
EXPOSE 3000
ENV STORAGE_BASE=/app/storage
CMD ["npm", "start"]
