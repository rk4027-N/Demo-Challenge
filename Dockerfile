# Stage 1 - Build Dependencies
FROM node:26.5.0-alpine AS builder

WORKDIR /app

COPY app/package*.json ./

RUN npm install --omit=dev

COPY app/ .

# Stage 2 - Runtime Image
FROM node:26.5.0-alpine

WORKDIR /app

COPY --from=builder /app /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

USER appuser

EXPOSE 3000

CMD ["npm", "start"]