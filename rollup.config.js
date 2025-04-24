import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json'));

export default {
  input: 'src/module.ts',
  output: {
    file: 'dist/module.js',
    format: 'amd',
    sourcemap: true,
  },
  external: [
    'react',
    'react-dom',
    '@grafana/data',
    '@grafana/ui',
    '@grafana/runtime',
    'lodash',
  ],
  plugins: [
    resolve(),
    commonjs(),
    typescript({
      compilerOptions: {
        declaration: false,
      },
    }),
    terser(),
    {
      name: 'copy-assets',
      generateBundle() {
        // Copy plugin.json to dist
        const pluginJson = readFileSync('src/plugin.json', 'utf8');
        this.emitFile({
          type: 'asset',
          fileName: 'plugin.json',
          source: pluginJson,
        });
        
        // Copy SVG icon to dist/img
        const svg = readFileSync('src/img/solarwinds-icon.svg', 'utf8');
        this.emitFile({
          type: 'asset',
          fileName: 'img/solarwinds-icon.svg',
          source: svg,
        });
        
        // Copy README.md to dist
        try {
          const readme = readFileSync('README.md', 'utf8');
          this.emitFile({
            type: 'asset',
            fileName: 'README.md',
            source: readme,
          });
        } catch (e) {
          console.warn('README.md not found');
        }
      }
    }
  ]
};