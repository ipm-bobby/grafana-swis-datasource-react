// src/datasource.ts

import { DataSourceApi, DataQueryRequest, DataQueryResponse, AnnotationQueryRequest } from '@grafana/data';
import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';
import _ from 'lodash';

import { SWISQuery, SWISDataSourceOptions, SwisDataSourceInstanceSettings } from './types';

export class SwisDataSource extends DataSourceApi<SWISQuery, SWISDataSourceOptions> {
  private url: string;
  private basicAuth: boolean;
  private user?: string;
  private password?: string;
  private timeout?: number;
  private headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  constructor(instanceSettings: SwisDataSourceInstanceSettings) {
    super(instanceSettings);

    // Base URL (o fallback su instanceSettings.url se non definito)
    this.url = instanceSettings.jsonData.baseUrl || instanceSettings.url || '';

    // BasicAuth
    this.basicAuth = !!instanceSettings.jsonData.basicAuth;

    // Username e password (secure)
    this.user = instanceSettings.jsonData.user;
    this.password = instanceSettings.jsonData?.password;

    console.log(this.user);
    console.log(instanceSettings.jsonData?.password);

    // Timeout (in secondi)
    this.timeout = instanceSettings.jsonData.timeout;

    // Se BasicAuth è abilitata e abbiamo user + password, crea l'Authorization header
    if (this.basicAuth && this.user && this.password) {
      const encoded = btoa(`${this.user}:${this.password}`);
      this.headers['Authorization'] = `Basic ${encoded}`;
    }
  }

  /**
   * Testa la connessione al servizio SWIS
   */
  async testDatasource() {
    try {
      const response = await this.doRequest({
        url: `${this.url}/Query?query=SELECT Description FROM System.NullEntity`,
        method: 'GET',
      });
      if (response.status === 200) {
        return { status: 'success', message: 'Data source is working :)' };
      }
    } catch (err: any) {
      return { status: 'error', message: err?.message ?? 'Error' };
    }
    return { status: 'error', message: 'Unknown error' };
  }

  /**
   * query: metodo principale di Grafana per ottenere i dati
   */
  async query(request: DataQueryRequest<SWISQuery>): Promise<DataQueryResponse> {
    // Filtra le query "non nascoste"
    const queries = _.filter(request.targets, (t) => !t.hide).map((t) => ({
      refId: t.refId,
      intervalMs: request.intervalMs,
      maxDataPoints: request.maxDataPoints,
      rawSql: t.rawSql,
      format: t.format,
    }));

    // Se non ci sono query, ritorno un array vuoto
    if (queries.length === 0) {
      return { data: [] };
    }

    // Eseguo in parallelo tutte le query
    const results = await Promise.all(queries.map((q) => this.doQuery(q, request)));

    // Unisco i risultati
    let data: any[] = [];
    for (const r of results) {
      data = data.concat(r);
    }

    return { data };
  }

  /**
   * doQuery: logica singola di query
   */
  private async doQuery(query: SWISQuery, request: DataQueryRequest<SWISQuery>) {
    // Rimpiazza $from e $to
    let swql = query.rawSql || '';
    swql = swql.replace(/\$from/g, '@timeFrom').replace(/\$to/g, '@timeTo');

    // Interpola le variabili (es. $myVar)
    swql = getTemplateSrv().replace(swql, request.scopedVars, (value: any) =>
      typeof value === 'string' ? `'${value.replace(/'/g, `''`)}'` : value
    );
    query.rawSql = swql;

    // Parametri
    const param = {
      query: this.resolveMacros(swql, request),
      parameters: {
        timeFrom: request.range?.from.toISOString() || '',
        timeTo: request.range?.to.toISOString() || '',
        granularity: Math.max(Math.floor((query.intervalMs ?? 1000) / 1000), 1),
      },
    };

    // 1) Ottieni schema (WITH SCHEMAONLY)
    const schemaResp = await this.doRequest({
      url: `${this.url}/Query`,
      method: 'POST',
      data: {
        query: param.query + ' WITH SCHEMAONLY',
        parameters: param.parameters,
      },
    });
    this.processMetadata(schemaResp, query);

    // 2) Esegui la query vera
    const realResp = await this.doRequest({
      url: `${this.url}/Query`,
      method: 'POST',
      data: param,
    });
    return this.processQueryResult(realResp, query);
  }

  /**
   * Sostituisce macro (es. downsample(...))
   */
  private resolveMacros(rawSql: string, request: DataQueryRequest<SWISQuery>): string {
    const r = /downsample\(([^\)]*)\)/g;
    rawSql = rawSql.replace(r, (_, group) => {
      return `ADDSECOND(FLOOR(SecondDiff('1970-01-01T00:00:00', ${group})/@granularity+1)*@granularity, '1970-01-01T00:00:00')`;
    });

    if (rawSql.indexOf('GRANULARITY') === -1 && rawSql.indexOf('downsample') !== -1) {
      rawSql += ` WITH GRANULARITY '${this.timeSpan(request.intervalMs || 1000)}'`;
    }

