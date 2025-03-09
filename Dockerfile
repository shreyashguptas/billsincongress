FROM node:18-slim

WORKDIR /app

# Install git and other dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Clone repository and configure git
# IMPORTANT: Before building the image, replace these values with appropriate credentials
# - For personal repositories, use your actual email and name
# - For automated systems, use a service account email
# - These values are stored in the Docker image and visible in the container
RUN git clone https://github.com/shreyashguptas/billsincongress.git . && \
    git config --global user.email "container@example.com" && \
    git config --global user.name "Container Script"

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