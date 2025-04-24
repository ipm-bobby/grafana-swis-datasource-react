# Deployment Guide for SolarWinds SWIS DataSource Plugin

This guide explains how to deploy the SolarWinds SWIS DataSource plugin (React version) to your Grafana instance.

## Prerequisites

- Grafana 10.0 or later
- Access to your Grafana plugins directory

## Installation

### Method 1: Install from zip file

1. Download the `grafana-swis-datasource-react.zip` file
2. Extract the contents to your Grafana plugins directory:
   ```
   /var/lib/grafana/plugins/solarwinds-swis-datasource/
   ```
   or on Windows:
   ```
   C:\Program Files\GrafanaLabs\grafana\data\plugins\solarwinds-swis-datasource\
   ```

3. Restart Grafana server
4. The plugin should now appear in the data source list in your Grafana instance

### Method 2: Install in Docker

If you're running Grafana in Docker, you can mount the plugin directory into your container:

```
docker run -d \
  -p 3000:3000 \
  --name=grafana \
  -v /path/to/plugins/solarwinds-swis-datasource:/var/lib/grafana/plugins/solarwinds-swis-datasource \
  grafana/grafana
```

## Configuration

After installing the plugin:

1. Navigate to Configuration > Data Sources in your Grafana instance
2. Click "Add data source" and search for "SolarWinds SWIS"
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
1. Check Grafana server logs for any errors
2. Verify that the plugin files are in the correct directory
3. Restart Grafana server
4. Make sure you have the appropriate permissions to access the plugin directory

For connection issues:
1. Check URL and authentication settings
2. Verify network connectivity to your SolarWinds server
3. Check if your SolarWinds server allows SWIS API access from your Grafana instance