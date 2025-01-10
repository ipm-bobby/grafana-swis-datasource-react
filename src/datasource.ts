// datasource.ts
import {
  DataSourceApi,
  DataSourceInstanceSettings,
  DataQueryRequest,
  DataQueryResponse,
  AnnotationQueryRequest,
} from '@grafana/data';

import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';
import _ from 'lodash';

import { SWISQuery, SWISDataSourceOptions } from './types';

export class SwisDataSource extends DataSourceApi<SWISQuery, SWISDataSourceOptions> {
  private url: string;
  private withCredentials: boolean;
  private headers: Record<string, string>;

  constructor(instanceSettings: DataSourceInstanceSettings<SWISDataSourceOptions>) {
    super(instanceSettings);

    // Imposta la URL (o baseUrl) dai parametri di configurazione
    this.url = instanceSettings.jsonData?.baseUrl || instanceSettings.url || '';
    this.withCredentials = instanceSettings.withCredentials ?? false;

    this.headers = { 'Content-Type': 'application/json' };
    if (typeof instanceSettings.basicAuth === 'string' && instanceSettings.basicAuth.length > 0) {
      this.headers['Authorization'] = instanceSettings.basicAuth;
    }
  }

  /**
   * testDatasource: verifica la connessione al servizio SWIS
   */
  async testDatasource() {
    try {
      const response = await this.doRequest({
        url: this.url + '/Query?query=SELECT Description FROM System.NullEntity',
        method: 'GET',
      });
      if (response.status === 200) {
        return { status: 'success', message: 'Data source is working :)', title: 'Success' };
      }
    } catch (err: any) {
      return { status: 'error', message: err?.message ?? 'Error', title: 'Error' };
    }
    return { status: 'error', message: 'Unknown error', title: 'Error' };
  }

  /**
   * query: metodo principale di Grafana per ottenere i dati
   */
  async query(options: DataQueryRequest<SWISQuery>): Promise<DataQueryResponse> {
    // Filtro le query "non nascoste"
    const queries = _.filter(options.targets, (t) => !t.hide).map((item) => {
      return {
        refId: item.refId,
        intervalMs: options.intervalMs,
        maxDataPoints: options.maxDataPoints,
        rawSql: item.rawSql,
        format: item.format,
      } as SWISQuery;
    });

    // Se non ci sono query, ritorno un array vuoto
    if (queries.length === 0) {
      return { data: [] };
    }

    // Eseguo in parallelo tutte le query
    const resultsPromises = queries.map((q) => this.doQuery(q, options));
    const values = await Promise.all(resultsPromises);

    // Unisco tutti i risultati in un unico array
    let data: any[] = [];
    for (const val of values) {
      data = data.concat(val);
    }
    return { data };
  }

  /**
   * doQuery: logica singola di query (equivalente dell'Angular doQuery)
   */
  private async doQuery(query: SWISQuery, options: DataQueryRequest<SWISQuery>) {
    // Esegui i replace di $from e $to
    let swql = query.rawSql || '';
    swql = swql.replace(/\$from/g, '@timeFrom').replace(/\$to/g, '@timeTo');

    // Interpola variabili con getTemplateSrv()
    swql = getTemplateSrv().replace(swql, options.scopedVars, (value: any, variable: any) =>
      this.interpolateVariable(value, variable)
    );

    query.rawSql = swql;

    // Prepara parametri
    const param = {
      query: this.resolveMacros(query.rawSql, options),
      parameters: {
        timeFrom: options.range?.from.toISOString() || '',
        timeTo: options.range?.to.toISOString() || '',
        granularity: Math.max(Math.floor((options.intervalMs ?? 1000) / 1000), 1),
      },
    };

    // 1) Richiesta schema
    const schemaResp = await this.doRequest({
      url: this.url + '/Query',
      method: 'POST',
      data: {
        query: param.query + ' WITH SCHEMAONLY',
        parameters: param.parameters,
      },
    });

    // 2) processMetadata (popola query.metadata)
    this.processMetadata(schemaResp, query);

    // 3) Query vera e propria
    const queryResp = await this.doRequest({
      url: this.url + '/Query',
      method: 'POST',
      data: param,
    });

    // 4) processQueryResult
    return this.processQueryResult(queryResp, query);
  }

  /**
   * interpolateVariable: traduce le variabili "multi" e "single"
   */
  private interpolateVariable(value: any, variable: any) {
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
  }

  /**
   * resolveMacros: rimpiazza macro tipo downsample(...) e aggiunge WITH GRANULARITY
   */
  private resolveMacros(rawSql: string, options: DataQueryRequest<SWISQuery>): string {
    const r = /downsample\(([^\)]*)*\)/g;
    rawSql = rawSql.replace(r, (match, group) => {
      return `ADDSECOND(FLOOR(SecondDiff('1970-01-01T00:00:00', ${group})/@granularity+1)*@granularity, '1970-01-01T00:00:00')`;
    });

    if (rawSql.indexOf('GRANULARITY') === -1 && rawSql.indexOf('downsample') !== -1) {
      rawSql += ` WITH GRANULARITY '${this.timeSpan(options.intervalMs || 1000)}'`;
    }

