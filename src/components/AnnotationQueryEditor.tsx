import React from 'react';
import { Input, InlineField } from '@grafana/ui';

interface Props {
  query: string;
  onChange: (query: string) => void;
}

export const AnnotationQueryEditor = ({ query, onChange }: Props) => {
  return (
    <div className="gf-form-group">
      <h5 className="section-heading">Query</h5>
      <InlineField grow>
        <Input
          value={query || ''}
          onChange={e => onChange(e.currentTarget.value)}
          placeholder="Enter a SWQL query"
        />
      </InlineField>
    </div>
  );
};