# syntax=docker/dockerfile:1

FROM node:20-alpine AS runtime

WORKDIR /geokurs_form
ENV NODE_ENV=production

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY src ./src

# Expose the port (matches CONFIG.PORT default 8080)
EXPOSE 8080

# Start the server
CMD ["node", "src/server.js"]
