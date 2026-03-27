# Ecto Agent Container
# Isolated runtime for persistent AI agents in the Swarm network.

FROM node:22-slim

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ripgrep \
    python3 \
    curl \
    jq \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Bun (for fast script execution inside the container)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Create vault mount point
RUN mkdir -p /vault /root/.ecto

# Working directory
WORKDIR /ecto

# Copy the ecto server (built from ecto-server.ts)
COPY ecto-server.js .

# Copy CLI tools
COPY tools/ ./tools/
RUN chmod +x ./tools/*

# Expose ecto HTTP server + user ports
EXPOSE 3000 8001 8002 8003 8004 8005 8006 8007 8008 8009

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sf http://localhost:3000/health || exit 1

# Environment defaults
ENV ECTO_PORT=3000
ENV VAULT_PATH=/vault
ENV NODE_ENV=production

# Entrypoint
CMD ["node", "ecto-server.js"]
