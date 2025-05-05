import React, { useState, useEffect } from 'react';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { 
  CodeEditor, 
  InlineField, 
  Select, 
  Button, 
  Alert, 
  useTheme2, 
  Icon, 
  HorizontalGroup,
  VerticalGroup
} from '@grafana/ui';
import { SwisDatasource } from '../datasource';
import { SwisDataSourceOptions, SwisQuery, defaultQuery, getDefaultTableQuery } from '../types';
import '../styles/QueryEditor.css';

type Props = QueryEditorProps<SwisDatasource, SwisQuery, SwisDataSourceOptions>;

export function QueryEditor({ query, onChange, onRunQuery, datasource, data }: Props) {
  const theme = useTheme2();
  const [showLastQuerySQL, setShowLastQuerySQL] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [lastQueryMeta, setLastQueryMeta] = useState<any>(null);
  const [lastQueryError, setLastQueryError] = useState<string | null>(null);
  
  // Event subscription from the datasource
  useEffect(() => {
    console.log('Setting up event subscription for query', query.refId);
    
    const subscription = datasource.events.subscribe({
      next: (event) => {
        console.log('Received event from datasource:', event);
        
        if (event.type === 'data-received') {
          if (event.payload.refId === query.refId) {
            console.log('Received data for this query:', event.payload);
            setLastQueryMeta(event.payload.meta);
            setLastQueryError(null);
          }
        } else if (event.type === 'data-error') {
          if (event.payload.refId === query.refId) {
            console.log('Received error for this query:', event.payload);
            setLastQueryMeta(event.payload.meta);
            setLastQueryError(event.payload.error);
          } else if (!event.payload.refId) {
            // Handle global errors without refId
            console.log('Received global error:', event.payload);
            setLastQueryError(event.payload.error);
          }
        }
      },
      error: (err) => {
        console.error('Error in datasource event subscription:', err);
        setLastQueryError('Error in event subscription: ' + String(err));
      }
    });
    
    return () => {
      console.log('Cleaning up event subscription');
      subscription.unsubscribe();
    };
  }, [datasource, query.refId]);
  
  // Panel type detection and default query setting (similar to Angular implementation)
  useEffect(() => {
    console.log('Current query state in useEffect:', query);
    
    // Initialize a clean query object with default values to prevent undefined errors
    const initQuery = () => {
      // Get default format based on panel type - default to time_series if unknown
      const defaultFormat = data?.request?.targets[0]?.grafana?.panel?.type === 'table' ? 'table' : 'time_series';
      
      // Ensure all required fields have values to prevent "undefined" errors
      const newQuery = {
        ...query,
        format: query.format || defaultFormat,
        rawSql: query.rawSql !== undefined ? query.rawSql : defaultQuery.rawSql,
        refId: query.refId || 'A'
      };
      
      console.log('Initializing query with defaults:', newQuery);
      onChange(newQuery);
    };
    
    // Always ensure the format is explicitly set
    if (query.format === undefined) {
      console.log('Format is undefined, initializing with defaults');
      initQuery();
      return; // Skip further processing until next render with initialized values
    }
    
    // If the query exists but has issues with 'DESCSELECT' or other trailing content, clean it up
    if (typeof query.rawSql === 'string' && query.rawSql.includes('DESCSELECT')) {
      console.log('Found DESCSELECT issue in query, cleaning...');
      const cleanedQuery = query.rawSql.replace(/DESC\s*SELECT/i, 'DESC');
      onChange({
        ...query,
        rawSql: cleanedQuery,
      });
    }
    
  }, [data?.request?.targets]);
  
  // Separate useEffect for format changes via panel type
  useEffect(() => {
    // Skip if format is not yet defined
    if (query.format === undefined) {
      return;
    }
    
    const isTablePanel = data?.request?.targets[0]?.grafana?.panel?.type === 'table';
    const currentFormat = query.format;
    
    // Only update if there's a mismatch, to avoid loops
    if (isTablePanel && currentFormat !== 'table') {
      console.log('Panel is table but format is', currentFormat, ', updating to table');
      onChange({ ...query, format: 'table' });
    } else if (!isTablePanel && currentFormat !== 'time_series' && currentFormat !== 'table') {
      // Only change if it's not specifically set to table (allow user override)
      console.log('Panel is not table and format is', currentFormat, ', updating to time_series');
      onChange({ ...query, format: 'time_series' });
    }
  }, [query.format, data?.request?.targets]);

  const formats: Array<SelectableValue<string>> = [
    { label: 'Time series', value: 'time_series' },
    { label: 'Table', value: 'table' },
  ];

  // Simple event handlers similar to Angular version
  const onFormatChange = (value: SelectableValue<string>) => {
    const newFormat = value.value || 'time_series';
    console.log(`Format changing from ${query.format} to ${newFormat}`);
    
    // Force this value rather than going through the normal update
    // to avoid any panel type detection logic overriding it
    let updatedQuery: SwisQuery = { 
      ...query, 
      format: newFormat
    };
    
    // If switching to table format and query is empty, provide a default table query
    if (newFormat === 'table' && (!query.rawSql || query.rawSql.trim() === '')) {
      const tableQuery = getDefaultTableQuery();
      updatedQuery.rawSql = tableQuery.rawSql;
    }
    
    // Ensure we're adding required fields to avoid undefined issues
    if (!updatedQuery.refId) {
      updatedQuery.refId = 'A';
    }
    
    console.log(`Final query object after format change:`, updatedQuery);
    onChange(updatedQuery);
    
    // Run the query with a slight delay to ensure state updates first
    setTimeout(() => {
      onRunQuery();
    }, 50);
  };

  const onQueryBlur = () => {
    // Validate query for basic errors before running
    validateQuery(query.rawSql || '');
    onRunQuery();
  };
  
  const onRunQueryClick = () => {
    // Validate query for basic errors before running
    validateQuery(query.rawSql || '');
    onRunQuery();
  };
  
  // Basic query validation to catch common errors
  const validateQuery = (sql: string) => {
    // Check for multiple statements (common copy/paste error)
    if (sql.toLowerCase().includes('select') && sql.toLowerCase().indexOf('select') !== sql.toLowerCase().lastIndexOf('select')) {
      console.warn('Multiple SELECT statements detected in query. This may cause errors.');
      setLastQueryError('Warning: Multiple SELECT statements detected. Please ensure you have only one query.');
      return false;
    }
    
    // Reset error state if validation passes
    setLastQueryError(null);
    return true;
  };

  return (
    <div style={{ width: '100%', padding: '10px' }}>
      {/* Main container with explicit width */}
      <div style={{ 
        width: '100%', 
        minWidth: '600px', 
        display: 'flex', 
        flexDirection: 'column',
        gap: '15px'
      }}>
        {/* Query editor container with border */}
        <div style={{ 
          width: '100%', 
          minWidth: '600px',
          border: '1px solid #ccc', 
          borderRadius: '4px',
          padding: '5px'
        }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            SWQL Query
          </label>
          
          {/* Simple textarea implementation for SQL editing with dark mode */}
          <div className="sql-editor-wrapper" style={{ width: '100%', position: 'relative' }}>
            <textarea
              className="gf-form-input sql-editor"
              style={{
                width: '100%',
                height: '200px',
                fontFamily: 'monospace',
                padding: '8px',
                border: '1px solid #444',
                borderRadius: '4px',
                resize: 'vertical',
                backgroundColor: '#111',
                color: '#ddd',
                lineHeight: '1.5',
                fontSize: '14px',
                tabSize: '2',
                position: 'relative',
                zIndex: 2,
                overflowY: 'auto',
                overflowX: 'auto',
                whiteSpace: 'pre'
              }}
              value={query.rawSql !== undefined ? query.rawSql : ''}
              onChange={(e) => {
                console.log('SQL query changed:', e.target.value);
                let newValue = e.target.value;
                
                // Check for pasting multiple queries - detect and fix DESCSELECT issue
                if (newValue.toUpperCase().includes('DESCSELECT')) {
                  console.log('Detected DESCSELECT in pasted text, fixing...');
                  newValue = newValue.replace(/DESC\s*SELECT/i, 'DESC\n\n-- SELECT');
                  setLastQueryError('Warning: Detected multiple queries. Second query has been commented out.');
                }
                
                // Allow completely empty query
                onChange({ ...query, rawSql: newValue });
                
                // Clear any error messages when the user is typing
                if (lastQueryError && !newValue.toUpperCase().includes('DESCSELECT')) {
                  setLastQueryError(null);
                }
              }}
              onBlur={onQueryBlur}
              spellCheck={false}
              autoComplete="off"
              data-mode="sql"
              placeholder="Insert your SWQL query here, for example:
SELECT
  downsample(ObservationTimeStamp) as time,
  n.Caption,
  AVG(AvgLoad) as CpuLoad,
  AVG(AvgMemoryUsed/100) as MemoryUsed
FROM Orion.CPULoad c
JOIN Orion.Nodes n ON n.NodeID = c.NodeID
WHERE ObservationTimeStamp BETWEEN $from AND $to
GROUP BY downsample(ObservationTimeStamp), n.Caption, n.NodeID
ORDER BY time DESC"
              wrap="off"
            />
          </div>
        </div>

        {/* Controls section */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <InlineField label="Format as" labelWidth={16}>
            <Select
              options={formats}
              value={formats.find(f => f.value === query.format) || formats[0]}
              onChange={onFormatChange}
              width={16}
              menuPlacement="bottom"
            />
          </InlineField>
          {/* Debug display of current format */}
          <div style={{ display: 'none' }}>
            Current format: {query.format || 'undefined'}
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={onRunQueryClick}
            icon="play"
          >
            Run Query
          </Button>
          
          
          <Button
            variant="secondary"
            size="md"
            onClick={() => setShowHelp(!showHelp)}
            icon={showHelp ? 'angle-down' : 'angle-right'}
          >
            Show Help
          </Button>

          {lastQueryMeta && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => setShowLastQuerySQL(!showLastQuerySQL)}
              icon={showLastQuerySQL ? 'angle-down' : 'angle-right'}
            >
              Generated SWQL
            </Button>
          )}
        </div>

        {/* Generated SQL Display */}
        {showLastQuerySQL && lastQueryMeta && (
          <div style={{ 
            width: '100%', 
            border: '1px solid #ddd', 
            borderRadius: '4px',
            padding: '10px',
            backgroundColor: 'rgba(0,0,0,0.05)'
          }}>
            <h6 style={{ marginTop: 0, marginBottom: '8px' }}>Last Executed Query:</h6>
            <pre style={{
              margin: 0,
              padding: '10px',
              backgroundColor: 'rgba(0,0,0,0.1)',
              borderRadius: '4px',
              overflow: 'auto',
              maxHeight: '200px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}>{lastQueryMeta.sql}</pre>
          </div>
        )}

        {/* Help Section */}
        {showHelp && (
          <div style={{ 
            width: '100%', 
            border: '1px solid #ddd', 
            borderRadius: '4px',
            padding: '10px',
            backgroundColor: 'rgba(0,0,0,0.05)'
          }}>
            <h5 style={{ marginTop: 0, marginBottom: '8px' }}>SWIS Query Help</h5>
            <pre style={{
              margin: 0,
              padding: '10px',
              backgroundColor: 'rgba(0,0,0,0.1)',
              borderRadius: '4px',
              overflow: 'auto',
              maxHeight: '300px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}>
{`Time series:
Write SWQL queries to be used as Metric series or regular table. For Series there has to be defined time column. 
As metric is taken first string column or next data column in row. In case there's multiple data columns, each column is taken as metric suffix

Optional:
  - return column named metric to represent the series name.
  - If multiple value columns are returned the metric column is used as prefix.
  - If no column named metric is found the column name of the value column is used as series name

Table:
- return any set of columns

Grafana macros to use:
- $from - time interval start
- $to - time interval end

Time Series:
- for sampling you must use function downsample([timecolumn]). TimeInterval is used from grafanata $__interval variable
- you must also sort result by time

Example time series query:
SELECT
     downsample(ObservationTimeStamp) as time,
     a.Node.Caption,
     AVG(AvgLoad) as CpuLoad,
     AVG(AvgMemoryUsed) as MemoryUsed
FROM Orion.CPULoad a
WHERE ObservationTimeStamp BETWEEN $from AND $to
GROUP BY downsample(ObservationTimeStamp), a.Node.Caption, a.NodeID
ORDER BY time DESC`}
            </pre>
          </div>
        )}

        {/* Error Display */}
        {lastQueryError && (
          <div style={{ width: '100%' }}>
            <Alert title="Query Error" severity="error">
              <pre style={{
                margin: 0,
                padding: '10px',
                overflow: 'auto',
                maxHeight: '200px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}>{lastQueryError}</pre>
            </Alert>
          </div>
        )}
      </div>
    </div>
  );
}