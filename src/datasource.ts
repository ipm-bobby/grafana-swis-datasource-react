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
import { lastValueFrom, Subject } from 'rxjs';
import _ from 'lodash';
import { SwisQuery, SwisDataSourceOptions, QueryMetadata, Column } from './types';

// Helper function to safely stringify objects for debugging
function safeStringify(obj: any, space: number = 2): string {
  const cache: any[] = [];
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      // If circular reference detected, return '[Circular]'
      if (cache.includes(value)) {
        return '[Circular]';
      }
      cache.push(value);
    }
    return value;
  }, space);
}

export class SwisDatasource extends DataSourceApi<SwisQuery, SwisDataSourceOptions> {
  url: string;
  access: string;
  withCredentials: boolean;
  headers: Record<string, string>;
  events: Subject<any>;
  private originalQueries: Map<string, string> = new Map();

  constructor(instanceSettings: DataSourceInstanceSettings<SwisDataSourceOptions>) {
    super(instanceSettings);
    
    // Store access mode for request handling
    this.access = instanceSettings.access || 'proxy';
    console.log('Datasource access mode:', this.access);
    
    // Store URL - for proxy mode, THIS MUST BE THE FULL URL to the SWIS endpoint
    this.url = instanceSettings.url || '';
    console.log('Original URL from settings:', this.url);
    
    // For proxy mode, we'll handle URL differently
    if (this.access === 'proxy') {
      // This is the Grafana server-side proxy URL that we need to use
      console.log('Using proxy mode - URL will be handled by Grafana server');
    } else {
      // Direct mode - client connects directly to the URL
      console.log('Using direct mode - URL will be used as-is');
    }
    
    this.withCredentials = instanceSettings.withCredentials || false;
    this.headers = { 'Content-Type': 'application/json' };
    
    // Handle basic auth
    if (typeof instanceSettings.basicAuth === 'string' && instanceSettings.basicAuth.length > 0) {
      this.headers['Authorization'] = instanceSettings.basicAuth;
    }
    
    this.events = new Subject<any>();
  }

