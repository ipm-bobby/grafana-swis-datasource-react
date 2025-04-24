# Deployment Guide for SolarWinds SWIS React DataSource Plugin

This guide explains how to deploy the SolarWinds SWIS React DataSource plugin to your Grafana instance.

## Prerequisites

- Grafana 10.0 or later
- Access to your Grafana plugins directory

## Installation

### Method 1: Install from zip file

1. Download the `solarwinds-swis-react-datasource.zip` file
2. Extract the contents to your Grafana plugins directory:
   ```
   /var/lib/grafana/plugins/solarwinds-swis-react-datasource/
   ```
   or on Windows:
   ```
   C:\Program Files\GrafanaLabs\grafana\data\plugins\solarwinds-swis-react-datasource\
   ```

3. Make sure all files from the zip are at the root level of the plugin directory, NOT in a subdirectory.
   Your directory structure should have these files at the top level:
   ```
   /var/lib/grafana/plugins/solarwinds-swis-react-datasource/
   ├── plugin.json
   ├── module.js
   ├── README.md
   ├── LICENSE
   └── img/
       └── solarwinds-icon.svg
   ```

4. Configure Grafana to allow unsigned plugins:
   - Edit your grafana.ini file and add:
     ```
     [plugins]
     allow_loading_unsigned_plugins = solarwinds-swis-react-datasource
     ```
   - Or set an environment variable in your startup script/docker-compose:
     ```
     GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=solarwinds-swis-react-datasource
     ```

5. Check file permissions. Ensure the Grafana user has read access to the plugin files:
   ```
   sudo chown -R grafana:grafana /var/lib/grafana/plugins/solarwinds-swis-react-datasource
   ```

6. Restart Grafana server
7. The plugin should now appear in the data source list in your Grafana instance

### Method 2: Install in Docker

If you're running Grafana in Docker, you can mount the plugin directory into your container:

```
docker run -d \
  -p 3000:3000 \
  --name=grafana \
  -e GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=solarwinds-swis-react-datasource \
  -v /path/to/plugins/solarwinds-swis-react-datasource:/var/lib/grafana/plugins/solarwinds-swis-react-datasource \
  grafana/grafana
```

## Configuration

After installing the plugin:

1. Navigate to Configuration > Data Sources in your Grafana instance
2. Click "Add data source" and search for "SolarWinds SWIS React"
3. Configure the data source:
   - **URL**: Enter your SolarWinds Information Service (SWIS) endpoint (default: `https://localhost:17778/SolarWinds/InformationService/v3/Json/`)
   - **Authentication**: Configure Basic Auth with your SolarWinds credentials
   - **Skip TLS Verify**: Enable if your SWIS endpoint uses a self-signed certificate

4. Click "Save & Test" to verify the connection

## Usage

Once configured, you can create dashboards that use SWQL queries to fetch data from your SolarWinds instance.

### Example time series query:
```sql
SELECT
    downsample(ObservationTimeStamp) as time,
    a.Node.Caption,
    AVG(AvgLoad) as CpuLoad,
    AVG(AvgMemoryUsed) as MemoryUsed
FROM Orion.CPULoad a
WHERE ObservationTimeStamp BETWEEN $from AND $to
GROUP BY downsample(ObservationTimeStamp), a.Node.Caption, a.NodeID
ORDER BY time DESC
```

### Example template variable query:
```sql
SELECT Caption as __text, NodeID as __value FROM Orion.Nodes ORDER BY Caption
```

## Troubleshooting

If the plugin does not appear in your Grafana instance:
1. Check Grafana server logs for any errors:
   ```
   grep -i "plugin" /var/log/grafana/grafana.log
   ```
2. Verify that the plugin files are in the correct directory and not in a subdirectory
3. Double-check the plugin ID in the configuration (it should be `solarwinds-swis-react-datasource`)
4. Enable debug logging to get more information:
   ```
   [log]
   level = debug
   ```
5. Make sure you have the appropriate permissions to access the plugin directory
6. Verify that the correct version of Grafana is being used (10.0+)
7. Restart Grafana server after making any changes

For connection issues:
1. Check URL and authentication settings
2. Verify network connectivity to your SolarWinds server
3. Check if your SolarWinds server allows SWIS API access from your Grafana instance