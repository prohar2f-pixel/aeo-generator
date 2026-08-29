import { ProxyAgent, setGlobalDispatcher } from 'undici';

export function validateAnalyzerProxyUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('invalid_analyzer_proxy_url');
  }

  if (
    url.protocol !== 'http:'
    || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || url.username
    || url.password
    || !url.port
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    throw new Error('invalid_analyzer_proxy_url');
  }
  return url.href;
}

export function configureAnalyzerProxy(value) {
  if (!value) return false;
  setGlobalDispatcher(new ProxyAgent(validateAnalyzerProxyUrl(value)));
  return true;
}
