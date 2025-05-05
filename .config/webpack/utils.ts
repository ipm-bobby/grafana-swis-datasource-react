import fs from 'fs';
import process from 'process';
import os from 'os';
import path from 'path';
import { glob } from 'glob';
import { SOURCE_DIR } from './constants';

export function isWSL() {
  if (process.platform !== 'linux') {
    return false;
  }

  if (os.release().toLowerCase().includes('microsoft')) {
    return true;
  }

  try {
    return fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

export function getPackageJson() {
  return require(path.resolve(process.cwd(), 'package.json'));
}

export function getPluginJson() {
  return require(path.resolve(process.cwd(), `${SOURCE_DIR}/plugin.json`));
}

export function getCPConfigVersion() {
  const cprcJson = path.resolve(__dirname, '../', '.cprc.json');
  return fs.existsSync(cprcJson) ? require(cprcJson).version : { version: 'unknown' };
}

export function hasReadme() {
  return fs.existsSync(path.resolve(process.cwd(), SOURCE_DIR, 'README.md'));
}

// Support bundling nested plugins by finding all plugin.json files in src directory
// then checking for a sibling module.[jt]sx? file.
export async function getEntries(): Promise<Record<string, string>> {
  const entries: Record<string, string> = {};
  
  // Find all plugin.json files
  const pluginJsonPaths = await glob('**/src/**/plugin.json', { absolute: true });
  
  // Process each plugin.json file
  for (const pluginJsonPath of pluginJsonPaths) {
    const folder = path.dirname(pluginJsonPath);
    
    // Find matching module files
    const moduleFiles = await glob(`${folder}/module.{ts,tsx,js,jsx}`, { absolute: true });
    
    // Add each module file to entries
    for (const moduleFile of moduleFiles) {
      const pluginPath = path.dirname(moduleFile);
      const pluginName = path.relative(process.cwd(), pluginPath).replace(/src\/?/i, '');
      const entryName = pluginName === '' ? 'module' : `${pluginName}/module`;
      
      entries[entryName] = moduleFile;
    }
  }
  
  return entries;
}
