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
  rawSql: `SELECT TOP 5
     LastSync, 
     Caption,
     CPULoad, 
     ResponseTime 
FROM
     Orion.Nodes`
};

export interface SwisDataSourceOptions extends DataSourceJsonData {
  url?: string;
}

export interface SwisSecureJsonData {
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