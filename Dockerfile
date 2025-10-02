# Use Node.js 20 on Debian Bullseye
FROM node:20-bullseye

# Install ffmpeg (for future audio conversion needs)
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Create temp directory for file processing
RUN mkdir -p /app/temp

# Set default environment variables
ENV KOKORO_DTYPE=q8
ENV KOKORO_DEVICE=cpu
ENV PORT=8080

# Expose port
EXPOSE 8080

# Default command (can be overridden in docker-compose)
CMD ["node", "server/api.js"]
