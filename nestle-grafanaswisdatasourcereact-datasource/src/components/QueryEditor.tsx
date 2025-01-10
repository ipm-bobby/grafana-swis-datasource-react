// src/components/QueryEditor.tsx

import React, { ChangeEvent } from 'react';
import { QueryEditorProps } from '@grafana/data';
import { SwisDataSource } from '../datasource';
import { SWISQuery, SWISDataSourceOptions } from '../types';

type Props = QueryEditorProps<SwisDataSource, SWISQuery, SWISDataSourceOptions>;

export const QueryEditor: React.FC<Props> = ({ query, onChange, onRunQuery }) => {
  const onRawSqlChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...query, rawSql: event.target.value });
    // Chiamando onRunQuery() dici a Grafana di rivalutare il pannello
    onRunQuery();
  };

  return (
    <div className="gf-form-group">
      <div className="gf-form-inline">
        <label>SWQL Query:</label>
        <input type="text" value={query.rawSql || ''} onChange={onRawSqlChange} />
      </div>
    </div>
  );
};
