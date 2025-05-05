# SolarWinds SWIS React DataSource for Grafana

A Grafana datasource plugin for querying SolarWinds data using SWQL via the SWIS REST API.

## Features

- Connect to SolarWinds Information Service (SWIS) over HTTP/HTTPS
- Write SWQL queries to retrieve data
- Create time-series graphs from SWQL queries
- Support for template variables
- Annotation support

## Installation

1. Download the latest release ZIP file
2. Extract to your Grafana plugins directory (e.g., `/var/lib/grafana/plugins/solarwinds-swis-react-datasource`)
3. Set permissions: `chown -R grafana:grafana /var/lib/grafana/plugins/solarwinds-swis-react-datasource`
4. Enable the unsigned plugin by adding to your Grafana configuration:
   ```ini
   [plugins]
   allow_loading_unsigned_plugins = solarwinds-swis-react-datasource
   ```
   or set the environment variable:
   ```
   GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=solarwinds-swis-react-datasource
   ```
5. Restart Grafana

## Configuration

1. Add a new datasource in Grafana and select "SolarWinds SWIS React DataSource"
2. Configure the SWIS URL (default: `https://localhost:17774/SolarWinds/InformationService/v3/Json/`)
3. Configure authentication (typically Basic Auth with your SolarWinds credentials)
4. Enable "Skip TLS Verify" if you are using a self-signed certificate
5. Click "Save & Test" to verify the connection

## Query Editor

The query editor provides a SQL-like interface for writing SWQL queries.

### Time Series Queries

For time series data, make sure your query:
- Has a timestamp column (can be aliased as "time")
- Has numeric value columns
- Includes the time range variables ($from and $to)

Example:
```sql
SELECT 
    datetime as time, 
    Caption as metric,
    CPULoad as value
FROM Orion.CPULoad
WHERE datetime BETWEEN $from AND $to
ORDER BY datetime
```

### Template Variables

You can create template variables using SWQL queries:

```sql
SELECT Caption as __text, NodeID as __value FROM Orion.Nodes ORDER BY Caption
```

## Troubleshooting

If you experience issues:

1. Check Grafana server logs
2. Verify plugin files are correctly installed
3. Confirm the plugin is allowed to load (check `allow_loading_unsigned_plugins` setting)
4. Ensure your SolarWinds server is accessible from Grafana
5. Verify authentication credentials are correct

## Building from Source

Prerequisites:
- Node.js 14+
- npm

Build steps:
1. Clone the repository
2. Install dependencies: `npm install`
3. Build the plugin: `bash build-plugin.sh`
4. The plugin ZIP will be created in the project directory

Note: The build script has been updated to fix webpack configuration issues. If you encounter any build problems, please ensure you're using the latest version of the repository.

## License

Apache-2.0