#!/bin/bash

# This script sets up and runs a local Docker Grafana environment 
# for testing the production build of the plugin

# Step 1: Clean previous test environment
echo "Cleaning previous test environment..."
docker-compose down -v 2>/dev/null
rm -rf docker-plugin

# Step 2: Extract the production zip to the docker-plugin directory
echo "Setting up test environment..."
mkdir -p docker-plugin
unzip -q solarwinds-swis-react-datasource.zip -d docker-plugin

# Step 3: Start the Docker environment
echo "Starting Grafana Docker container..."
docker-compose up -d

# Step 4: Display access information
echo ""
echo "----------------------------------------"
echo "🚀 Grafana is now running at: http://localhost:3000"
echo "Username: admin"
echo "Password: admin"
echo ""
echo "Your plugin should be available in the data sources list"
echo "----------------------------------------"
echo ""
echo "To stop the test environment, run: docker-compose down"
echo ""

# Optional: Open browser automatically if on Mac
if [[ "$OSTYPE" == "darwin"* ]]; then
  open http://localhost:3000
fi