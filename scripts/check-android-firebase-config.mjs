import fs from 'node:fs';
import path from 'node:path';

const expectedPackage = 'com.dkimoto.nomi';
const configPath = path.resolve('google-services.json');

if (!fs.existsSync(configPath)) {
  console.error(`Missing ${configPath}`);
  console.error('Download it from Firebase Console after adding the Android app package com.dkimoto.nomi.');
  process.exit(1);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error(`Could not parse ${configPath}: ${error.message}`);
  process.exit(1);
}

const clients = Array.isArray(config.client) ? config.client : [];
const androidClient = clients.find((client) => (
  client?.client_info?.android_client_info?.package_name === expectedPackage
));

if (!androidClient) {
  console.error(`google-services.json does not contain Android package ${expectedPackage}.`);
  process.exit(1);
}

const oauthClients = Array.isArray(androidClient.oauth_client) ? androidClient.oauth_client : [];
const androidOauthClients = oauthClients.filter((client) => client.client_type === 1);
const webOauthClient = oauthClients.find((client) => client.client_type === 3);

if (!androidOauthClients.length) {
  console.error('No Android OAuth client found. Add SHA-1/SHA-256 fingerprints in Firebase, then download google-services.json again.');
  process.exit(1);
}

if (!webOauthClient?.client_id) {
  console.error('No Web OAuth client found. Google Sign-In needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID from Firebase/Google Cloud.');
  process.exit(1);
}

const hashes = androidOauthClients
  .map((client) => client.android_info?.certificate_hash)
  .filter(Boolean);

console.log('Android Firebase config looks ready.');
console.log(`Package: ${expectedPackage}`);
console.log(`Project: ${config.project_info?.project_id || 'unknown'}`);
console.log(`Android OAuth clients: ${androidOauthClients.length}`);
console.log(`Certificate hashes: ${hashes.length ? hashes.join(', ') : 'present in Firebase but not listed'}`);
console.log(`Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=${webOauthClient.client_id}`);
