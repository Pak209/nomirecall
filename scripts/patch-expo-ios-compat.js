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

const permissionsServicePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-modules-core',
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'adapters',
  'react',
  'permissions',
  'PermissionsService.kt',
);

if (fs.existsSync(permissionsServicePath)) {
  const before = '        return requestedPermissions.contains(permission)';
  const after = '        return requestedPermissions?.contains(permission) == true';
  const source = fs.readFileSync(permissionsServicePath, 'utf8');
  if (source.includes(before)) {
    fs.writeFileSync(permissionsServicePath, source.replace(before, after));
    console.log('Patched expo-modules-core Android permission nullability.');
  }
}
