#!/bin/bash

# Build the plugin
node build.js

# Start Docker containers
docker-compose up -d

echo "Grafana is starting at http://localhost:3000"
echo "Default credentials: admin/admin"
echo "The SolarWinds SWIS plugin should be available in the data sources list"
echo ""
echo "To stop: docker-compose down"