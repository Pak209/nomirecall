const fs = require('fs');
const path = require('path');

const devMenuPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-dev-menu',
  'ios',
  'DevMenuViewController.swift',
);

if (fs.existsSync(devMenuPath)) {
  const before = '    let isSimulator = TARGET_IPHONE_SIMULATOR > 0';
  const after = [
    '    #if targetEnvironment(simulator)',
    '    let isSimulator = true',
    '    #else',
    '    let isSimulator = false',
    '    #endif',
  ].join('\n');

  const source = fs.readFileSync(devMenuPath, 'utf8');
  if (source.includes(before)) {
    fs.writeFileSync(devMenuPath, source.replace(before, after));
    console.log('Patched expo-dev-menu for Swift simulator detection.');
  }
}
