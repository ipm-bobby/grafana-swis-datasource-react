// src/components/ConfigEditor.tsx

import React from 'react';
import { InlineField, Input, SecretInput } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { SWISDataSourceOptions, SWISSecureJsonData } from '../types';

interface Props extends DataSourcePluginOptionsEditorProps<SWISDataSourceOptions, SWISSecureJsonData> {}

export const ConfigEditor: React.FC<Props> = ({ options, onOptionsChange }) => {
  const { jsonData, secureJsonData } = options;

  // Quando cambia la baseUrl
  const onBaseUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        baseUrl: event.target.value,
      },
    });
  };

  // Se usi password/secureJsonData
  const onPasswordChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        ...secureJsonData,
        password: event.target.value,
      },
    });
  };

  return (
    <div className="gf-form-group">
      <InlineField label="Base URL" labelWidth={12}>
        <Input value={jsonData.baseUrl || ''} onChange={onBaseUrlChange} width={40} />
      </InlineField>

      <InlineField label="Password" labelWidth={12}>
        <SecretInput
          value={secureJsonData?.password || ''}
          isConfigured={false}
          onChange={onPasswordChange}
          onReset={() => {
            // Esempio: se vuoi resettare il valore password quando l'utente clicca il pulsante di reset
            onOptionsChange({
              ...options,
              secureJsonData: {
                ...secureJsonData,
                password: '',
              },
            });
          }}
          width={40}
        />
      </InlineField>
    </div>
  );
};
