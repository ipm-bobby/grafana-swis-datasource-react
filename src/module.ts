import { DataSourcePlugin } from '@grafana/data';
import { SwisDatasource } from './datasource';
import { ConfigEditor } from './components/ConfigEditor';
import { QueryEditor } from './components/QueryEditor';
import { AnnotationQueryEditor } from './components/AnnotationQueryEditor';
import { SwisQuery, SwisDataSourceOptions } from './types';

export const plugin = new DataSourcePlugin<SwisDatasource, SwisQuery, SwisDataSourceOptions>(SwisDatasource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor)
  .setAnnotationQueryCtrl(AnnotationQueryEditor);