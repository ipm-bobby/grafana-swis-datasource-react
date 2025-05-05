import React from 'react';
import { DataSourceHttpSettings, InlineField, Input, SecretInput, Select } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps, SelectableValue } from '@grafana/data';
import { SwisDataSourceOptions, SwisSecureJsonData } from '../types';

// Access options match the standard Grafana options
export enum DataSourceAccess {
  Server = 'proxy',
  Browser = 'direct',
}

const ACCESS_OPTIONS: Array<SelectableValue<DataSourceAccess>> = [
  {
    label: 'Server (default)',
    value: DataSourceAccess.Server,
    description:
      'All requests will be made from the browser to Grafana backend/server which will forward the requests to the data source.',
  },
  {
    label: 'Browser',
    value: DataSourceAccess.Browser,
    description: 'All requests will be made from the browser directly to the data source.',
  },
];

export function ConfigEditor(props: DataSourcePluginOptionsEditorProps<SwisDataSourceOptions, SwisSecureJsonData>) {
  const { onOptionsChange, options } = props;
  
  // Handle Access option change
  const onAccessChange = (access: SelectableValue<DataSourceAccess>) => {
    const jsonData = {
      ...options.jsonData,
    };

    onOptionsChange({
      ...options,
      access: access.value as DataSourceAccess,
      jsonData,
    });
  };

  // Secure field (only sent to the backend)
  const onPasswordChange = (event: React.SyntheticEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        ...options.secureJsonData,
        password: event.currentTarget.value,
      },
    });
  };

  const onResetPassword = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: {
        ...options.secureJsonFields,
        password: false,
      },
      secureJsonData: {
        ...options.secureJsonData,
        password: '',
      },
    });
  };

  const onUsernameChange = (event: React.SyntheticEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        username: event.currentTarget.value,
      },
    });
  };

  const { jsonData, secureJsonFields } = options;
  const secureJsonData = (options.secureJsonData || {}) as SwisSecureJsonData;

  return (
    <>
      <DataSourceHttpSettings
        defaultUrl="https://localhost:17774/SolarWinds/InformationService/v3/Json/"
        dataSourceConfig={options}
        showAccessOptions={true}
        onChange={onOptionsChange}
      />
      
      {/* Add Access option dropdown */}
      <h3 className="page-heading">Connection Settings</h3>
      <div className="gf-form-group">
        <div className="gf-form-inline">
          <div className="gf-form">
            <InlineField
              label="Access"
              tooltip="How Grafana should access the SolarWinds SWIS service"
              labelWidth={10}
            >
              <Select
                value={ACCESS_OPTIONS.find((o) => o.value === options.access) || ACCESS_OPTIONS[0]}
                options={ACCESS_OPTIONS}
                onChange={onAccessChange}
                width={40}
              />
            </InlineField>
          </div>
        </div>
      </div>
      
    </>
  );
}