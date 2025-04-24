# Grafana SolarWinds SWIS DataSource

DataSource plugin for SolarWinds via SWIS HTTP REST endpoint. This is a React version of the plugin created to support Grafana 10+ which no longer supports AngularJS plugins.

## Features

- **Connect to SolarWinds**: Connect to SolarWinds monitoring using the SWIS (SolarWinds Information Service) HTTP REST endpoint
- **Write SWQL Queries**: Use SolarWinds Query Language (SWQL) to query your SolarWinds data
- **Time Series & Table Formats**: Display data as time series graphs or tables
- **Template Variables**: Support for Grafana template variables for dynamic dashboards
- **Annotations**: Create annotations from SolarWinds data

## Configuration

1. Add a new SolarWinds SWIS datasource in Grafana
2. Set the URL to the SWIS endpoint (default: `https://localhost:17778/SolarWinds/InformationService/v3/Json/`)
3. Configure authentication (basic auth)
4. Save and test the connection

## Query Editor

The query editor supports writing SWQL queries with the following features:

- **Format**: Choose between Time Series and Table formats
- **Time Range Variables**: Use `$from` and `$to` to inject Grafana time range into your queries
- **Downsampling**: Use the `downsample()` function for time-series aggregation

### Example Queries

#### Time Series Query
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

#### Template Variable Query
```sql
SELECT Caption as __text, NodeID as __value FROM Orion.Nodes ORDER BY Caption
```

## Annotations

For annotations, write a SWQL query that returns:
- A `time` column (or any DateTime field)
- A `text` column for annotation text
- An optional `tags` column (comma-separated tags)

## License

Apache License 2.0