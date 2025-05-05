#!/bin/bash

# Production build script for SolarWinds SWIS React DataSource plugin
PLUGIN_ID="solarwinds-swis-react-datasource"
GRAFANA_PLUGINS_DIR="$HOME/grafana/plugins"

# Check for sign flag
SIGN_PLUGIN=false
ROOT_URLS=""

# Process command line arguments
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --install) INSTALL_PLUGIN=true ;;
    --sign) SIGN_PLUGIN=true ;;
    --root-urls=*) ROOT_URLS="${1#*=}" ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
  shift
done

# Clean build artifacts
echo "Cleaning previous build artifacts..."
rm -rf "dist" "$PLUGIN_ID.zip"

# Build the plugin
echo "Building plugin..."
npm run build

# Check if build succeeded
if [ ! -d "dist" ]; then
  echo "❌ Build failed. Check for errors above."
  exit 1
fi

# Sign the plugin if requested
if [ "$SIGN_PLUGIN" = true ]; then
  echo "Signing the plugin..."
  
  # Check if GRAFANA_ACCESS_POLICY_TOKEN is set
  if [ -z "$GRAFANA_ACCESS_POLICY_TOKEN" ]; then
    echo "❌ GRAFANA_ACCESS_POLICY_TOKEN environment variable is not set."
    echo "Please set it with your Grafana access policy token:"
    echo "export GRAFANA_ACCESS_POLICY_TOKEN=your-token"
    exit 1
  fi
  
  # Sign with root URLs if provided
  if [ -n "$ROOT_URLS" ]; then
    echo "Signing with root URLs: $ROOT_URLS"
    npm run sign -- --rootUrls="$ROOT_URLS"
  else
    # Sign for public distribution
    npm run sign
  fi
  
  # Check if signing succeeded
  if [ $? -ne 0 ]; then
    echo "❌ Plugin signing failed. Check for errors above."
    exit 1
  fi
  
  echo "✅ Plugin signed successfully"
fi

# Create zip file for distribution
echo "Creating zip file for distribution..."
cd dist
zip -r "../$PLUGIN_ID.zip" .
cd ..

# Optionally install to local Grafana
if [ "$INSTALL_PLUGIN" = true ]; then
  # Create Grafana plugins directory if it doesn't exist
  mkdir -p "$GRAFANA_PLUGINS_DIR/$PLUGIN_ID"
  
  # Clean previous installation
  rm -rf "$GRAFANA_PLUGINS_DIR/$PLUGIN_ID"/*
  
  # Copy to Grafana plugins directory
  echo "Copying to Grafana plugins directory..."
  cp -r dist/* "$GRAFANA_PLUGINS_DIR/$PLUGIN_ID/"
  echo "✅ Plugin installed to: $GRAFANA_PLUGINS_DIR/$PLUGIN_ID/"
  
  echo ""
  echo "Installation instructions:"
  if [ "$SIGN_PLUGIN" = true ]; then
    echo "Plugin is signed. You don't need to add it to allowed unsigned plugins list."
  else
    echo "1. Add to Grafana configuration:"
    echo "   GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=$PLUGIN_ID"
  fi
  echo "2. Restart Grafana server"
fi

echo ""
echo "✅ Build completed successfully"
echo "✅ Plugin zip created: $PLUGIN_ID.zip"
if [ "$SIGN_PLUGIN" = true ]; then
  echo "✅ Plugin is signed"
else
  echo "ℹ️ Plugin is not signed"
fi
echo ""