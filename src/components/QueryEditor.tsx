import React, { useState } from 'react';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { CodeEditor, InlineField, Select, Button, Alert, useTheme2 } from '@grafana/ui';
import { SwisDatasource } from '../datasource';
import { SwisDataSourceOptions, SwisQuery, defaultQuery } from '../types';
import '../styles/QueryEditor.css';

type Props = QueryEditorProps<SwisDatasource, SwisQuery, SwisDataSourceOptions>;

export function QueryEditor({ query, onChange, onRunQuery, datasource }: Props) {
  const theme = useTheme2();
  const [showLastQuerySQL, setShowLastQuerySQL] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [lastQueryMeta, setLastQueryMeta] = useState<any>(null);
  const [lastQueryError, setLastQueryError] = useState<string | null>(null);

  const formats: Array<SelectableValue<string>> = [
    { label: 'Time series', value: 'time_series' },
    { label: 'Table', value: 'table' },
  ];

  // Initialize query with defaults if needed
  const swisQuery = {
    ...defaultQuery,
    ...query,
  };

  const onFormatChange = (value: SelectableValue<string>) => {
    onChange({ ...swisQuery, format: value.value || 'time_series' });
    onRunQuery();
  };

  const onSqlChange = (value: string) => {
    onChange({ ...swisQuery, rawSql: value });
  };

  const onQueryBlur = () => {
    onRunQuery();
  };

  return (
    <div className="gf-form-inline">
      <div className="gf-form-inline">
        <div className="gf-form gf-form--grow">
          <CodeEditor
            language="sql"
            value={swisQuery.rawSql || ''}
            onBlur={onQueryBlur}
            onChange={onSqlChange}
            height="200px"
            showMiniMap={false}
            showLineNumbers={true}
          />
        </div>
      </div>

      <div className="gf-form-inline">
        <InlineField label="Format as" labelWidth={16}>
          <Select
            options={formats}
            value={formats.find(f => f.value === swisQuery.format)}
            onChange={onFormatChange}
            width={16}
          />
        </InlineField>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowHelp(!showHelp)}
          icon={showHelp ? 'angle-down' : 'angle-right'}
        >
          Show Help
        </Button>

        {lastQueryMeta && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowLastQuerySQL(!showLastQuerySQL)}
            icon={showLastQuerySQL ? 'angle-down' : 'angle-right'}
          >
            Generated SWQL
          </Button>
        )}
      </div>

      {showLastQuerySQL && lastQueryMeta && (
        <div className="gf-form">
          <pre className="gf-form-pre">{lastQueryMeta.sql}</pre>
        </div>
      )}

      {showHelp && (
        <Alert title="SWIS Query Help" severity="info">
          <pre>
            {`Time series:
Write SWQL queries to be used as Metric series or regular table. For Series there has to be defined time column. 
As metric is taken first string column or next data column in row. In case there's multiple data columns, each column is taken as metrix suffix

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
        </Alert>
      )}

      {lastQueryError && (
        <Alert title="Query Error" severity="error">
          {lastQueryError}
        </Alert>
      )}
    </div>
  );
}