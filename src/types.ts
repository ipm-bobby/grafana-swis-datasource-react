// types.ts (oppure in cima a datasource.ts)
import { DataSourceJsonData, DataQuery } from '@grafana/data';

/**
 * SWISQuery: descrive la singola query
 */
export interface SWISQuery extends DataQuery {
  /**
   * SWQL o query definita dall’utente
   */
  rawSql?: string;

  /**
   * Formato: 'time_series', 'table', 'search', 'annotation', ecc.
   */
  format?: string;

  /**
   * Metadati che popoliamo dopo uno schema request (opzionale)
   */
  metadata?: any;
}

/**
 * Opzioni di configurazione del data source (baseUrl, ecc.)
 */
export interface SWISDataSourceOptions extends DataSourceJsonData {
  baseUrl?: string;
}

// types.ts
export interface SWISSecureJsonData {
  password?: string;
  apiKey?: string;
  // qualunque campo "segreto" ti serva
}
