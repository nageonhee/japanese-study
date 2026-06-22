# Step 1: Build stage
FROM node:20-alpine AS builder

# Install build tools for compiling native dependencies like better-sqlite3 on Alpine
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Step 2: Runtime stage
FROM node:20-alpine

# Install build tools for compiling native dependencies in runtime stage if needed
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Clean up build tools to keep the image slim
RUN apk del python3 make g++

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
