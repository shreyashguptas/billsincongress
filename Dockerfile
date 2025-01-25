FROM node:18-slim

WORKDIR /app

# Install git and other dependencies
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Clone repository and configure git
RUN git clone https://github.com/shreyashguptas/billsincongress.git . && \
    git config --global user.email "container@example.com" && \
    git config --global user.name "Container Script"

# Copy update script before npm install
COPY update-script.sh /app/
RUN chmod +x /app/update-script.sh

# Install dependencies
RUN npm install

# Create logs directory
RUN mkdir -p /app/logs && \
    chmod 777 /app/logs

# Set entrypoint
ENTRYPOINT ["/app/update-script.sh"] 