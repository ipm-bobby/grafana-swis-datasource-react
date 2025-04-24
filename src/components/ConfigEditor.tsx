import React from 'react';
import { DataSourceHttpSettings } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { SwisDataSourceOptions, SwisSecureJsonData } from '../types';

export function ConfigEditor(props: DataSourcePluginOptionsEditorProps<SwisDataSourceOptions, SwisSecureJsonData>) {
  const { onOptionsChange, options } = props;

  return (
    <DataSourceHttpSettings
      defaultUrl="https://localhost:17778/SolarWinds/InformationService/v3/Json/"
      dataSourceConfig={options}
      onChange={onOptionsChange}
    />
  );
}