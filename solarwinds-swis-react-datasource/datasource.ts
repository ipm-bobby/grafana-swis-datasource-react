import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  MutableDataFrame,
  FieldType,
  MetricFindValue,
  ScopedVars,
} from '@grafana/data';
import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';
import { lastValueFrom } from 'rxjs';
import _ from 'lodash';
import { SwisQuery, SwisDataSourceOptions, QueryMetadata, Column } from './types';

export class SwisDatasource extends DataSourceApi<SwisQuery, SwisDataSourceOptions> {
  url: string;
  withCredentials: boolean;
  headers: Record<string, string>;

  constructor(instanceSettings: DataSourceInstanceSettings<SwisDataSourceOptions>) {
    super(instanceSettings);
    this.url = instanceSettings.url || '';
    this.withCredentials = instanceSettings.withCredentials || false;
    this.headers = { 'Content-Type': 'application/json' };
    if (typeof instanceSettings.basicAuth === 'string' && instanceSettings.basicAuth.length > 0) {
      this.headers['Authorization'] = instanceSettings.basicAuth;
    }
  }

  async testDatasource() {
    try {
      const response = await this.doRequest({
        url: this.url + '/Query?query=SELECT Description FROM System.NullEntity',
        method: 'GET',
      });
      
      if (response.status === 200) {
        return {
          status: 'success',
          message: 'Data source is working :)',
          title: 'Success',
        };
      }
      
      return {
        status: 'error',
        message: `Error connecting to SWIS: ${response.statusText}`,
        title: 'Error',
      };
    } catch (err) {
      return {
        status: 'error',
        message: `Error connecting to SWIS: ${err}`,
        title: 'Error',
      };
    }
  }

