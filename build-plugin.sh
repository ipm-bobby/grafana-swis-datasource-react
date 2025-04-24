#!/bin/bash

# Production build script for SolarWinds SWIS React DataSource plugin
PLUGIN_ID="solarwinds-swis-react-datasource"

# Clean everything
rm -rf "$PLUGIN_ID" dist "$PLUGIN_ID.zip"

# Build plugin and prepare files
echo "Building plugin..."
node build.js

# Create clean plugin directory
echo "Creating plugin directory structure..."
mkdir -p "$PLUGIN_ID/img"
cp dist/plugin.json dist/module.js dist/README.md dist/LICENSE "$PLUGIN_ID/"
cp dist/img/solarwinds-icon.svg "$PLUGIN_ID/img/"

# Create zip with just this directory
echo "Creating production zip file..."
cd "$PLUGIN_ID"
zip -r "../$PLUGIN_ID.zip" .
cd ..

# Remove temporary files
rm -rf "$PLUGIN_ID" dist

echo ""
echo "✅ Production build completed: $PLUGIN_ID.zip"
echo ""
echo "Installation instructions:"
echo "1. Extract to /grafana/data/plugins/$PLUGIN_ID/"
echo "2. Set: GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=$PLUGIN_ID"
echo "3. Set permissions: chown -R grafana:grafana /grafana/data/plugins/$PLUGIN_ID/"
echo "4. Restart Grafana"
echo ""