    return rawSql;
  }

  /**
   * timeSpan: converte ms in dd.hh:mm:ss.ms
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
   * processMetadata: estrae info su timeColumnIndex, metricIndex, ecc.
   */
  private processMetadata(res: any, query: SWISQuery) {
    const columns: any[] = [];
    const metadata = {
      timeColumnIndex: -1,
      metricIndex: -1,
      columns,
    };

    for (const row of res.data.results) {
      if (row.DataType.includes('String')) {
        metadata.metricIndex = row.Index;
      } else if (row.DataType.includes('DateTime')) {
        metadata.timeColumnIndex = row.Index;
      }
      columns.push({
        index: row.Index,
        name: row.Alias,
        type: row.DataType,
      });
    }

    // Se time_series, controlliamo almeno 2 colonne e presenza di una colonna datetime
    if (query.format === 'time_series') {
      if (columns.length < 2) {
        throw new Error('At least 2 columns required for time_series');
      }
      if (metadata.timeColumnIndex === -1) {
        throw new Error('Missing DateTime column needed for time_series');
      }
    }

    query.metadata = metadata;
  }

  /**
   * processQueryResult: smista tra table, time_series, annotation, search
   */
  private processQueryResult(res: any, query: SWISQuery) {
    switch (query.format) {
      case 'table':
        return this.processQueryResultTable(res, query);
      case 'time_series':
        return this.processQueryResultMetric(res, query);
      case 'annotation':
        return this.processQueryResultAnnotation(res, query);
      case 'search':
        return this.processQueryResultSearch(res, query);
      default:
        throw new Error(`Unknown query format [${query.format}]`);
    }
  }

  /**
   * Table
   */
  private processQueryResultTable(res: any, query: SWISQuery) {
    const metadata = query.metadata;
    if (!metadata) {
      return [];
    }
    return [
      {
        columns: metadata.columns.map((c: any) => ({
          text: c.name,
          type: c.type,
        })),
        rows: res.data.results.map((rowData: any) => Object.keys(rowData).map((k) => rowData[k])),
        type: 'table',
      },
    ];
  }

  /**
   * Time series
   */
  private processQueryResultMetric(res: any, query: SWISQuery) {
    const metadata = query.metadata;
    if (!metadata) {
      return [];
    }
    const seriesMap: Record<string, any> = {};

    for (const rowData of res.data.results) {
      const row = Object.keys(rowData).map((k) => rowData[k]);
      const date = this.correctTime(row[metadata.timeColumnIndex]);

      for (let i = 0; i < metadata.columns.length; i++) {
        if (i === metadata.timeColumnIndex || i === metadata.metricIndex) {
          continue;
        }

        let seriesName = '';
        if (metadata.metricIndex !== -1) {
          seriesName = row[metadata.metricIndex];
        }

        if (metadata.columns.length > 3 || !seriesName) {
          if (seriesName) {
            seriesName += '-';
          }
          seriesName += metadata.columns[i].name;
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

  /**
   * Annotation
   */
  private processQueryResultAnnotation(res: any, query: SWISQuery) {
    const metadata = query.metadata;
    if (!metadata) {
      return [];
    }
    let timeIndex = metadata.columns.findIndex((c: any) => c.name === 'time');
    if (timeIndex === -1) {
      timeIndex = metadata.timeColumnIndex;
    }
    let textIndex = metadata.columns.findIndex((c: any) => c.name === 'text');
    if (textIndex === -1) {
      textIndex = metadata.metricIndex;
    }
    const tagsIndex = metadata.columns.findIndex((c: any) => c.name === 'tags');

    if (timeIndex === -1) {
      throw new Error('Missing DateTime column or named "time" for annotation');
    }

    return res.data.results
      .map((rowData: any) => Object.keys(rowData).map((k) => rowData[k]))
      .map((row: any) => ({
        annotation: (query as any).options?.annotation,
        time: this.correctTime(row[timeIndex]),
        text: row[textIndex],
        tags: row[tagsIndex] ? row[tagsIndex].trim().split(/\s*,\s*/) : [],
      }));
  }

  /**
   * Search
   */
  private processQueryResultSearch(res: any, query: SWISQuery) {
    const metadata = query.metadata;
    if (!metadata) {
      return [];
    }
    const textIndex = metadata.columns.findIndex((c: any) => c.name === '__text');
    const valueIndex = metadata.columns.findIndex((c: any) => c.name === '__value');

    if (metadata.columns.length === 2 && textIndex !== -1 && valueIndex !== -1) {
      return res.data.results
        .map((rowData: any) => Object.keys(rowData).map((k) => rowData[k]))
        .map((row: any) => ({
          text: row[textIndex],
          value: row[valueIndex],
        }));
    }
    throw new Error('Specify __text and __value column for search');
  }

  /**
   * Corregge i formati tempo che hanno +3:00
   */
  private correctTime(dtString: string) {
    const dtZoneIndex = dtString.indexOf('+');
    if (dtZoneIndex !== -1) {
      dtString = dtString.substring(0, dtZoneIndex) + 'Z';
    } else if (!dtString.endsWith('Z')) {
      dtString += 'Z';
    }
    return Date.parse(dtString);
  }

  /**
   * Annotation query (opzionale)
   */
  async annotationQuery?(request: AnnotationQueryRequest<SWISQuery>) {
    if (!request.annotation.query) {
      throw new Error('Missing annotation query');
    }
    const query: SWISQuery = {
      rawSql: request.annotation.query,
      format: 'annotation',
      refId: 'annotation',
    };
    return this.doQuery(query, {
      ...request,
      intervalMs: 0,
      maxDataPoints: 0,
      targets: [],
      scopedVars: {},
    } as any);
  }

  /**
   * metricFindQuery: se usi template variable
   */
  async metricFindQuery?(rawSql: string) {
    const query: SWISQuery = {
      rawSql,
      format: 'search',
      refId: 'search',
    };
    const request = {
      intervalMs: 0,
      range: { from: '', to: '' },
      scopedVars: {},
      targets: [],
      maxDataPoints: 0,
    } as any;

    return this.doQuery(query, request);
  }

  /**
   * doRequest: effettua la chiamata con getBackendSrv().datasourceRequest
   */
  private async doRequest(options: any) {
    options.headers = this.headers;
    // Converte timeout (sec) in ms
    if (this.timeout && this.timeout > 0) {
      options.timeout = this.timeout * 1000;
    }

    try {
      return await getBackendSrv().datasourceRequest(options);
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
