#!/bin/bash

# This script prepares the plugin for production deployment
# It creates a directory with the plugin id and copies all required files directly to it

PLUGIN_ID="solarwinds-swis-react-datasource"
PROD_DIR="prod-ready"

# Build the plugin first
node build.js

# Create production directory
mkdir -p "$PROD_DIR/$PLUGIN_ID"

# Copy all files from dist to the plugin directory
cp -r dist/* "$PROD_DIR/$PLUGIN_ID/"

# Create a zip file with the correct plugin id
cd "$PROD_DIR"
zip -r "../$PLUGIN_ID.zip" "$PLUGIN_ID"
cd ..

echo ""
echo "Production-ready plugin created in $PROD_DIR/$PLUGIN_ID"
echo "Zip file created: $PLUGIN_ID.zip"
echo ""
echo "To install on your production Grafana:"
echo "1. Extract $PLUGIN_ID.zip to /grafana/data/plugins/"
echo "2. Ensure all files are at the top level in /grafana/data/plugins/$PLUGIN_ID/"
echo "3. Configure Grafana to allow unsigned plugins (GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=$PLUGIN_ID)"
echo "4. Restart Grafana"
echo ""