  interpolateVariable(value: any, variable: any) {
    if (typeof value === 'string') {
      if (variable.multi || variable.includeAll) {
        return "'" + value.replace(/'/g, `''`) + "'";
      } else {
        return value;
      }
    }

    if (typeof value === 'number') {
      return value;
    }

    return value;
  }

  async query(options: DataQueryRequest<SwisQuery>): Promise<DataQueryResponse> {
    const queries = options.targets
      .filter(item => !item.hide)
      .map(item => {
        return {
          refId: item.refId,
          intervalMs: options.intervalMs,
          maxDataPoints: options.maxDataPoints,
          rawSql: item.rawSql,
          format: item.format,
        };
      });

    if (queries.length === 0) {
      return { data: [] };
    }

    try {
      const promises = queries.map(query => this.doQuery(query, options));
      const results = await Promise.all(promises);
      const data = results.flat();
      
      return { data };
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  async doQuery(query: any, options: DataQueryRequest<SwisQuery>) {
    // Process SWQL
    let swql = query.rawSql;
    swql = swql.replace(/\$from/g, '@timeFrom');
    swql = swql.replace(/\$to/g, '@timeTo');    

    swql = getTemplateSrv().replace(swql, options.scopedVars, this.interpolateVariable);

    query.rawSql = swql;    

    const param = {
      query: this.resolveMacros(query.rawSql, options),
      parameters: {
        timeFrom: options.range ? options.range.from.toISOString() : '',
        timeTo: options.range ? options.range.to.toISOString() : '',
        granularity: Math.max(Math.floor((options.intervalMs || 0) / 1000), 1),
      }
    };    
    
    query.options = options;

    try {
      // First get metadata
      const metadataResponse = await this.doRequest({
        url: this.url + '/Query', 
        method: 'POST',
        data: {
          query: param.query + " WITH SCHEMAONLY",
          parameters: param.parameters
        }
      });
      
      this.processMetadata(metadataResponse, query);
      
      // Then get the actual data
      const dataResponse = await this.doRequest({
        url: this.url + '/Query', 
        method: 'POST',
        data: param
      });
      
      return this.processQueryResult(dataResponse, query);
    } catch (error) {
      console.error('Error executing query:', error);
      throw error;
    }
  }

  timeSpan(ms: number): string {
    const obj = {
      ms: ms % 1000,
      ss: Math.floor(ms / 1000) % 60,
      mm: Math.floor(ms / (1000 * 60)) % 60,
      hh: Math.floor(ms / (1000 * 60 * 60)) % 24,
      dd: Math.floor(ms / (1000 * 60 * 60 * 24))
    };
    return obj.dd + '.' + obj.hh + ':' + obj.mm + ':' + obj.ss + '.' + obj.ms;
  }

  resolveMacros(rawSql: string, options: DataQueryRequest<SwisQuery>): string {
    // downsample(variable) is translated into - ADDSECOND(FLOOR(SecondDiff('1970-01-01T00:00:00', LastSync) / [granularity] + 1) * [granularity], '1970-01-01T00:00:00')
    const r = /downsample\(([^\)]*)*\)/g;

    rawSql = rawSql.replace(r, (match, group) => {
      return "ADDSECOND(FLOOR(SecondDiff('1970-01-01T00:00:00', "+group+")/@granularity+1)*@granularity, '1970-01-01T00:00:00')";
    });
    
    // add sampling to all queries as it's harmless
    if (rawSql.indexOf('GRANULARITY') === -1 && rawSql.indexOf('downsample') !== -1) {
      rawSql += " WITH GRANULARITY '" + this.timeSpan(options.intervalMs || 0) + "'";
    }

    return rawSql;
  }

  processMetadata(res: any, query: any): void {
    const columns: Column[] = [];
    const metadata: QueryMetadata = {
      timeColumnIndex: -1,
      metricIndex: -1,
      columns: columns
    };

    for (const row of res.data.results) {
      if (row.DataType.indexOf('String') !== -1) {
        metadata.metricIndex = row.Index;
      } else if (row.DataType.indexOf('DateTime') !== -1) {
        metadata.timeColumnIndex = row.Index;
      }      

      columns.push({
        index: row.Index,
        name: row.Alias,
        type: this.translateType(row.DataType)
      });
    }

    // metric has limitations on data output
    if (query.format === 'time_series') {
      if (columns.length < 2) {
        throw new Error('There has to be at least 2 columns defined for Series');
      }

      if (metadata.timeColumnIndex === -1) {
        throw new Error('Missing DateTime column which is needed for Series');
      }
    }

    // set metadata to query
    query.metadata = metadata;
  }

  translateType(type: string): string {
    // Translate SWIS type to grafana types
    if (type.indexOf('Int') !== -1 || type.indexOf('Double') !== -1 || type.indexOf('Decimal') !== -1) {
      return FieldType.number;
    } else if (type.indexOf('DateTime') !== -1) {
      return FieldType.time;
    } else if (type.indexOf('Boolean') !== -1) {
      return FieldType.boolean;
    }
    return FieldType.string;
  }

  processQueryResult(res: any, query: any) {
    if (query.format === 'table') {
      return this.processQueryResultTable(res, query);
    }
    else if (query.format === 'time_series') {
      return this.processQueryResultMetric(res, query);
    }
    else if (query.format === 'search') {
      return this.processQueryResultSearch(res, query);
    }
    else if (query.format === 'annotation') {
      return this.processQueryResultAnnotation(res, query);
    }
    else {    
      throw new Error('Unknown query format [' + query.format + ']');
    }
  }

  processQueryResultAnnotation(res: any, query: any) {
    const metadata = query.metadata;
    let timeIndex = metadata.columns.findIndex((n: Column) => n.name === 'time');
    if (timeIndex === -1) timeIndex = metadata.timeColumnIndex;
    
    let textIndex = metadata.columns.findIndex((n: Column) => n.name === 'text');
    if (textIndex === -1) textIndex = metadata.metricIndex;
    
    const tagsIndex = metadata.columns.findIndex((n: Column) => n.name === 'tags');

    if (timeIndex === -1) {
      throw new Error('Missing mandatory column DateTime column or named [time]');
    }

    return res.data.results.map((rowData: any) => 
      Object.keys(rowData).map(n => rowData[n])
    ).map((row: any) => {
      return {
        annotation: query.options.annotation,
        time: this.correctTime(row[timeIndex]),
        text: row[textIndex],
        tags: row[tagsIndex] ? row[tagsIndex].trim().split(/\s*,\s*/) : []
      };
    });
  }

  processQueryResultSearch(res: any, query: any): MetricFindValue[] {
    const metadata = query.metadata;
    const textIndex = metadata.columns.findIndex((n: Column) => n.name === '__text');
    const valueIndex = metadata.columns.findIndex((n: Column) => n.name === '__value');
    
    if (metadata.columns.length === 2 && textIndex !== -1 && valueIndex !== -1) {
      const text = metadata.columns[textIndex];
      const value = metadata.columns[valueIndex];
      
      return res.data.results
        .map((rowData: any) => Object.keys(rowData).map(n => rowData[n]))
        .map((row: any) => {
          return {
            text: row[text.index],
            value: row[value.index]
          };
        });
    } else {
      throw new Error('Specify __text and __value column');      
    }
  }

  processQueryResultTable(res: any, query: any) {
    const frame = new MutableDataFrame({
      refId: query.refId,
      fields: query.metadata.columns.map((col: Column) => ({
        name: col.name,
        type: col.type as FieldType,
      })),
    });

    res.data.results.forEach((rowData: any) => {
      const row = Object.keys(rowData).map(n => rowData[n]);
      frame.appendRow(row);
    });

    return [frame];
  }

  correctTime(dtString: string): number {
    // SWIS sometimes return time including time zone 02:00:34.675+3:00 instead of pure UTC      
    let dtZoneIndex = dtString.indexOf('+');            
    if (dtZoneIndex !== -1) {        
      dtString = dtString.substring(0, dtZoneIndex) + 'Z';
    }
    else if (dtString.lastIndexOf('Z') !== dtString.length-1) {
      dtString += 'Z';
    }
      
    return Date.parse(dtString);
  }

  processQueryResultMetric(res: any, query: any) {
    const metadata = query.metadata;
    const frames: MutableDataFrame[] = [];
    const series: Record<string, MutableDataFrame> = {};

    for (const rowData of res.data.results) {
      const row = Object.keys(rowData).map(n => rowData[n]);
      const date = this.correctTime(row[metadata.timeColumnIndex]);
      
      for (let i = 0; i < metadata.columns.length; i++) {
        if (i === metadata.timeColumnIndex || i === metadata.metricIndex) {
          continue;
        }

        let serieName = '';

        if (metadata.metricIndex !== -1) {
          serieName = row[metadata.metricIndex];
        }

        if (metadata.columns.length > 3 || serieName === '') {
          if (serieName !== '') {
            serieName += '-';
          }

          serieName += metadata.columns[i].name;
        }

        let frame = series[serieName];

        if (!frame) {
          frame = new MutableDataFrame({
            refId: query.refId,
            name: serieName,
            fields: [
              { name: 'Time', type: FieldType.time },
              { name: 'Value', type: FieldType.number },
            ],
          });
          series[serieName] = frame;
          frames.push(frame);
        }

        const value = row[i];
        frame.appendRow([date, value]);
      }
    }

    return frames;
  }

  async annotationQuery(options: any) {
    if (!options.annotation.query) {
      throw new Error('Query missing in annotation definition');
    }

    const query = {
      rawSql: options.annotation.query,
      format: 'annotation',
      metadata: {}
    };
    
    return this.doQuery(query, options);
  }

  async metricFindQuery(rawSql: string, options?: any): Promise<MetricFindValue[]> {
    const query = {
      rawSql: rawSql,
      format: 'search',
      metadata: {}
    };
    
    const defaultOptions = {
      intervalMs: 0,
      range: {
        from: '',
        to: ''
      },
      scopedVars: {}
    };

    return this.doQuery(query, { ...defaultOptions, ...options });
  }

  applyTemplateVariables(query: SwisQuery, scopedVars: ScopedVars): SwisQuery {
    return {
      ...query,
      rawSql: getTemplateSrv().replace(query.rawSql, scopedVars, this.interpolateVariable),
    };
  }

  async doRequest(options: any) {
    options.withCredentials = this.withCredentials;
    options.headers = this.headers;

    try {
      return await lastValueFrom(getBackendSrv().fetch(options));
    } catch (error: any) {
      console.error('Request failed:', error);
      
      if (error.status === 404) {
        throw new Error('SWIS service is not available');
      }

      // Some query exception
      if (error.data?.Message) {
        throw new Error(error.data.Message);
      }
      
      throw error;
    }
  }
}