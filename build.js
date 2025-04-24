const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Ensure directories exist
const dirs = ['dist', 'dist/img'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Copy static files
const filesToCopy = [
  { src: 'src/plugin.json', dest: 'dist/plugin.json' },
  { src: 'src/img/solarwinds-icon.svg', dest: 'dist/img/solarwinds-icon.svg' },
  { src: 'README.md', dest: 'dist/README.md' },
  { src: 'LICENSE', dest: 'dist/LICENSE' }
];

filesToCopy.forEach(file => {
  fs.copyFileSync(file.src, file.dest);
  console.log(`Copied ${file.src} to ${file.dest}`);
});

// Create a basic module.js file
const moduleJs = `define(['react', 'react-dom', '@grafana/data', '@grafana/ui', '@grafana/runtime'], function(React, ReactDOM, data, ui, runtime) {
  'use strict';
  
  // This is a simplified version for testing
  
  class SwisDatasource extends data.DataSourceApi {
    constructor(instanceSettings) {
      super(instanceSettings);
      this.url = instanceSettings.url || '';
      this.withCredentials = instanceSettings.withCredentials || false;
      this.headers = { 'Content-Type': 'application/json' };
      if (typeof instanceSettings.basicAuth === 'string' && instanceSettings.basicAuth.length > 0) {
        this.headers['Authorization'] = instanceSettings.basicAuth;
      }
    }
    
    async testDatasource() {
      try {
        const response = await runtime.getBackendSrv().fetch({
          url: this.url + '/Query?query=SELECT Description FROM System.NullEntity',
          method: 'GET',
          headers: this.headers,
          withCredentials: this.withCredentials
        }).toPromise();
        
        if (response.status === 200) {
          return {
            status: 'success',
            message: 'Data source is working :)',
            title: 'Success'
          };
        }
        
        return {
          status: 'error',
          message: \`Error connecting to SWIS: \${response.statusText}\`,
          title: 'Error'
        };
      } catch (err) {
        return {
          status: 'error',
          message: \`Error connecting to SWIS: \${err.message || 'Unknown error'}\`,
          title: 'Error'
        };
      }
    }
    
    async query(options) {
      const targets = options.targets.filter(t => !t.hide);
      
      if (targets.length === 0) {
        return { data: [] };
      }
      
      // For testing, return some dummy data
      const frame = new data.MutableDataFrame({
        refId: targets[0].refId,
        fields: [
          { name: 'Time', type: data.FieldType.time, values: [] },
          { name: 'Value', type: data.FieldType.number, values: [] }
        ],
      });
      
      // Add some test data points
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        frame.add({ 
          Time: now - (10 - i) * 1000, 
          Value: Math.random() * 100 
        });
      }
      
      return { data: [frame] };
    }
    
    async metricFindQuery(query) {
      // For template variables, return some test values
      return [
        { text: 'Server1', value: 1 },
        { text: 'Server2', value: 2 },
        { text: 'Server3', value: 3 }
      ];
    }
    
    applyTemplateVariables(query, scopedVars) {
      // Replace template variables in the query
      return query;
    }
  }
  
  // Config editor - uses Grafana's built-in HTTP settings component
  function ConfigEditor(props) {
    return React.createElement(ui.DataSourceHttpSettings, {
      defaultUrl: "https://localhost:17774/SolarWinds/InformationService/v3/Json/",
      dataSourceConfig: props.options,
      onChange: props.onOptionsChange
    });
  }
  
  // Query editor - simplified version
  function QueryEditor(props) {
    const { query, onChange, onRunQuery } = props;
    
    // Default query
    const q = query.rawSql || \`SELECT TOP 5
     LastSync, 
     Caption,
     CPULoad, 
     ResponseTime 
FROM
     Orion.Nodes\`;
    
    // Format options
    const formats = [
      { label: 'Time series', value: 'time_series' },
      { label: 'Table', value: 'table' }
    ];
    
    const onFormatChange = (value) => {
      onChange({ ...query, format: value.value });
      onRunQuery();
    };
    
    const onQueryChange = (value) => {
      onChange({ ...query, rawSql: value });
    };
    
    const onQueryBlur = () => {
      onRunQuery();
    };
    
    return React.createElement(React.Fragment, null, 
      React.createElement(ui.CodeEditor, {
        language: 'sql',
        value: q,
        onBlur: onQueryBlur,
        onChange: onQueryChange,
        height: '200px'
      }),
      React.createElement('div', { style: { marginTop: '10px' } },
        React.createElement(ui.InlineField, { label: 'Format as' },
          React.createElement(ui.Select, {
            options: formats,
            value: formats.find(f => f.value === query.format) || formats[0],
            onChange: onFormatChange,
            width: 16
          })
        )
      )
    );
  }
  
  // Register plugin
  const plugin = new data.DataSourcePlugin(SwisDatasource)
    .setConfigEditor(ConfigEditor)
    .setQueryEditor(QueryEditor);
  
  return { plugin };
});
`;

fs.writeFileSync('dist/module.js', moduleJs);
console.log('Created dist/module.js');

// Create a zip file of the dist directory
exec('cd dist && zip -r ../solarwinds-swis-react-datasource.zip *', (error, stdout, stderr) => {
  if (error) {
    console.error(`Error creating zip: ${error}`);
    return;
  }
  console.log(`Created solarwinds-swis-react-datasource.zip`);
});