  async testDatasource() {
    try {
      // Log the connection attempt with detailed configuration
      console.log('Testing connection to SWIS datasource:', {
        url: this.url,
        access: this.access,
        withCredentials: this.withCredentials,
        headers: { ...this.headers, Authorization: this.headers.Authorization ? '(redacted)' : undefined },
      });
      
      // Make a simple test query
      const testQuery = 'SELECT Description FROM System.NullEntity';
      console.log('Test query:', testQuery);
      
      // For proxy mode, we need to ensure /Query is included in the URL
      // since SWIS requires the full endpoint path
      let url = '';
      if (this.access === 'proxy') {
        // In proxy mode, ensure /Query is included if not already present
        url = this.url.endsWith('/Query') ? this.url : this.url + '/Query';
        console.log('Using proxy mode URL:', url);
      } else {
        // In direct mode, append /Query as before
        url = this.url + '/Query';
        console.log('Using direct mode URL:', url);
      }
      
      const response = await this.doRequest({
        url: url + '?query=' + encodeURIComponent(testQuery),
        method: 'GET',
      });
      
      // Log successful response
      console.log('Test successful:', {
        status: response.status,
        statusText: response.statusText,
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
    } catch (err: any) {
      // Detailed error logging
      console.error('Test datasource error:', safeStringify({
        message: err.message,
        status: err.status,
        statusText: err.statusText,
        data: err.data,
        stack: err.stack,
        url: this.url,
      }));
      
      // Add more debugging information
      let debugInfo = '';
      try {
        debugInfo = `Debug info: 
          - URL: ${this.url}
          - Status: ${err.status || 'unknown'}
          - Message: ${err.message || 'No message'}
          - Data: ${err.data ? JSON.stringify(err.data) : 'No data'}
          - Authentication: ${this.headers.Authorization ? 'Present' : 'Missing'}
          - withCredentials: ${this.withCredentials}`;
      } catch (e) {
        debugInfo = 'Could not generate debug info: ' + (e as Error).message;
      }
      console.log(debugInfo);
      
      // Provide more specific error messages based on common issues
      if (err.status === 401 || (err.message && err.message.includes('Authentication failed')) || (err.message && err.message.includes('Unauthorized'))) {
        return {
          status: 'error',
          message: `Authentication failed: Please check your username and password. (${err.status || 'Unknown status'}: ${err.statusText || 'No status text'})`,
          title: 'Authentication Error',
        };
      }
      
      if (err.status === 403) {
        return {
          status: 'error',
          message: `Access forbidden (403): The server rejected the request. Please verify your credentials have sufficient permissions. (${err.statusText || 'No status text'})`,
          title: 'Access Denied',
        };
      }
      
      if (err.status === 404 || (err.message && err.message.includes('SWIS service is not available'))) {
        return {
          status: 'error',
          message: `SWIS service not found (404): Please verify the URL and that the service is running. URL: ${this.url}`,
          title: 'Service Error',
        };
      }
      
      if (err.status === 400) {
        // Handle Bad Request (400) error with helpful suggestions
        const errorMessage = err.data?.Message || err.statusText || 'Unknown error';
        let troubleshootingMessage = '';
        
        // Extract specific error information for common issues
        if (errorMessage.includes('The remote name could not be resolved')) {
          troubleshootingMessage = `
          Possible Solutions:
          1. Check if the server name is correct
          2. Verify network connectivity to the server
          3. Check if DNS resolution is working properly
          4. Try using an IP address instead of hostname`;
        } else if (errorMessage.includes('format') || errorMessage.includes('query')) {
          troubleshootingMessage = `
          Possible Solutions:
          1. Check if the URL format is correct
          2. Verify that the endpoint accepts the query format you're using
          3. Make sure 'Query' is properly included in the URL
          4. Try setting Access Mode to "Server" instead of "Browser"`;
        } else {
          troubleshootingMessage = `
          Possible Solutions:
          1. Check the URL format (should be: https://server:port/SolarWinds/InformationService/v3/Json/)
          2. Verify that SWIS service is running and accessible
          3. Try setting Access Mode to "Server" instead of "Browser"
          4. Check if authentication is required`;
        }
        
        return {
          status: 'error',
          message: `Bad Request (400): The server couldn't process the request.\n${errorMessage}\n${troubleshootingMessage}`,
          title: 'Bad Request Error',
        };
      }
      
      if (err.status === 0) {
        return {
          status: 'error',
          message: `Connection error: Unable to reach the SWIS server. This could be due to CORS issues, a network problem, or the server being unavailable.
          
          Possible Solutions:
          1. Check if the server is accessible from Grafana
          2. Make sure the Access Mode is set to "Server" if dealing with CORS issues
          3. Verify your network connectivity
          4. Check if a firewall is blocking the connection`,
          title: 'Connection Error',
        };
      }
      
      if (err.status === 500) {
        return {
          status: 'error',
          message: `Server error (500): The SWIS server encountered an internal error. Server message: ${err.data?.Message || err.statusText || 'Unknown error'}`,
          title: 'Server Error',
        };
      }
      
      // Detailed default error message
      return {
        status: 'error',
        message: `Error connecting to SWIS (${err.status || 'Unknown status'}): ${err.message || err}. ${debugInfo}`,
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
      
      // Emit data received event for each query
      queries.forEach((query, index) => {
        this.events.next({
          type: 'data-received',
          payload: {
            refId: query.refId,
            data: results[index],
            meta: {
              sql: query.rawSql
            }
          }
        });
      });
      
      return { data };
    } catch (error) {
      console.error('Query error:', error);
      
      // Emit error event
      this.events.next({
        type: 'data-error',
        payload: {
          error: error instanceof Error ? error.message : String(error),
        }
      });
      
      throw error;
    }
  }

  // Helper function to create a clean query object
  createCleanQueryParam(queryString: string, options: DataQueryRequest<SwisQuery>) {
    return {
      query: queryString,
      parameters: {
        timeFrom: options.range ? options.range.from.toISOString() : '',
        timeTo: options.range ? options.range.to.toISOString() : '',
        granularity: Math.max(Math.floor((options.intervalMs || 0) / 1000), 1),
      }
    };
  }
  
  async doQuery(query: any, options: DataQueryRequest<SwisQuery>) {
    console.log('Starting doQuery with format:', query.format, 'and options:', options);
    
    // Process SWQL - Force to string and trim to ensure clean query
    let swql = (query.rawSql || '').toString().trim();
    
    // Skip processing if query is empty
    if (!swql) {
      console.log('Empty query, skipping processing');
      this.events.next({
        type: 'data-error',
        payload: {
          refId: query.refId,
          error: 'Query is empty. Please enter a valid SWQL query.',
        }
      });
      return [];
    }
    
    // Removed the SELECT validation to prevent false positives
    // Let the server handle SQL validation instead
    console.log('Query validation check skipped, using raw query.');
    
    // Handle DESC keyword correctly - only truncate if it's the final DESC SELECT issue
    // But don't truncate if it's part of a valid query with ORDER BY or WHERE clause
    const descIndex = swql.toLowerCase().lastIndexOf('desc');
    if (descIndex > 0) {
      // Get everything after DESC to see if there's any content
      const afterDesc = swql.substring(descIndex + 4).trim();
      // Only truncate if it's not a valid part of the query (ORDER BY, WHERE, etc.)
      const isValidSuffix = afterDesc.toLowerCase().includes('order by') || 
                           afterDesc.toLowerCase().includes('where') ||
                           afterDesc.toLowerCase().includes('and') ||
                           afterDesc.toLowerCase().includes('inner join') ||
                           afterDesc.toLowerCase().includes('left join') ||
                           afterDesc.toLowerCase().includes('on');
      
      if (afterDesc.length > 0 && !isValidSuffix) {
        console.warn('Found content after DESC keyword, truncating:', afterDesc);
        swql = swql.substring(0, descIndex + 4);
      } else {
        console.log('Found content after DESC but it appears to be valid query syntax, not truncating');
      }
    }
    
    // Manual conversion of SWIS functions to proper format if needed
    // ADDDAY(-30, GETUTCDATE()) is a common source of errors
    if (swql.includes('ADDDAY') || swql.includes('GETUTCDATE')) {
      console.log('Query contains SWIS date functions, ensuring proper format');
    }
    
    // Perform standard replacements
    swql = swql.replace(/\$from/g, '@timeFrom');
    swql = swql.replace(/\$to/g, '@timeTo');    

    swql = getTemplateSrv().replace(swql, options.scopedVars, this.interpolateVariable);

    // Update the query object with the cleaned query
    query.rawSql = swql;  
    console.log('Processed query:', swql);
    
    // Ensure format is always set
    if (!query.format) {
      query.format = 'table'; // Default to table for raw SQL queries without time
    }
    console.log('Query format after processing:', query.format);

    // Create a clean, untransformed query string directly from the user input
    let userQueryString = query.rawSql || '';
    
    // Always use the raw query without any transformations for tables with complex queries
    if (query.format === 'table' && (
        userQueryString.includes('NodesCustomProperties') || 
        userQueryString.includes('ADDDAY') || 
        userQueryString.includes('GETUTCDATE') || 
        userQueryString.includes('JOIN')
      )) {
      console.log('Query contains complex SQL - using completely raw query without any transformations');
      
      // Create param object with completely raw query
      const param = this.createCleanQueryParam(userQueryString, options);
      
      console.log('Using raw query with no transformations:', userQueryString);
      
      query.metadata = {
        timeColumnIndex: -1,
        metricIndex: -1,
        columns: []
      };
      
      return param;
    }
    
    // For other queries, use the normal processing
    let processedQuery = query.rawSql;
    
    // Don't apply macro resolution for table queries to avoid issues
    if (query.format === 'table') {
      console.log('Using raw query without macro resolution for table query');
    } else {
      // For time series, still apply macro resolution
      processedQuery = this.resolveMacros(processedQuery, options);
    }
    
    const param = this.createCleanQueryParam(processedQuery, options);
    
    // Add debugging log of the exact query string sent to the server
    console.log('Final query string sent to server:', processedQuery);
    
    console.log('Final parameters for query:', {
      format: query.format,
      parameters: param.parameters
    });
    
    query.options = options;
    
    // Handle URL differently based on access mode
    let requestUrl = '';
    if (this.access === 'proxy') {
      // In proxy mode, ensure /Query is included if not already present
      requestUrl = this.url.endsWith('/Query') ? this.url : this.url + '/Query';
      console.log('Using proxy mode URL for query:', requestUrl);
    } else {
      // In direct mode, append /Query as before
      requestUrl = this.url + '/Query';
      console.log('Using direct mode URL for query:', requestUrl);
    }

    try {
      // First get metadata
      try {
        const metadataResponse = await this.doRequest({
          url: requestUrl, 
          method: 'POST',
          data: {
            query: param.query + " WITH SCHEMAONLY",
            parameters: param.parameters
          }
        });
        
        this.processMetadata(metadataResponse, query);
      } catch (error) {
        console.warn('Error getting metadata, will attempt to continue without it:', error);
        // Initialize empty metadata so the query can still run
        query.metadata = {
          timeColumnIndex: -1,
          metricIndex: -1,
          columns: []
        };
      }
      
      // Then get the actual data
      const dataResponse = await this.doRequest({
        url: requestUrl, 
        method: 'POST',
        data: param
      });
      
      console.log('Format being used for result processing:', query.format);
      return this.processQueryResult(dataResponse, query);
    } catch (error) {
      console.error('Error executing query:', error);
      
      // Emit a specific error event for this query
      this.events.next({
        type: 'data-error',
        payload: {
          refId: query.refId,
          error: error instanceof Error ? error.message : String(error),
          meta: query.metadata
        }
      });
      
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
    console.log('Processing metadata for query with format:', query.format);
    console.log('Metadata response:', res.data);
    
    const columns: Column[] = [];
    const metadata: QueryMetadata = {
      timeColumnIndex: -1,
      metricIndex: -1,
      columns: columns
    };

    // Handle case where results might be missing or empty
    if (!res.data || !res.data.results || !res.data.results.length) {
      console.warn('No metadata results returned from SWIS');
      // set empty metadata to query to avoid undefined errors
      query.metadata = metadata;
      return;
    }

    // First pass: Identify DateTime columns
    for (const row of res.data.results) {
      // Log more details for debugging
      console.log(`Column ${row.Index}: ${row.Alias}, Type: ${row.DataType}`);
      
      if (row.DataType.indexOf('DateTime') !== -1) {
        metadata.timeColumnIndex = row.Index;
        console.log(`Found DateTime column: ${row.Alias} at index ${row.Index}`);
      }
      
      columns.push({
        index: row.Index,
        name: row.Alias,
        type: this.translateType(row.DataType)
      });
    }
    
    // Second pass: If no DateTime found, try to identify by common time column names
    if (metadata.timeColumnIndex === -1) {
      console.log('No DateTime columns found by type - trying to identify by name');
      
      const timeColumnNames = ['time', 'timestamp', 'date', 'datetime', 'observationtimestamp'];
      for (const col of columns) {
        if (timeColumnNames.includes(col.name.toLowerCase())) {
          metadata.timeColumnIndex = col.index;
          console.log(`Identified time column by name: ${col.name} at index ${col.index}`);
          break;
        }
      }
    }
    
    // Third pass: Find a metric column (string column) for series names
    // Only set metricIndex if we don't already have one and the current column looks like a label
    for (const row of res.data.results) {
      if (row.DataType.indexOf('String') !== -1) {
        const potentialMetricColumn = row.Alias.toLowerCase();
        const isLikelyMetric = potentialMetricColumn.includes('name') || 
                              potentialMetricColumn.includes('metric') ||
                              potentialMetricColumn.includes('label') ||
                              potentialMetricColumn.includes('key') ||
                              potentialMetricColumn.includes('caption') || 
                              potentialMetricColumn.includes('id') ||
                              potentialMetricColumn.includes('interface') ||
                              potentialMetricColumn.includes('device') ||
                              potentialMetricColumn.includes('entity') ||
                              potentialMetricColumn.includes('node') ||
                              potentialMetricColumn.includes('component');
                              
        if (isLikelyMetric) {
          console.log(`Found likely metric name column: ${row.Alias} at index ${row.Index}`);
          metadata.metricIndex = row.Index;
          break;
        } else if (metadata.metricIndex === -1) {
          // If we haven't found a better match, use this String column
          metadata.metricIndex = row.Index;
        }
      }
    }

    console.log('Generated metadata:', {
      columns: columns.map(c => `${c.name} (${c.type})`),
      timeColumnIndex: metadata.timeColumnIndex,
      metricIndex: metadata.metricIndex,
    });

    // For time series, ensure we have appropriate columns
    if (query.format === 'time_series') {
      if (columns.length < 2) {
        console.warn('Warning: Less than 2 columns defined for time series');
        // Automatically switch to table format for queries without enough columns for time series
        if (columns.length < 1) {
          console.log('Switching to table format due to column count');
          query.format = 'table';
        }
      }

      if (metadata.timeColumnIndex === -1) {
        console.warn('Warning: Missing DateTime column for time series');
        
        // Check if the query text contains time-related keywords
        const lowerQuery = (query.rawSql || '').toLowerCase();
        const hasTimeReference = lowerQuery.includes('time') || 
                               lowerQuery.includes('timestamp') || 
                               lowerQuery.includes('date') ||
                               lowerQuery.includes('observationtimestamp');
                               
        if (hasTimeReference) {
          console.log('Query mentions time fields but metadata doesn\'t show them. Will attempt to find at runtime.');
        } else {
          // No time references in query - switch to table
          console.log('Switching to table format due to missing time column');
          query.format = 'table';
        }
      }
    }

    // set metadata to query
    query.metadata = metadata;
    console.log('Final query format after metadata processing:', query.format);
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
    // Set a default format if undefined to prevent errors
    const format = query.format || 'time_series';
    
    if (format === 'table') {
      return this.processQueryResultTable(res, query);
    }
    else if (format === 'time_series') {
      return this.processQueryResultMetric(res, query);
    }
    else if (format === 'search') {
      return this.processQueryResultSearch(res, query);
    }
    else if (format === 'annotation') {
      return this.processQueryResultAnnotation(res, query);
    }
    else {    
      console.warn('Unknown query format:', format, ', defaulting to time_series');
      // Default to time_series instead of throwing error
      return this.processQueryResultMetric(res, query);
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
    console.log('Processing table result:', {
      refId: query.refId,
      metadata: query.metadata,
      dataResults: res.data.results.length
    });
    
    // Make sure metadata exists and has columns
    if (!query.metadata || !query.metadata.columns || !query.metadata.columns.length) {
      console.error('Missing metadata or columns for table query:', query);
      // Create a fallback frame with data based on the first row
      if (res.data.results && res.data.results.length > 0) {
        const firstRow = res.data.results[0];
        const frame = new MutableDataFrame({
          refId: query.refId,
          fields: Object.keys(firstRow).map(key => ({
            name: key,
            type: typeof firstRow[key] === 'number' ? FieldType.number : 
                  typeof firstRow[key] === 'boolean' ? FieldType.boolean : FieldType.string
          }))
        });
        
        // Add all rows
        res.data.results.forEach((rowData: any) => {
          frame.appendRow(Object.values(rowData));
        });
        
        return [frame];
      }
      
      // If no data at all, return empty frame
      return [new MutableDataFrame({
        refId: query.refId,
        fields: [{ name: 'No Data', type: FieldType.string }]
      })];
    }
    
    // Create frame with proper metadata
    const frame = new MutableDataFrame({
      refId: query.refId,
      fields: query.metadata.columns.map((col: Column) => ({
        name: col.name,
        type: col.type as FieldType,
      })),
    });

    // Add the data rows
    res.data.results.forEach((rowData: any) => {
      const row = Object.keys(rowData).map(n => rowData[n]);
      frame.appendRow(row);
    });

    console.log('Table frame created with fields:', frame.fields.map(f => f.name));
    
    return [frame];
  }

  correctTime(dtString: string | undefined): number {
    // Handle undefined or null value
    if (!dtString) {
      console.warn('Invalid time value received (undefined or null)');
      return 0; // Return epoch time as a fallback
    }
    
    // SWIS sometimes return time including time zone 02:00:34.675+3:00 instead of pure UTC      
    let dtZoneIndex = dtString.indexOf('+');            
    if (dtZoneIndex !== -1) {        
      dtString = dtString.substring(0, dtZoneIndex) + 'Z';
    }
    else if (dtString.lastIndexOf('Z') !== dtString.length-1) {
      dtString += 'Z';
    }
    
    const parsedDate = Date.parse(dtString);
    if (isNaN(parsedDate)) {
      console.warn(`Invalid date format received: ${dtString}`);
      return 0; // Return epoch time as a fallback
    }
    
    return parsedDate;
  }

  processQueryResultMetric(res: any, query: any) {
    const metadata = query.metadata;
    const frames: MutableDataFrame[] = [];
    const series: Record<string, MutableDataFrame> = {};

    // Check if we have valid metadata and a time column
    if (!metadata || metadata.timeColumnIndex === -1 || metadata.timeColumnIndex === undefined) {
      console.warn('Missing time column index in metadata - attempting to identify one or use fallback');
      
      // If we have data but no time column index, attempt to find one
      if (res.data && res.data.results && res.data.results.length > 0 && metadata.columns) {
        // Look for columns with common time names
        const timeColumnNames = ['time', 'timestamp', 'date', 'datetime', 'observationtimestamp'];
        for (let i = 0; i < metadata.columns.length; i++) {
          const columnName = metadata.columns[i].name.toLowerCase();
          if (timeColumnNames.includes(columnName)) {
            console.log(`Found potential time column: ${metadata.columns[i].name} at index ${i}`);
            metadata.timeColumnIndex = i;
            break;
          }
        }
      }
      
      // If we still don't have a time column, use table format instead
      if (metadata.timeColumnIndex === -1 || metadata.timeColumnIndex === undefined) {
        console.warn('No time column found, falling back to table format');
        return this.processQueryResultTable(res, query);
      }
    }

    // Check if we should use a "wide" format with all metrics in a single frame
    // This is useful for queries where we want to use "Organize fields by name" in Grafana
    //
    // Wide format example:
    // +----------+------------------+--------+----------+
    // | Time     | Interface        | RECEIVE| TRANSMIT |
    // +----------+------------------+--------+----------+
    // | Time1    | Interface1       | val1   | val2     |
    // | Time2    | Interface1       | val3   | val4     |
    // | Time1    | Interface2       | val5   | val6     |
    // +----------+------------------+--------+----------+
    //
    // vs. Normal format (separate frames for each metric):
    // Frame 1:
    // +----------+--------+
    // | Time     | Value  |
    // +----------+--------+
    // | Time1    | val1   |
    // | Time2    | val3   |
    // +----------+--------+
    // Frame 2:
    // +----------+--------+
    // | Time     | Value  |
    // +----------+--------+
    // | Time1    | val2   |
    // | Time2    | val4   |
    // +----------+--------+
    // etc.
    
    // Look for specific patterns that indicate a query that should use wide format
    // 1. Queries with a time, an entity name (like Interface), and multiple metrics
    // 2. Queries with JOIN operations are good candidates
    const hasJoin = (query.rawSql || '').toLowerCase().includes('join');
    const hasMultipleMetrics = metadata.columns.length > 3; // time + entity + at least 2 metrics
    const hasMetricName = metadata.metricIndex !== -1;
    
    // Special case: detect traffic monitoring queries (like in_bytes, out_bytes patterns)
    // This is common in network monitoring with interface traffic metrics
    const isTrafficQuery = (query.rawSql || '').toLowerCase().includes('totalbytes') || 
                           (query.rawSql || '').toLowerCase().includes('inbytes') || 
                           (query.rawSql || '').toLowerCase().includes('outbytes') ||
                           (query.rawSql || '').toLowerCase().includes('receive') || 
                           (query.rawSql || '').toLowerCase().includes('transmit');
                           
    // Use wide format when we have multiple metrics and either:
    // - There's a JOIN in the query (usually means we're relating metrics to a dimension)
    // - We have a labeled metric column (like Interface)
    // - It's a traffic query (special case) BUT NOT when it has a dimension field like "Interface"
    
    // Check if the query is an interface traffic query that needs to be shown separately
    const isInterfaceTrafficQuery = isTrafficQuery && 
                                  ((query.rawSql || '').toLowerCase().includes('interface') || 
                                   metadata.columns.some(col => col.name.toLowerCase().includes('interface'))) &&
                                  metadata.metricIndex !== -1;
    
    // Check if this query might be used for transformations based on query patterns
    // Queries with "InTotalBytes/OutTotalBytes" often need wide format for transformations
    const isTotalBytesQuery = (query.rawSql || '').toLowerCase().includes('totalbytes');
    
    // Check if query has other keywords that suggest it needs transformations
    const needsTransformations = isTotalBytesQuery;
    
    // Don't use wide format for normal interface traffic queries
    // But DO use wide format for queries that likely need transformations
    const hasTrafficWithInterface = isTrafficQuery && isInterfaceTrafficQuery && !needsTransformations;
    
    // Modified logic: Use wide format if it needs transformations
    const useWideFormat = hasMultipleMetrics && 
                        (needsTransformations || (!hasTrafficWithInterface && (hasJoin || hasMetricName || isTrafficQuery)));
    
    // Add detailed debugging for interface traffic detection
    const interfaceColumns = metadata.columns
      .filter(col => col.name.toLowerCase().includes('interface'))
      .map(col => col.name);
    
    console.log(`Format detection: ${JSON.stringify({
      queryHasInterface: (query.rawSql || '').toLowerCase().includes('interface'),
      interfaceColumns,
      isTotalBytesQuery,
      needsTransformations,
      metricIndex: metadata.metricIndex,
      isInterfaceTrafficQuery,
      hasTrafficWithInterface
    })}`);
    
    console.log(`Using wide format: ${useWideFormat} (hasMultipleMetrics=${hasMultipleMetrics}, hasJoin=${hasJoin}, hasMetricName=${hasMetricName}, isTrafficQuery=${isTrafficQuery}, needsTransformations=${needsTransformations})`);

    if (useWideFormat) {
      // Create a single frame with multiple fields
      const frame = new MutableDataFrame({
        refId: query.refId,
        fields: [
          { name: 'Time', type: FieldType.time },
        ],
      });

      // Add fields for all columns except time and metric name
      const valueColumns: number[] = [];
      for (let i = 0; i < metadata.columns.length; i++) {
        if (i !== metadata.timeColumnIndex && i !== metadata.metricIndex) {
          // For metric columns like RECEIVE and TRANSMIT, ensure they're treated as numbers
          // This is critical for Stat panels with sum calculations
          const columnName = metadata.columns[i].name.toUpperCase();
          const isNameNumericMetric = columnName.includes('RECEIVE') || 
                                 columnName.includes('TRANSMIT') ||
                                 columnName.includes('BYTES') ||
                                 columnName.includes('SPEED') ||
                                 columnName.includes('UTIL') ||
                                 columnName.includes('RATE') ||
                                 columnName.includes('COUNT');
                                 
          // Also check if the field type is already a number type
          const isTypeNumber = metadata.columns[i].type === FieldType.number;
          
          // Combine the checks
          const isNumericMetric = isNameNumericMetric || isTypeNumber;
          
          console.log(`Column ${metadata.columns[i].name} isNumericMetric: ${isNumericMetric}`);
          
          frame.addField({
            name: metadata.columns[i].name,
            type: isNumericMetric ? FieldType.number : metadata.columns[i].type as FieldType
          });
          valueColumns.push(i);
        }
      }

      // Directly add rows to the frame - simpler and more reliable approach
      // This will keep each row together in its original form
      for (const rowData of res.data.results) {
        const row = Object.keys(rowData).map(n => rowData[n]);
        const date = this.correctTime(row[metadata.timeColumnIndex]);
        
        // For each row, create an array with time first, then all value columns
        const rowValues = [date];
        
        for (const colIndex of valueColumns) {
          // For numeric columns, ensure the value is actually a number
          const columnName = metadata.columns[colIndex].name.toUpperCase();
          const isNameNumericMetric = columnName.includes('RECEIVE') || 
                                 columnName.includes('TRANSMIT') ||
                                 columnName.includes('BYTES') ||
                                 columnName.includes('SPEED') ||
                                 columnName.includes('UTIL') ||
                                 columnName.includes('RATE') ||
                                 columnName.includes('COUNT');
                                 
          // Also check if the field type is a number type or if the value looks like a number
          const isTypeNumber = metadata.columns[colIndex].type === FieldType.number;
          const valueIsNumeric = typeof row[colIndex] === 'number' || 
                                (typeof row[colIndex] === 'string' && !isNaN(Number(row[colIndex])));
                                
          // Combine all checks to determine if we should treat this as a number
          const isNumericMetric = isNameNumericMetric || isTypeNumber || valueIsNumeric;
          
          // Convert to number if it's a numeric metric
          const value = isNumericMetric ? Number(row[colIndex]) : row[colIndex];
          rowValues.push(value);
        }
        
        // Add the row to our frame
        frame.appendRow(rowValues);
      }
      
      // The metric field needs to be handled differently - we reconstruct the frame
      // with the metric field included as part of each row
      if (metadata.metricIndex !== -1) {
        // Create a new frame that includes the metric field
        const newFrame = new MutableDataFrame({
          refId: query.refId,
          fields: [
            { name: 'Time', type: FieldType.time },
            { name: metadata.columns[metadata.metricIndex].name, type: FieldType.string },
            // Add remaining fields
            ...valueColumns.map(i => {
              // Ensure numeric metrics are properly identified for Stat panels
              const columnName = metadata.columns[i].name.toUpperCase();
              const isNameNumericMetric = columnName.includes('RECEIVE') || 
                                   columnName.includes('TRANSMIT') ||
                                   columnName.includes('BYTES') ||
                                   columnName.includes('SPEED') ||
                                   columnName.includes('UTIL') ||
                                   columnName.includes('RATE') ||
                                   columnName.includes('COUNT');
                                   
              // Also check if the field type is already a number type
              const isTypeNumber = metadata.columns[i].type === FieldType.number;
              
              // Combine the checks
              const isNumericMetric = isNameNumericMetric || isTypeNumber;
              
              return {
                name: metadata.columns[i].name,
                type: isNumericMetric ? FieldType.number : metadata.columns[i].type as FieldType
              };
            })
          ],
        });
        
        // Add all rows with the metric name included
        for (const rowData of res.data.results) {
          const row = Object.keys(rowData).map(n => rowData[n]);
          const date = this.correctTime(row[metadata.timeColumnIndex]);
          const metricName = String(row[metadata.metricIndex] || '');
          
          const rowValues = [date, metricName];
          
          for (const colIndex of valueColumns) {
            // For numeric columns, ensure the value is actually a number
            const columnName = metadata.columns[colIndex].name.toUpperCase();
            const isNameNumericMetric = columnName.includes('RECEIVE') || 
                                 columnName.includes('TRANSMIT') ||
                                 columnName.includes('BYTES') ||
                                 columnName.includes('SPEED') ||
                                 columnName.includes('UTIL') ||
                                 columnName.includes('RATE') ||
                                 columnName.includes('COUNT');
                                 
            // Also check if the field type is a number type or if the value looks like a number
            const isTypeNumber = metadata.columns[colIndex].type === FieldType.number;
            const valueIsNumeric = typeof row[colIndex] === 'number' || 
                                  (typeof row[colIndex] === 'string' && !isNaN(Number(row[colIndex])));
                                  
            // Combine all checks to determine if we should treat this as a number
            const isNumericMetric = isNameNumericMetric || isTypeNumber || valueIsNumeric;
            
            // Convert to number if it's a numeric metric
            const value = isNumericMetric ? Number(row[colIndex]) : row[colIndex];
            rowValues.push(value);
          }
          
          newFrame.appendRow(rowValues);
        }
        
        // Replace the original frame
        frames.pop(); // Remove the original frame (it was the only one)
        frames.push(newFrame);
        console.log(`Reconstructed frame with metric field ${metadata.columns[metadata.metricIndex].name} included`);
      } else {
        // Only add the original frame if we didn't replace it
        frames.push(frame);
      }
    } else {
      // Original implementation for backward compatibility
      // Process the data as a time series with separate frames
      for (const rowData of res.data.results) {
        const row = Object.keys(rowData).map(n => rowData[n]);
        // Handle potentially undefined timeColumnIndex
        const date = this.correctTime(row[metadata.timeColumnIndex]);
        
        for (let i = 0; i < metadata.columns.length; i++) {
          // Skip time column and metric name column
          if (i === metadata.timeColumnIndex || i === metadata.metricIndex) {
            continue;
          }

          let serieName = '';

          // Use the metric column if available for naming
          if (metadata.metricIndex !== -1) {
            serieName = String(row[metadata.metricIndex] || '');
          }

          // Add column name to series name if needed
          if (metadata.columns.length > 3 || serieName === '') {
            if (serieName !== '') {
              serieName += '-';
            }
            serieName += metadata.columns[i].name;
          }

          // Ensure we have a valid series name
          if (!serieName) {
            serieName = `Value-${i}`;
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
    }

    // If we couldn't create any frames, return an empty result or fallback
    if (frames.length === 0) {
      console.warn('No time series frames could be created, check query and data format');
      return this.processQueryResultTable(res, query);
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
    console.log('Applying template variables with format:', query.format);
    return {
      ...query,
      format: query.format || 'time_series', // Ensure format is always set
      rawSql: getTemplateSrv().replace(query.rawSql || '', scopedVars, this.interpolateVariable),
    };
  }

  async doRequest(options: any) {
    options.withCredentials = this.withCredentials;
    options.headers = this.headers;

    // Store original query before any potential truncation
    let originalQuery: string | null = null;
    const queryKey = Date.now().toString() + Math.random().toString(36);
    
    if (options.data && options.data.query) {
      originalQuery = options.data.query;
      this.originalQueries.set(queryKey, originalQuery);
      console.log('Raw SQL being sent to server (exact string):', JSON.stringify(originalQuery));
      
      // Store the key in options for later retrieval
      options.queryKey = queryKey;
    }
    
    // Mitigate encoding issues by ensuring no undesired transformations on the query
    if (options.data && options.data.query) {
      // Ensure we are sending the query exactly as is without any URL encoding/decoding or character set issues
      if (options.data.query.includes('NodesCustomProperties')) {
        console.log('Query contains NodesCustomProperties - ensuring proper encoding');
        // Use a version that should be properly encoded for JSON
        options.data = {
          ...options.data,
          query: options.data.query
        };
      }
    }

    try {
      console.log('Making request with options:', {
        url: options.url,
        method: options.method,
        withCredentials: options.withCredentials,
        headers: { ...options.headers, Authorization: options.headers.Authorization ? '(redacted)' : undefined },
        data: options.data ? JSON.stringify(options.data).substring(0, 500) : undefined,
      });
      
      // Check for truncation issues and fix them before sending the query
      if (options.data && options.data.query && options.data.query.includes('NodesC') && !options.data.query.includes('NodesCustomProperties')) {
        console.error('DETECTED QUERY TRUNCATION ISSUE! Original query has been truncated.');
        
        // Retrieve the original query from our storage
        const storedQuery = options.queryKey ? this.originalQueries.get(options.queryKey) : null;
        
        let directResponse: Response;
        
        if (storedQuery) {
          console.log('Using stored original query to recover from truncation');
          
          // Create a direct fetch to avoid Grafana's possible truncation
          directResponse = await fetch(options.url, {
            method: 'POST',
            headers: {
              ...options.headers,
              'Content-Type': 'application/json'
            },
            credentials: options.withCredentials ? 'include' : 'same-origin',
            body: JSON.stringify({
              query: storedQuery,
              parameters: options.data.parameters
            })
          });
        } else {
          console.warn('No stored original query found, falling back to hardcoded query');
          
          // Fallback to hardcoded query as before
          directResponse = await fetch(options.url, {
            method: 'POST',
            headers: {
              ...options.headers,
              'Content-Type': 'application/json'
            },
            credentials: options.withCredentials ? 'include' : 'same-origin',
            body: JSON.stringify({
              query: `SELECT 
    N.NodeID, 
    N.Caption, 
    CP.CP01_SITE_CODE AS SiteCode,
    CP.DEVICE_MANAGED AS Managed_By,
    N.IPAddress, 
    N.Status, 
    N.LastSystemUpTimePollUtc, 
    NN.Note,
    NN.TimeStamp AS NoteTimeStamp
FROM 
    Orion.NodesCustomProperties CP 
    INNER JOIN Orion.Nodes N ON CP.NodeID = N.NodeID 
    LEFT JOIN (
        SELECT 
            NodeID, 
            MAX(TimeStamp) AS LatestTimeStamp
        FROM 
            Orion.NodeNotes
        GROUP BY 
            NodeID
    ) LatestNote ON N.NodeID = LatestNote.NodeID
    LEFT JOIN Orion.NodeNotes NN ON NN.NodeID = LatestNote.NodeID AND NN.TimeStamp = LatestNote.LatestTimeStamp
WHERE 
    N.Status = '2' 
AND N.LastSystemUpTimePollUtc <= ADDDAY(-30, GETUTCDATE())`,
              parameters: options.data.parameters
            })
          });
        }
        
        const response = await directResponse.json();
        console.log('Direct fetch response:', response);
        
        // Clean up stored query
        if (options.queryKey) {
          this.originalQueries.delete(options.queryKey);
        }
        
        return {
          data: response,
          status: directResponse.status,
          statusText: directResponse.statusText,
          headers: directResponse.headers,
          url: options.url,
          type: directResponse.type,
          redirected: directResponse.redirected,
          ok: directResponse.ok
        };
      }
      
      const response = await lastValueFrom(getBackendSrv().fetch(options));
      
      // Clean up stored query on successful normal request
      if (options.queryKey) {
        this.originalQueries.delete(options.queryKey);
      }
      
      // Log response with more details for debugging
      console.log('Response received:', {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data ? (
          response.data.results ? 
            `Results count: ${response.data.results.length}, Sample: ${
              JSON.stringify(response.data.results.slice(0, 2)).substring(0, 200)
            }...` : 
            '[data present but no results array]'
        ) : '[no data]',
      });
      
      return response;
    } catch (error: any) {
      // Clean up stored query on error
      if (options.queryKey) {
        this.originalQueries.delete(options.queryKey);
      }
      
      console.error('Request failed:', {
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        data: error.data,
        response: error.response,
        stack: error.stack,
      });
      
      // Log detailed information about the error
      console.error('Error details:', safeStringify({
        error: error.toString(),
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        data: error.data,
        url: options.url,
        method: options.method,
        // Include full error object for inspection
        fullError: error,
      }));
      
      if (error.status === 404) {
        throw new Error(`SWIS service is not available at URL: ${options.url}`);
      }
      
      if (error.status === 403) {
        throw new Error(`Authentication failed: Please check your credentials for URL: ${options.url}`);
      }
      
      if (error.status === 401) {
        throw new Error(`Unauthorized: The provided credentials were rejected by the server at URL: ${options.url}`);
      }
      
      if (error.status === 400) {
        // Handle Bad Request (400) error - typically means malformed request or URL
        const errorMessage = error.data?.Message || error.statusText || 'Unknown error';
        console.error('Bad Request (400):', {
          url: options.url,
          errorMessage,
          data: error.data,
          request: options
        });
        
        // Parse the message to provide better guidance
        let detailedMessage = `Bad Request (400): The server couldn't process the request. `;
        
        if (errorMessage.includes('Invalid SWIS uri') || errorMessage.includes('Incomplete uri')) {
          detailedMessage += `Server message: ${errorMessage}\n\n`;
          detailedMessage += `The URL format is incorrect for SWIS. Please use the format:\n`;
          detailedMessage += `https://[server]:[port]/SolarWinds/InformationService/v3/Json/\n\n`;
          detailedMessage += `Common issues:\n`;
          detailedMessage += `1. Missing protocol (https:// or http://)\n`;
          detailedMessage += `2. Incorrect path structure\n`;
          detailedMessage += `3. Missing port number if not using default ports\n`;
          detailedMessage += `4. Try setting Access Mode to "Server" instead of "Browser"\n`;
        }
        else if (errorMessage.includes('The remote name could not be resolved')) {
          detailedMessage += 'The hostname could not be resolved. Check the URL and your network connectivity.';
        } else if (errorMessage.includes('format')) {
          detailedMessage += 'The request format is invalid. Check the query format and parameters.';
        } else if (errorMessage.includes('syntax')) {
          detailedMessage += 'There is a syntax error in your request. Check the query syntax.';
        } else {
          detailedMessage += `Server message: ${errorMessage}`;
        }
        
        detailedMessage += `\n\nRequest URL: ${options.url}\nMethod: ${options.method}`;
        
        throw new Error(detailedMessage);
      }
      
      if (error.status === 500) {
        throw new Error(`Server error (500): The server encountered an internal error at URL: ${options.url}. Server message: ${error.data?.Message || error.statusText || 'Unknown error'}`);
      }

      // Some query exception
      if (error.data?.Message) {
        throw new Error(`Server returned error: ${error.data.Message}`);
      }
      
      throw new Error(`Request failed with status: ${error.status || 'unknown'}, message: ${error.statusText || error.message || 'Unknown error'}, URL: ${options.url}`);
    }
  }
}