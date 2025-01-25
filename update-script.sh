#!/bin/bash
set -e

# Create logs directory if it doesn't exist
mkdir -p /app/logs

# Set up logging
LOG_FILE="/app/logs/update-$(date +%Y%m%d-%H%M%S).log"
exec 1> >(tee -a "$LOG_FILE") 2>&1

echo "Starting update at $(date)"

# Reset any local changes and update from git
echo "Fetching latest code..."
git fetch origin main
git reset --hard origin/main

echo "Installing dependencies..."
npm install

echo "Verifying available scripts..."
npm run | grep "update-all-bills"

echo "Running update script..."
npm run update-all-bills

echo "Update completed at $(date)" 