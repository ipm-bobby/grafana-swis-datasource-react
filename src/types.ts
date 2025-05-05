import { DataQuery, DataSourceJsonData } from '@grafana/data';

export interface SwisQuery extends DataQuery {
  format: string;
  rawSql: string;
  refId: string;
}

export interface QueryMeta {
  sql: string;
}

export const defaultQuery: Partial<SwisQuery> = {
  format: 'time_series',
  rawSql: '' // Empty by default so users can enter their own query
};

// Helper function to create default table query
export const getDefaultTableQuery = (): Partial<SwisQuery> => {
  return {
    format: 'table',
    rawSql: `SELECT
  n.Caption,
  n.IP_Address,
  n.Status,
  n.DetailsUrl
FROM Orion.Nodes n
ORDER BY n.Caption`
  };
};

export interface SwisDataSourceOptions extends DataSourceJsonData {
  url?: string;
  // username removed as we're using only HTTP Basic Auth
}

export interface SwisSecureJsonData {
  // Using only HTTP Basic Auth now
  basicAuth?: string;
}

export interface Column {
  index: number;
  name: string;
  type: string;
}

export interface QueryMetadata {
  timeColumnIndex: number;
  metricIndex: number;
  columns: Column[];
}