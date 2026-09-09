// PM2 7 paths.js hardcodes Windows pipes after applying environment overrides.
// Load this in the client and daemon, without modifying vendor files.
const { createHash } = require('node:crypto');
if (!process.env.PM2_HOME) throw new Error('Forge PM2_HOME is required');
if (process.platform === 'win32') {
  const id = createHash('sha256').update(process.env.PM2_HOME.toLowerCase()).digest('hex').slice(0, 24);
  const constants = require('pm2/constants');
  constants.DAEMON_RPC_PORT = `\\\\.\\pipe\\forge-${id}-rpc`;
  constants.DAEMON_PUB_PORT = `\\\\.\\pipe\\forge-${id}-pub`;
  constants.INTERACTOR_RPC_PORT = `\\\\.\\pipe\\forge-${id}-interactor`;
  // pidusage falls back to PowerShell/WMI on Windows. Forge consumes lifecycle
  // state only; disable those optional host metrics rather than blocking RPC.
  const metrics = require.resolve('pidusage');
  require(metrics);
  require.cache[metrics].exports = (_pids, callback) => callback(null, {});
}
// Do not inject the PM2 adapter into application JVMs or Node services.
if (process.env.FORGE_PM2_PRELOAD) {
  process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS || '').replace(process.env.FORGE_PM2_PRELOAD, '').trim();
  delete process.env.FORGE_PM2_PRELOAD;
}
