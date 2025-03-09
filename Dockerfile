FROM node:18-slim

WORKDIR /app

# Install git and other dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Clone repository without configuring git
# Git configuration will be done at runtime via environment variables
RUN git clone https://github.com/shreyashguptas/billsincongress.git .

# Copy update script before npm install
COPY update-script.sh /app/
RUN chmod +x /app/update-script.sh

# Install dependencies
RUN npm install

# Create logs directory with appropriate permissions
RUN mkdir -p /app/logs && \
    chmod 777 /app/logs

# Health check configuration
# This helps Docker determine if the container is healthy
# The container is considered healthy if the API endpoint responds
# Health check logs can be viewed with: docker inspect --format='{{json .State.Health}}' container_id
# In Kubernetes, this feeds into the liveness probe
HEALTHCHECK --interval=5m --timeout=3s \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Set entrypoint
ENTRYPOINT ["/app/update-script.sh"] 