    return rawSql;
  }

  /**
   * timeSpan: converte ms in formato dd.hh:mm:ss.ms
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
   * processMetadata: ricava info su timeColumnIndex, metricIndex, columns
   */
  private processMetadata(res: any, query: SWISQuery) {
    const columns: any[] = [];
    const metadata = {
      timeColumnIndex: -1,
      metricIndex: -1,
      columns: columns,
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
        type: this.translateType(row.DataType),
      });
    }

    // Se format è time_series, validazione
    if (query.format === 'time_series') {
      if (columns.length < 2) {
        throw new Error('There has to be at least 2 columns defined for Series');
      }
      if (metadata.timeColumnIndex === -1) {
        throw new Error('Missing DateTime column which is needed for Series');
      }
    }

    query.metadata = metadata;
  }

  /**
   * translateType: (se vuoi mappare tipi SWIS -> tipi grafana)
   */
  private translateType(type: string) {
    return type; // personalizza se necessario
  }

  /**
   * processQueryResult: smista tra table, time_series, annotation, search
   */
  private processQueryResult(res: any, query: SWISQuery) {
    if (!query.format) {
      throw new Error('Query format is not defined');
    }
    switch (query.format) {
      case 'table':
        return this.processQueryResultTable(res, query);
      case 'time_series':
        return this.processQueryResultMetric(res, query);
      case 'search':
        return this.processQueryResultSearch(res, query);
      case 'annotation':
        return this.processQueryResultAnnotation(res, query);
      default:
        throw new Error(`Unknown query format [${query.format}]`);
    }
  }

  private processQueryResultAnnotation(res: any, query: SWISQuery) {
    const metadata = query.metadata;
    if (!metadata) {
      return [];
    }
    let timeIndex = metadata.columns.findIndex((n: any) => n.name === 'time');
    if (timeIndex === -1) {
      timeIndex = metadata.timeColumnIndex;
    }
    let textIndex = metadata.columns.findIndex((n: any) => n.name === 'text');
    if (textIndex === -1) {
      textIndex = metadata.metricIndex;
    }
    const tagsIndex = metadata.columns.findIndex((n: any) => n.name === 'tags');

    if (timeIndex === -1) {
      // Se usavi `this.q.reject()`, ora generi un errore standard
      throw new Error('Missing mandatory DateTime column or named [time]');
    }

    const list = res.data.results
      .map((rowData: any) => Object.keys(rowData).map((k) => rowData[k]))
      .map((row: any) => {
        return {
          annotation: (query as any).options?.annotation, // se serve
          time: this.correctTime(row[timeIndex]),
          text: row[textIndex],
          tags: row[tagsIndex] ? row[tagsIndex].trim().split(/\s*,\s*/) : [],
        };
      });
    return list;
  }

  private processQueryResultSearch(res: any, query: SWISQuery) {
    const metadata = query.metadata;
    if (!metadata) {
      return [];
    }
    const textIndex = metadata.columns.findIndex((n: any) => n.name === '__text');
    const valueIndex = metadata.columns.findIndex((n: any) => n.name === '__value');

    // Se troviamo esattamente 2 colonne e i nomi combaciano con __text / __value
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
        type: query.format,
      },
    ];
  }

  private processQueryResultMetric(res: any, query: SWISQuery) {
    const metadata = query.metadata;
    if (!metadata) {
      return [];
    }
    const series: Record<string, any> = {};
    let currentSerie: any = null;

    for (const rowData of res.data.results) {
      const row = Object.keys(rowData).map((k) => rowData[k]);
      const date = this.correctTime(row[metadata.timeColumnIndex]);

      for (let i = 0; i < metadata.columns.length; i++) {
        if (i === metadata.timeColumnIndex || i === metadata.metricIndex) {
          continue;
        }

        let serieName = '';
        if (metadata.metricIndex !== -1) {
          serieName = row[metadata.metricIndex];
        }

        // se ci sono più di 3 colonne, concateno nome colonna
        if (metadata.columns.length > 3 || serieName === '') {
          if (serieName !== '') {
            serieName += '-';
          }
          serieName += metadata.columns[i].name;
        }

        if (!series[serieName]) {
          series[serieName] = {
            target: serieName,
            datapoints: [],
            refId: query.refId,
          };
        }
        currentSerie = series[serieName];
        const value = row[i];
        currentSerie.datapoints.push([value, date]);
      }
    }

    return Object.keys(series).map((k) => series[k]);
  }

  private correctTime(dtString: string) {
    // Gestisce formati es: 02:00:34.675+3:00
    const dtZoneIndex = dtString.indexOf('+');
    if (dtZoneIndex !== -1) {
      dtString = dtString.substring(0, dtZoneIndex) + 'Z';
    } else if (!dtString.endsWith('Z')) {
      dtString += 'Z';
    }
    return Date.parse(dtString);
  }

  /**
   * annotationQuery: se usi le annotation
   */
  async annotationQuery?(options: AnnotationQueryRequest<SWISQuery>) {
    if (!options.annotation.query) {
      throw new Error('Query missing in annotation definition');
    }

    const query: SWISQuery = {
      rawSql: options.annotation.query,
      format: 'annotation',
      refId: 'annotation',
      metadata: {},
    };
    // Sfrutto doQuery
    return await this.doQuery(query, {
      ...options,
      intervalMs: 0,
      maxDataPoints: 0,
      // range: opzionale
      targets: [],
      scopedVars: {},
    } as any);
  }

  /**
   * metricFindQuery: se usi le template variables
   */
  async metricFindQuery?(rawSql: string) {
    const query: SWISQuery = {
      rawSql,
      format: 'search',
      refId: 'search',
      metadata: {},
    };
    const options = {
      intervalMs: 0,
      range: { from: '', to: '' },
      scopedVars: {},
      targets: [],
      maxDataPoints: 0,
    };
    return await this.doQuery(query, options as any);
  }

  /**
   * doRequest: esegue la chiamata HTTP con getBackendSrv()
   */
  private async doRequest(options: any) {
    options.withCredentials = this.withCredentials;
    options.headers = this.headers;

    try {
      return await getBackendSrv().datasourceRequest(options);
    } catch (err: any) {
      // Gestione errori
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
