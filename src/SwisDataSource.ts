// SwisDataSource.ts

import {
  DataSourceApi,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  AnnotationQueryRequest,
  ScopedVars,
} from '@grafana/data';

import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';
import { SWISQuery, SWISDataSourceOptions } from './types';

import _ from 'lodash';

/**
 * Classe Data Source stile React/TypeScript
 */
export class SwisDataSource extends DataSourceApi<SWISQuery, SWISDataSourceOptions> {
  private baseUrl?: string;
  private withCredentials?: boolean;
  private headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  constructor(instanceSettings: DataSourceInstanceSettings<SWISDataSourceOptions>) {
    super(instanceSettings);

    // Recupera le opzioni
    this.baseUrl = instanceSettings.jsonData.baseUrl || instanceSettings.url || '';
    this.withCredentials = instanceSettings.withCredentials;

    // Se c’è un basicAuth configurato
    if (typeof instanceSettings.basicAuth === 'string' && instanceSettings.basicAuth.length > 0) {
      this.headers['Authorization'] = instanceSettings.basicAuth;
    }
  }

  /**
   * Test della connessione
   */
  async testDatasource() {
    try {
      const url = `${this.baseUrl}/Query?query=SELECT Description FROM System.NullEntity`;
      const response = await this.doRequest({ url, method: 'GET' });
      if (response.status === 200) {
        return { status: 'success', message: 'Data source is working :)', title: 'Success' };
      }
      throw new Error('Unexpected status code ' + response.status);
    } catch (err: any) {
      return { status: 'error', message: err?.message ?? err };
    }
  }

  /**
   * Metodo principale che Grafana chiama per ottenere i dati
   */
  async query(request: DataQueryRequest<SWISQuery>): Promise<DataQueryResponse> {
    // Filtra le query non nascoste
    const queries = request.targets
      .filter((t) => !t.hide)
      .map((t) => ({
        refId: t.refId,
        rawSql: t.rawSql,
        format: t.format,
        maxDataPoints: request.maxDataPoints,
        intervalMs: request.intervalMs,
      }));

    if (queries.length === 0) {
      return { data: [] };
    }

    // Esegui in parallelo tutte le query
    const results = await Promise.all(queries.map((q) => this.doQuery(q, request)));
    // Unisci tutti i risultati in un unico array "data"
    let data: any[] = [];
    for (const r of results) {
      data = data.concat(r);
    }

    return { data };
  }

  /**
   * Gestisce la query singola
   */
  private async doQuery(query: any, request: DataQueryRequest<SWISQuery>) {
    // Esempio: swql = query.rawSql, rimpiazza $from, $to
    let swql = query.rawSql || '';
    swql = swql.replace(/\$from/g, '@timeFrom').replace(/\$to/g, '@timeTo');

    // Interpola le variabili (come facevi con templateSrv)
    const scopedVars = request.scopedVars || {};
    swql = this.templateReplace(swql, scopedVars);

    // Prepara i parametri
    const param = {
      query: this.resolveMacros(swql, request),
      parameters: {
        timeFrom: request.range?.from.toISOString() || '',
        timeTo: request.range?.to.toISOString() || '',
        granularity: Math.max(Math.floor((query.intervalMs || 1000) / 1000), 1),
      },
    };

    // 1) Chiediamo lo schema
    const schemaResponse = await this.doRequest({
      url: `${this.baseUrl}/Query`,
      method: 'POST',
      data: {
        query: param.query + ' WITH SCHEMAONLY',
        parameters: param.parameters,
      },
    });

    // 2) processMetadata
    const metadata = this.processMetadata(schemaResponse, query.format);

    // 3) Esegui la query vera e propria
    const queryResponse = await this.doRequest({
      url: `${this.baseUrl}/Query`,
      method: 'POST',
      data: param,
    });

    // 4) processQueryResult
    return this.processQueryResult(queryResponse, query, metadata, request);
  }

  /**
   * Sostituzione variabili con getTemplateSrv()
   */
  private templateReplace(query: string, scopedVars: ScopedVars): string {
    // Usa la callback di interpolazione che avevi in Angular, riscritta in TS
    const interpolate = (value: any, variable: any) => {
      if (typeof value === 'string') {
        if (variable.multi || variable.includeAll) {
          return `'${value.replace(/'/g, `''`)}'`;
        } else {
          return value;
        }
      }
      if (typeof value === 'number') {
        return value;
      }
      return value;
    };
    return getTemplateSrv().replace(query, scopedVars, interpolate);
  }

