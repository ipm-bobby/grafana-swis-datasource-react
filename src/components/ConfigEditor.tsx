import React from 'react';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { InlineField, InlineFieldRow, Input, Switch, SecretInput } from '@grafana/ui';
import { SWISDataSourceOptions, SWISSecureJsonData } from '../types';

interface Props extends DataSourcePluginOptionsEditorProps<SWISDataSourceOptions, SWISSecureJsonData> {}

export const ConfigEditor: React.FC<Props> = ({ options, onOptionsChange }) => {
  const { jsonData } = options;

  console.log(options);

  const onUpdateJsonData = <T extends keyof SWISDataSourceOptions>(key: T, value: SWISDataSourceOptions[T]) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        [key]: value,
      },
    });
  };

  const onPasswordReset = () => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        password: '',
      },
    });
  };

  return (
    <div className="gf-form-group">
      <h3 className="page-heading">HTTP</h3>

      <InlineFieldRow>
        <InlineField label="URL" labelWidth={12} tooltip="Endpoint SWIS">
          <Input
            value={jsonData.baseUrl ?? ''}
            width={40}
            placeholder="https://localhost:17778/SolarWinds/InformationService/v3/Json/"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              onUpdateJsonData('baseUrl', e.currentTarget.value);
            }}
          />
        </InlineField>

        <InlineField label="Timeout (sec)" labelWidth={15}>
          <Input
            type="number"
            width={12}
            value={jsonData.timeout ?? ''}
            placeholder="60"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              onUpdateJsonData('timeout', Number(e.currentTarget.value));
            }}
          />
        </InlineField>
      </InlineFieldRow>

      <h3 className="page-heading">Auth</h3>

      <InlineField label="Basic Auth" labelWidth={12}>
        <Switch
          value={!!jsonData.basicAuth}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            onUpdateJsonData('basicAuth', e.currentTarget.checked);
          }}
        />
      </InlineField>

      {jsonData.basicAuth && (
        <div
          style={{
            marginTop: '8px',
            marginBottom: '16px',
            paddingLeft: '16px',
            borderLeft: '1px solid var(--in-content-divider)',
          }}
        >
          <h4 className="page-heading">Basic Auth Details</h4>

          <InlineFieldRow>
            <InlineField label="User" labelWidth={12}>
              <Input
                width={30}
                value={jsonData.user ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  onUpdateJsonData('user', e.currentTarget.value);
                }}
              />
            </InlineField>

            <InlineField label="Password" labelWidth={12}>
              <SecretInput
                width={30}
                isConfigured={(jsonData?.password && jsonData?.password?.length >= 8) || false}
                value={jsonData?.password || ''}
                placeholder="password"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  onUpdateJsonData('password', e.currentTarget.value);
                }}
                onReset={onPasswordReset}
              />
            </InlineField>
          </InlineFieldRow>
        </div>
      )}
    </div>
  );
};
