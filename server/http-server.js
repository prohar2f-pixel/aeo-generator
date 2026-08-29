import http from 'node:http';
import { fileURLToPath } from 'node:url';

import worker from '../worker/worker.js';
import { DomainRateLimiter } from './domain-rate-limiter.js';
import { configureAnalyzerProxy } from './outbound-proxy.js';

const MAX_REQUEST_BYTES = 32 * 1024;

function jsonError(response, status, error) {
  const body = JSON.stringify({ ok: false, error });
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

async function readRequestBody(request) {
  const declaredLength = Number(request.headers['content-length'] || 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    const error = new Error('body_too_large');
    error.code = 'body_too_large';
    throw error;
  }

  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > MAX_REQUEST_BYTES) {
      const error = new Error('body_too_large');
      error.code = 'body_too_large';
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function requestUrl(request) {
  const host = request.headers.host || '127.0.0.1';
  return `http://${host}${request.url}`;
}

async function sendStandardResponse(nodeResponse, standardResponse) {
  const headers = Object.fromEntries(standardResponse.headers.entries());
  const body = Buffer.from(await standardResponse.arrayBuffer());
  headers['content-length'] = body.length;
  nodeResponse.writeHead(standardResponse.status, headers);
  nodeResponse.end(body);
}

export function createAnalyzerServer({ workerHandler = worker.fetch.bind(worker), env = {} } = {}) {
  return http.createServer(async (request, response) => {
    const pathname = new URL(requestUrl(request)).pathname;
    if (pathname !== '/v1/analyze') return jsonError(response, 404, 'not_found');
    if (!['POST', 'OPTIONS'].includes(request.method)) return jsonError(response, 405, 'method_not_allowed');

    try {
      let body;
      if (request.method === 'POST') {
        body = await readRequestBody(request);
        try {
          JSON.parse(body.toString('utf8'));
        } catch {
          return jsonError(response, 400, 'bad_json');
        }
      }

      const standardRequest = new Request(requestUrl(request), {
        method: request.method,
        headers: request.headers,
        body,
      });
      const standardResponse = await workerHandler(standardRequest, env);
      return sendStandardResponse(response, standardResponse);
    } catch (error) {
      if (error?.code === 'body_too_large') return jsonError(response, 413, 'body_too_large');
      return jsonError(response, 500, 'internal_error');
    }
  });
}

export function startAnalyzerServer({ host = '127.0.0.1', port = 8789 } = {}) {
  configureAnalyzerProxy(process.env.ANALYZER_PROXY_URL);
  const env = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    AUDIT_RATE_LIMITER: new DomainRateLimiter(),
  };
  const server = createAnalyzerServer({ env });
  server.listen(port, host, () => {
    console.log(`AEO analyzer listening on http://${host}:${port}`);
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startAnalyzerServer();
}
