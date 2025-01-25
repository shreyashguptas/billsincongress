FROM node:18-slim

WORKDIR /app

# Install git and other dependencies
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Clone repository
RUN git clone https://github.com/shreyashguptas/billsincongress.git .

# Install dependencies
RUN npm install

# Add script to handle updates
COPY update-script.sh /app/
RUN chmod +x /app/update-script.sh

# Set entrypoint
ENTRYPOINT ["/app/update-script.sh"] 