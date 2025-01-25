#!/bin/bash
set -e

echo "Starting update at $(date)"

# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Run update script
npm run update-bills

echo "Update completed at $(date)" 