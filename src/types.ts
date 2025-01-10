// src/types.ts

import { DataSourceJsonData, DataQuery, DataSourceInstanceSettings } from '@grafana/data';

/**
 * Descrive i campi di una singola query (ex: rawSql, format, ecc.)
 */
export interface SWISQuery extends DataQuery {
  rawSql?: string;
  format?: 'time_series' | 'table' | 'annotation' | 'search';
  metadata?: any;
  intervalMs?: any;
}

/**
 * Opzioni non-segrete (jsonData)
 */
export interface SWISDataSourceOptions extends DataSourceJsonData {
  baseUrl?: string;
  timeout?: number;
  basicAuth?: boolean;
  user?: string;
  password?: string;
}

/**
 * Opzioni segrete (secureJsonData)
 */
export interface SWISSecureJsonData {
  password?: string;
}

/**
 * Estensione di DataSourceInstanceSettings per aggiungere secureJsonData.
 */
export interface SwisDataSourceInstanceSettings extends DataSourceInstanceSettings<SWISDataSourceOptions> {
  secureJsonData?: SWISSecureJsonData;
}
