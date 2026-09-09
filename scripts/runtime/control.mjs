import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { timingSafeEqual } from 'node:crypto';

export function portOpen(port) {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

function tokenMatches(actual, expected) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function controlServer({ status, mutate, internalToken, externalToken, onError }) {
  let busy = false;
  const server = createServer(async (request, response) => {
    const reply = (code, data) => {
      response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(data));
    };
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/status') return reply(200, { ...await status(), busy });
      const full = ['/reload', '/full-reload'].includes(url.pathname);
      if (request.method !== 'POST' || (!full && url.pathname !== '/restart')) return reply(404, { error: 'not_found' });
      const token = request.headers['x-restart-token'] || url.searchParams.get('token');
      if (!full && !externalToken) return reply(503, { error: 'RestartToken is not configured' });
      if (!tokenMatches(token, externalToken) && !(full && tokenMatches(token, internalToken))) return reply(403, { error: 'token_mismatch' });
      const snapshot = await status();
      if (!snapshot.bootstrapAttached) return reply(409, { error: 'bootstrap_unavailable' });
      if (!full && !snapshot.backendEnabled) return reply(409, { error: 'backend_disabled' });
      if (busy) return reply(409, { error: 'operation_in_progress' });
      busy = true;
      // The acknowledgement must reach Java before it releases its update coordinator.
      response.once('finish', () => setTimeout(async () => {
        try { await mutate(full ? 'reload' : 'restart'); }
        catch (error) { onError(error); }
        finally { busy = false; }
      }, 100));
      reply(full ? 202 : 200, { ok: true, message: 'restart accepted' });
    } catch (error) { onError(error); if (!response.headersSent) reply(500, { error: 'control_failed' }); }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  return server;
}
