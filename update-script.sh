#!/bin/bash

# Set error handling
set -e

# Log file setup
LOG_DIR="/app/logs"
LOG_FILE="$LOG_DIR/update-$(date +%Y-%m-%d-%H%M%S).log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Function to log messages
log() {
  local timestamp=$(date +"%Y-%m-%d %H:%M:%S")
  echo "[$timestamp] $1" | tee -a "$LOG_FILE"
}

# Log start of script
log "Starting bill update process"

# Verify .env.local file exists
if [ ! -f "/app/.env.local" ]; then
  log "ERROR: .env.local file not found. Make sure the Kubernetes secret is properly mounted."
  exit 1
else
  log "Found .env.local file"
fi

# Pull latest code changes
log "Pulling latest code changes"
git pull origin main

# Install any new dependencies
log "Checking for new dependencies"
npm install

# Run the update script
log "Running bill update script"
npm run update-bills 2>&1 | tee -a "$LOG_FILE"

# Check if update was successful
if [ $? -eq 0 ]; then
  log "Bill update completed successfully"
else
  log "ERROR: Bill update failed"
  exit 1
fi

# Log completion
log "Update process completed" 