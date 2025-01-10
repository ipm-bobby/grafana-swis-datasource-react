import { DataSourcePlugin } from '@grafana/data';
import { SwisDataSource } from './datasource';
import { ConfigEditor } from './components/ConfigEditor';
import { SWISQuery, SWISDataSourceOptions } from './types';

export const plugin = new DataSourcePlugin<SwisDataSource, SWISQuery, SWISDataSourceOptions>(
  SwisDataSource
).setConfigEditor(ConfigEditor);
