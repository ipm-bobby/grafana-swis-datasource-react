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
   - The URL format should be: `https://server:port/SolarWinds/InformationService/v3/Json/`
   - Do not include "Query" in the URL - it will be added automatically
   - Make sure the URL ends with a forward slash `/`

3. Set the appropriate Access mode:
   - **Server** (recommended): All requests are made through the Grafana server
   - **Browser**: Requests are made directly from the browser (may have CORS issues)

4. Configure authentication:
   
   ### HTTP Basic Authentication
   - Enable Basic Auth in the HTTP settings section
   - Enter your SolarWinds credentials (username and password)
   
   ### Using API Keys
   If your SolarWinds instance is configured to use API keys:
   - Select the appropriate auth method (e.g., "No Auth" or "API Key")
   - Configure the API key details as required

5. Enable "Skip TLS Verify" if you are using a self-signed certificate
6. Click "Save & Test" to verify the connection

### Important Connection Tips

1. **Access Mode**: Always try "Server" access mode first
2. **URL Format**: The correct format is `https://server:port/SolarWinds/InformationService/v3/Json/`
3. **Trailing Slash**: Include the trailing slash at the end of the URL
4. **SSL/TLS**: Enable "Skip TLS Verify" for self-signed certificates

### Troubleshooting Common Issues

#### Authentication Errors (401, 403)
- Verify the username and password are correct
- Ensure the account has appropriate permissions on the SolarWinds server
- Try using Basic Auth in the HTTP settings section

#### Bad Request Errors (400)
- Check the URL formatting 
- Verify that the SWIS service accepts the query format
- Make sure you're using "Server" access mode
- Check if the SWIS service requires specific headers or parameters

#### Connection Issues
- Verify the server is accessible from Grafana
- Check for firewalls blocking the connection
- Make sure the SWIS service is running
- Try using the server's IP address instead of hostname

#### CORS Issues
- Switch to "Server" access mode which avoids CORS issues
- If you must use "Browser" mode, ensure the SWIS server has CORS headers enabled

For detailed error information, check the Grafana server logs which now contain extensive debugging information.

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

1. Check Grafana server logs for specific error messages
2. Verify plugin files are correctly installed
3. Confirm the plugin is allowed to load (check `allow_loading_unsigned_plugins` setting)
4. Ensure your SolarWinds server is accessible from Grafana
5. Verify authentication credentials are correct
6. Make sure the URL format is correct (`https://server:port/SolarWinds/InformationService/v3/Json/`)
7. If using HTTPS, verify TLS/SSL certificate settings (consider enabling "Skip TLS Verify" for testing)
8. Check for firewall or networking issues that may be blocking connections

### Common Error Messages and Solutions

- **403 Forbidden**: Authentication failed
  - Check username and password
  - Verify account permissions in SolarWinds
  - Try using a different authentication method

- **404 Not Found**: SWIS service not found
  - Verify the URL is correct
  - Ensure the SolarWinds service is running
  - Check if the server is accessible from Grafana

- **400 Bad Request**: Invalid request format
  - Check URL format (should be `https://server:port/SolarWinds/InformationService/v3/Json/`)
  - Ensure the URL includes the protocol (http:// or https://)
  - Check that the path structure includes `/SolarWinds/InformationService/v3/Json/`
  - Verify that "Query" is not included in the base URL
  - Set Access Mode to "Server" instead of "Browser"
  - Check if the query syntax is correct
  
- **400 Bad Request: Invalid SWIS uri**: URL Format Error
  - This specific error indicates a problem with the SWIS URL format
  - Make sure your URL follows exactly: `https://server:port/SolarWinds/InformationService/v3/Json/`
  - Common issues include:
    - Missing protocol (https:// or http://)
    - Incorrect path structure
    - Missing port number if not using default ports
  - Example of correct URL: `https://mysolarwinds.example.com:17778/SolarWinds/InformationService/v3/Json/`

- **CORS Errors**: Cross-Origin Resource Sharing issues
  - Set Access Mode to "Server" which bypasses CORS restrictions
  - If using "Browser" mode, ensure the SolarWinds server has CORS headers enabled

- **SSL/TLS Errors**: Certificate validation issues
  - Enable "Skip TLS Verify" in the datasource settings
  - Use a valid SSL certificate on the SolarWinds server
  - Try using HTTP instead of HTTPS if allowed

- **Unknown error**: Generic error message
  - Check Grafana server logs for detailed error information
  - Look for specific error codes or messages in the logs
  - Try the configuration with different settings

### Reading Grafana Logs

The plugin includes extensive logging. To check the logs:

1. Access your Grafana server logs (typically `/var/log/grafana/grafana.log`)
2. Look for entries containing `solarwinds-swis-react-datasource`
3. Pay attention to request/response details and error messages
4. The logs will include detailed information about:
   - Request URLs and parameters
   - Authentication details (without sensitive data)
   - Error codes and messages
   - Troubleshooting suggestions

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