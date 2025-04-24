# Testing the SolarWinds SWIS Plugin with Docker

This guide walks you through testing the SolarWinds SWIS datasource plugin locally with Docker.

## Prerequisites

- Docker and Docker Compose installed and running
- Access to a SolarWinds instance with SWIS API enabled (for full testing)

## Setup and Testing

### 1. Build the plugin

First, build the plugin distribution:

```bash
cd grafana-swis-datasource-react
node build.js
```

This will create the `dist` directory with the plugin files and a `grafana-swis-datasource-react.zip` file for distribution.

### 2. Start Grafana with Docker

Use the provided Docker Compose file to start Grafana with the plugin mounted:

```bash
docker-compose up -d
```

This will:
- Start a Grafana container on port 3000
- Mount your plugin from the `dist` directory
- Enable anonymous access with Admin privileges for easy testing
- Allow loading of unsigned plugins (including your SolarWinds SWIS plugin)

### 3. Access Grafana

Open your browser and navigate to:

```
http://localhost:3000
```

Default login credentials:
- Username: admin
- Password: admin

### 4. Add the SolarWinds SWIS Data Source

1. In Grafana, go to Configuration > Data Sources
2. Click "Add data source"
3. Search for "SolarWinds SWIS" - it should appear in the list
4. Click on it to configure:
   - Enter your SolarWinds SWIS API URL
   - Configure Basic Authentication with your SolarWinds credentials
   - Click "Save & Test"

### 5. Create a Dashboard

1. Create a new dashboard
2. Add a panel
3. Select your SolarWinds SWIS data source
4. Write a SWQL query, for example:

```sql
SELECT TOP 5
    LastSync, 
    Caption,
    CPULoad, 
    ResponseTime 
FROM
    Orion.Nodes
```

5. Select the appropriate visualization
6. Save your dashboard

### 6. Stop Docker Container

When you're done testing:

```bash
docker-compose down
```

## Troubleshooting

### Plugin Not Showing Up

If the plugin doesn't appear in the data sources list:

1. Check Grafana logs:
```bash
docker logs grafana-test
```

2. Verify plugin is correctly mounted:
```bash
docker exec -it grafana-test ls -la /var/lib/grafana/plugins/solarwinds-swis-datasource
```

3. Make sure the plugin ID in `plugin.json` matches the directory name in Docker

### Connection Issues

If you can't connect to your SolarWinds instance:

1. Verify the URL is correct and includes the full path to the SWIS JSON endpoint
2. Check network connectivity from the Docker container to your SolarWinds server
3. Make sure credentials are correct
4. Check if your SolarWinds server allows API access from your Docker host

### Docker Not Running

If Docker is not running:

1. Start Docker Desktop or the Docker service on your machine
2. Verify it's running with:
```bash
docker info
```

3. Then try starting the containers again