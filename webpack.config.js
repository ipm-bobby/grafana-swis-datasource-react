// This is a simple proxy file that loads the actual webpack config
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    target: 'es2015',
  },
});

// Load the actual webpack config
module.exports = require('./.config/webpack/webpack.config.ts');