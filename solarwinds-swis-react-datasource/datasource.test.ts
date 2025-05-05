import { SwisDatasource } from './datasource';
import { SwisQuery, SwisDataSourceOptions } from './types';
import { DataSourceInstanceSettings, PluginType } from '@grafana/data';
import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';

jest.mock('@grafana/runtime', () => ({
  getBackendSrv: jest.fn(),
  getTemplateSrv: jest.fn(() => ({
    replace: jest.fn((str) => str),
  })),
}));

describe('SwisDatasource', () => {
  let ds: SwisDatasource;
  const mockBackendSrv = {
    fetch: jest.fn().mockReturnValue({
      toPromise: jest.fn().mockResolvedValue({ data: [] }),
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getBackendSrv as jest.Mock).mockImplementation(() => mockBackendSrv);

    const instanceSettings: DataSourceInstanceSettings<SwisDataSourceOptions> = {
      id: 1,
      uid: 'test',
      type: 'solarwinds-swis-datasource',
      name: 'Test',
      access: 'direct',
      meta: {
        id: 'solarwinds-swis-datasource',
        name: 'SolarWinds SWIS DataSource',
        type: PluginType.datasource,
        info: {
          author: {
            name: 'Eduard Tichy',
          },
          description: 'DataSource plugin for SolarWinds via SWIS HTTP REST endpoint',
          links: [],
          logos: {
            small: 'img/solarwinds-icon.svg',
            large: 'img/solarwinds-icon.svg',
          },
          screenshots: [],
          updated: '',
          version: '',
        },
        module: '',
        baseUrl: '',
      },
      jsonData: {},
      url: 'https://localhost:17778/SolarWinds/InformationService/v3/Json/',
    };

    ds = new SwisDatasource(instanceSettings);
  });

  it('should be instantiable', () => {
    expect(ds).toBeDefined();
  });

  describe('testDatasource', () => {
    it('should return success when the API responds with 200', async () => {
      mockBackendSrv.fetch.mockReturnValueOnce({
        toPromise: jest.fn().mockResolvedValue({ status: 200 }),
      });

      const result = await ds.testDatasource();
      expect(result.status).toBe('success');
    });
  });
});