  /**
   * Esempio di macro "downsample(...)"
   */
  private resolveMacros(rawSql: string, request: DataQueryRequest<SWISQuery>): string {
    // Rimpiazza la macro downsample(...)
    const r = /downsample\(([^\)]*)*\)/g;
    let newSql = rawSql.replace(r, (match, group) => {
      return `ADDSECOND(FLOOR(SecondDiff('1970-01-01T00:00:00', ${group})/@granularity+1)*@granularity, '1970-01-01T00:00:00')`;
    });

    // Aggiunge GRANULARITY se serve
    if (newSql.indexOf('GRANULARITY') === -1 && rawSql.indexOf('downsample') !== -1) {
      newSql += ` WITH GRANULARITY '${this.timeSpan(request.intervalMs || 1000)}'`;
    }

    return newSql;
  }

  /**
   * Converte intervalMs in un formato dd.hh:mm:ss.ms
   */
  private timeSpan(ms: number) {
    const obj = {
      ms: ms % 1000,
      ss: Math.floor(ms / 1000) % 60,
      mm: Math.floor(ms / (1000 * 60)) % 60,
      hh: Math.floor(ms / (1000 * 60 * 60)) % 24,
      dd: Math.floor(ms / (1000 * 60 * 60 * 24)),
    };
    return `${obj.dd}.${obj.hh}:${obj.mm}:${obj.ss}.${obj.ms}`;
  }

  /**
   * Elabora le informazioni di schema (metadati)
   */
  private processMetadata(res: any, format: string) {
    const columns: any[] = [];
    let timeColumnIndex = -1;
    let metricIndex = -1;

    for (const row of res.data.results) {
      if (row.DataType.indexOf('String') !== -1) {
        metricIndex = row.Index;
      } else if (row.DataType.indexOf('DateTime') !== -1) {
        timeColumnIndex = row.Index;
      }
      columns.push({
        index: row.Index,
        name: row.Alias,
        type: this.translateType(row.DataType),
      });
    }

    // Per time_series servono almeno 2 colonne e una colonna di tipo data
    if (format === 'time_series') {
      if (columns.length < 2) {
        throw new Error('There has to be at least 2 columns defined for Series');
      }
      if (timeColumnIndex === -1) {
        throw new Error('Missing DateTime column which is needed for Series');
      }
    }

    return {
      columns,
      timeColumnIndex,
      metricIndex,
    };
  }

  private translateType(type: string) {
    // TODO: se vuoi mappare in base a definizioni di Grafana (number, string, datetime, ecc.)
    return type;
  }

  /**
   * Elabora il risultato della query in base al formato
   */
  private processQueryResult(res: any, query: any, metadata: any, request: DataQueryRequest<SWISQuery>) {
    switch (query.format) {
      case 'table':
        return [this.processQueryResultTable(res, metadata)];
      case 'time_series':
        return this.processQueryResultMetric(res, query, metadata);
      case 'annotation':
        return this.processQueryResultAnnotation(res, query, metadata, request);
      case 'search':
        return this.processQueryResultSearch(res, metadata);
      default:
        throw new Error(`Unknown query format [${query.format}]`);
    }
  }

  private processQueryResultTable(res: any, metadata: any) {
    return {
      columns: metadata.columns.map((c: any) => ({ text: c.name, type: c.type })),
      rows: res.data.results.map((rowData: any) => Object.keys(rowData).map((k) => rowData[k])),
      type: 'table',
    };
  }

  private processQueryResultMetric(res: any, query: any, metadata: any) {
    const { timeColumnIndex, metricIndex, columns } = metadata;
    const seriesMap: Record<string, any> = {};

    for (const rowData of res.data.results) {
      const row = Object.keys(rowData).map((k) => rowData[k]);
      const date = this.correctTime(row[timeColumnIndex]);

      for (let i = 0; i < columns.length; i++) {
        if (i === timeColumnIndex || i === metricIndex) {
          continue;
        }

        let seriesName = '';

        if (metricIndex !== -1) {
          seriesName = row[metricIndex];
        }
        // Se ci sono più colonne di 3, concateno nome colonna
        if (columns.length > 3 || seriesName === '') {
          if (seriesName !== '') {
            seriesName += '-';
          }
          seriesName += columns[i].name;
        }

        if (!seriesMap[seriesName]) {
          seriesMap[seriesName] = {
            target: seriesName,
            datapoints: [],
            refId: query.refId,
          };
        }

        const value = row[i];
        seriesMap[seriesName].datapoints.push([value, date]);
      }
    }

    return Object.keys(seriesMap).map((k) => seriesMap[k]);
  }

  private processQueryResultAnnotation(res: any, query: any, metadata: any, request: DataQueryRequest<SWISQuery>) {
    const { columns, timeColumnIndex } = metadata;
    // Trovo l'indice delle colonne "time", "text", "tags"
    let tIndex = columns.findIndex((c: any) => c.name === 'time');
    if (tIndex === -1) {
      tIndex = timeColumnIndex;
    }
    if (tIndex === -1) {
      throw new Error('Missing mandatory DateTime column (or named time)');
    }
    let textIndex = columns.findIndex((c: any) => c.name === 'text');
    if (textIndex === -1) {
      textIndex = metadata.metricIndex;
    }
    const tagsIndex = columns.findIndex((c: any) => c.name === 'tags');

    const list = res.data.results
      .map((rowData: any) => Object.keys(rowData).map((k) => rowData[k]))
      .map((row: any) => {
        const textVal = row[textIndex];
        return {
          annotation: query.options.annotation, // o query.options.annotation
          time: this.correctTime(row[tIndex]),
          text: textVal,
          tags: row[tagsIndex] ? row[tagsIndex].trim().split(/\s*,\s*/) : [],
        };
      });

    return list;
  }

  private processQueryResultSearch(res: any, metadata: any) {
    const textIndex = metadata.columns.findIndex((c: any) => c.name === '__text');
    const valueIndex = metadata.columns.findIndex((c: any) => c.name === '__value');
    if (metadata.columns.length === 2 && textIndex !== -1 && valueIndex !== -1) {
      return res.data.results
        .map((rowData: any) => Object.keys(rowData).map((k) => rowData[k]))
        .map((row: any) => {
          return {
            text: row[textIndex],
            value: row[valueIndex],
          };
        });
    } else {
      throw new Error('Specify __text and __value column for search');
    }
  }

  private correctTime(dtString: string) {
    // Gestisce formati con fuso orario (+3:00)
    const dtZoneIndex = dtString.indexOf('+');
    if (dtZoneIndex !== -1) {
      dtString = dtString.substr(0, dtZoneIndex) + 'Z';
    } else if (dtString.lastIndexOf('Z') !== dtString.length - 1) {
      dtString += 'Z';
    }
    return Date.parse(dtString);
  }

  /**
   * Supporto per annotationQuery (opzionale)
   */
  async annotationQuery?(request: AnnotationQueryRequest<SWISQuery>): Promise<any> {
    if (!request.annotation.query) {
      throw new Error('Query missing in annotation definition');
    }
    const queryObj = {
      rawSql: request.annotation.query,
      format: 'annotation',
      // ... eventuali altri campi
    };
    // Riutilizziamo doQuery
    const data = await this.doQuery(queryObj, {
      intervalMs: 0,
      range: request.range,
      scopedVars: {},
      targets: [],
      maxDataPoints: 0,
      // ...altri campi se necessari
    } as any);

    return data;
  }

  /**
   * Supporto per "Metric Find Query" (opzionale)
   */
  async metricFindQuery?(query: string) {
    const queryObj = {
      rawSql: query,
      format: 'search',
    };
    const data = await this.doQuery(queryObj, {
      intervalMs: 0,
      range: { from: '', to: '' } as any,
      scopedVars: {},
      targets: [],
      maxDataPoints: 0,
    } as any);
    return data;
  }

  /**
   * Esegue la richiesta HTTP
   */
  private async doRequest(options: any) {
    const backendSrv = getBackendSrv();
    options.withCredentials = this.withCredentials;
    options.headers = this.headers;
    try {
      const res = await backendSrv.datasourceRequest(options);
      return res;
    } catch (err: any) {
      console.error(err);
      if (err.status === 404) {
        throw new Error('SWIS service is not available (404)');
      }
      if (err.data?.Message) {
        throw new Error(err.data.Message);
      }
      throw err;
    }
  }
}
