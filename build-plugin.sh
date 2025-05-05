#!/bin/bash

# Production build script for SolarWinds SWIS React DataSource plugin
PLUGIN_ID="solarwinds-swis-react-datasource"
GRAFANA_PLUGINS_DIR="$HOME/grafana/plugins"

# Create Grafana plugins directory if it doesn't exist
mkdir -p "$GRAFANA_PLUGINS_DIR/$PLUGIN_ID"

# Clean everything
rm -rf "dist" "$PLUGIN_ID.zip"
rm -rf "$GRAFANA_PLUGINS_DIR/$PLUGIN_ID"/*

# Build the plugin
echo "Building plugin..."
npm run build

# Check if build succeeded
if [ ! -d "dist" ]; then
  echo "❌ Build failed. Check for errors above."
  exit 1
fi

# Create zip file for distribution
echo "Creating zip file for distribution..."
cd dist
zip -r "../$PLUGIN_ID.zip" .
cd ..

# Copy to Grafana plugins directory
echo "Copying to Grafana plugins directory..."
cp -r dist/* "$GRAFANA_PLUGINS_DIR/$PLUGIN_ID/"

echo ""
echo "✅ Build completed successfully"
echo "✅ Plugin copied to: $GRAFANA_PLUGINS_DIR/$PLUGIN_ID/"
echo "✅ Plugin zip created: $PLUGIN_ID.zip"
echo ""
echo "Installation instructions:"
echo "1. Add to Grafana configuration:"
echo "   GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=$PLUGIN_ID"
echo "2. Restart Grafana server"
echo ""