import { DataSourcePlugin } from '@grafana/data';
import { SwisDataSource } from './datasource';
import { SWISQuery, SWISDataSourceOptions } from './types';

// Se vuoi aggiungere Editor di configurazione React, importalo qui:
// import { ConfigEditor } from './ConfigEditor';

export const plugin = new DataSourcePlugin<SwisDataSource, SWISQuery, SWISDataSourceOptions>(SwisDataSource);
// .setConfigEditor(ConfigEditor)  // Se vuoi un React component per la config
// .setQueryEditor(QueryEditor)    // Se vuoi un React component per editare la query
