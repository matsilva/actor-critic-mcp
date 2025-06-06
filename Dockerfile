# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code and TypeScript config
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run type-check

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Install tsx globally for runtime
RUN npm install -g tsx

# Copy built application
COPY --from=builder /app .

# Create non-root user
RUN addgroup -g 1001 -S codeloops && \
    adduser -S codeloops -u 1001 -G codeloops

# Create required directories with proper permissions
RUN mkdir -p /app/data /app/logs /tmp/tsx-1001 && \
    chown -R codeloops:codeloops /app /tmp/tsx-1001 && \
    chmod 755 /tmp/tsx-1001

USER codeloops

# Expose ports for stdio and http servers
EXPOSE 8000

# Default to stdio server
CMD ["tsx", "src/index.ts"]