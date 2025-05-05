import { QueryCtrl } from 'grafana/app/plugins/sdk';
import _ from 'lodash';
import './styles/QueryEditor.css';

const defaultQuery = `SELECT TOP 5
     LastSync, 
     Caption,
     CPULoad, 
     ResponseTime 
FROM
     Orion.Nodes`;

export class SwisQueryCtrl extends QueryCtrl {
  static templateUrl = 'partials/query.editor.html';
  formats: any[];
  lastQueryMeta: any;
  lastQueryError: string;
  showHelp: boolean;

  /** @ngInject */
  constructor($scope: any, $injector: any) {
    super($scope, $injector);

    this.target.format = this.target.format || 'time_series';
    this.target.alias = '';
    this.formats = [{ text: 'Time series', value: 'time_series' }, { text: 'Table', value: 'table' }];

    if (!this.target.rawSql) {
      // special handling when in table panel
      if (this.panelCtrl.panel.type === 'table') {
        this.target.format = 'table';
        this.target.rawSql = 'SELECT 1';
      } else {
        this.target.rawSql = defaultQuery;
      }
    }

    this.panelCtrl.events.on('data-received', this.onDataReceived.bind(this), $scope);
    this.panelCtrl.events.on('data-error', this.onDataError.bind(this), $scope);
  }

  onDataReceived(dataList: any) {
    this.lastQueryMeta = null;
    this.lastQueryError = null;

    const anySeriesFromQuery = _.find(dataList, { refId: this.target.refId });
    if (anySeriesFromQuery) {
      this.lastQueryMeta = anySeriesFromQuery.meta;
    }
  }

  onDataError(err: any) {
    if (err.data && err.data.results) {
      const queryRes = err.data.results[this.target.refId];
      if (queryRes) {
        this.lastQueryMeta = queryRes.meta;
        this.lastQueryError = queryRes.error;
      }
    }
  }
}