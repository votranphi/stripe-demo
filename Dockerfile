# --- Stage 1: Builder ---
FROM node:22-alpine AS builder

WORKDIR /app

# Install build tools required for native libraries such as 'bcrypt'
RUN apk add --no-cache python3 make g++

# Copy package files to install dependencies
COPY package*.json ./

# Install all dependencies (including devDependencies to build TS)
RUN npm ci

# Copy the entire source code
COPY . .

# Build TypeScript to JavaScript (output to the dist directory)
RUN npm run build

# --- Stage 2: Runner ---
FROM node:22-alpine AS runner

WORKDIR /app

# Reinstall build tools if needed for production dependencies (for bcrypt)
RUN apk add --no-cache python3 make g++

# Copy package files to install production dependencies
COPY package*.json ./

# Install only necessary production dependencies (ignore devDependencies)
RUN npm ci --only=production

# Copy the built dist folder from Stage 1
COPY --from=builder /app/dist ./dist

# Copy .env.example as a reference (optional)
COPY .env.example .env.example

# Create a non-root 'node' user to run the application (improves security)
USER node

# Expose the port used by the application
EXPOSE 3000

# Command to start the application
CMD ["node", "dist/index.js"]
