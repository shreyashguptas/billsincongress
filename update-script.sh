#!/bin/bash
set -e

# Create logs directory if it doesn't exist
mkdir -p /app/logs

# Set up logging
LOG_FILE="/app/logs/update-$(date +%Y%m%d-%H%M%S).log"
exec 1> >(tee -a "$LOG_FILE") 2>&1

echo "Starting update at $(date)"

# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Run update script
npm run update-bills

echo "Update completed at $(date)" 