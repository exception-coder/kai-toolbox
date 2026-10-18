import http from 'node:http';

const HOP = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'];
function headersFor(headers) {
  const copy = { ...headers };
  const excluded = [...HOP, ...String(headers.connection || '').split(',').map(value => value.trim().toLowerCase())];
  for (const key of excluded) delete copy[key];
  return copy;
}

function targetFor(path, backendPort, controlPort) {
  if (path === '/api' || path.startsWith('/api/')) return { port: backendPort, path };
  if (path === '/supervisor' || path.startsWith('/supervisor/')) return { port: controlPort, path: path.slice('/supervisor'.length) || '/' };
  if (['/MP_verify_eQMZqv1CWST9uWxh.txt', '/a620fcc6f64f87886cc922b0e5dd8a21.txt'].includes(path.split('?')[0])) return { port: backendPort, path };
  return null;
}

function forwardHeaders(request) {
  return { ...headersFor(request.headers), 'x-forwarded-host': request.headers.host || '',
    'x-forwarded-proto': request.socket.encrypted ? 'https' : 'http' };
}

/** Fixed loopback targets only; stream bodies and SSE without buffering or retries. */
export function proxyHttp(request, response, ports) {
  const target = targetFor(request.url, ports.backendPort, ports.controlPort);
  if (!target) return false;
  const upstream = http.request({ host: '127.0.0.1', port: target.port, path: target.path,
    method: request.method, headers: { ...forwardHeaders(request), host: `127.0.0.1:${target.port}` } }, incoming => {
    response.writeHead(incoming.statusCode, headersFor(incoming.headers));
    incoming.on('error', () => response.destroy());
    incoming.pipe(response);
  });
  upstream.on('error', () => {
    if (response.headersSent) response.destroy();
    else { response.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end('{"error":"upstream_unavailable"}'); }
  });
  request.on('aborted', () => upstream.destroy());
  response.on('close', () => upstream.destroy());
  request.pipe(upstream);
  return true;
}

export function proxyUpgrade(request, socket, head, ports) {
  const target = targetFor(request.url, ports.backendPort, ports.controlPort);
  if (!target || !request.url.startsWith('/api/')) { socket.destroy(); return; }
  const upstream = http.request({ host: '127.0.0.1', port: target.port, path: target.path,
    headers: { ...forwardHeaders(request), host: `127.0.0.1:${target.port}`, connection: 'Upgrade', upgrade: request.headers.upgrade || 'websocket' } });
  upstream.on('upgrade', (response, remote, remoteHead) => {
    const headers = Object.entries(response.headers).flatMap(([key, value]) =>
      (Array.isArray(value) ? value : [value]).map(item => `${key}: ${item}`));
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers.join('\r\n')}\r\n\r\n`);
    if (remoteHead.length) socket.write(remoteHead);
    if (head.length) remote.write(head);
    remote.on('error', () => socket.destroy());
    socket.on('error', () => remote.destroy());
    socket.on('close', () => remote.destroy());
    remote.pipe(socket); socket.pipe(remote);
  });
  upstream.on('response', response => { socket.end(`HTTP/1.1 ${response.statusCode} Rejected\r\nConnection: close\r\n\r\n`); response.resume(); });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
  socket.on('close', () => upstream.destroy());
  upstream.end();
}
