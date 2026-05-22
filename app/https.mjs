import http from 'http';
import https from 'https';

export const createHttpClient = (config) => {
  const httpModule = config.target.startsWith('https://') ? https : http;
  const agent = new httpModule.Agent({
    keepAlive: true,
    maxSockets: config.maxSockets,
    maxFreeSockets: config.maxFreeSockets,
    scheduling: 'lifo',
    timeout: 120_000
  });

  const sendRequest = (url) => {
    return new Promise((resolve, reject) => {
      const startTime = new Date().getTime();
      const req = httpModule.get(url, { agent }, (res) => {
        res.resume();

        res.on('end', () => {
          const chunks = res.headers['server-timing']?.split(', doc-render;dur=');
          const renderTime = chunks?.[1] ? +chunks[1] : -1;
          const cacheChunk = chunks?.[0] ? chunks[0].split('total-props-prep;dur=')?.[1] : [];
          const cacheTime = cacheChunk?.[1] ? +chunks[1] : -1;
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            delay: new Date().getTime() - startTime,
            renderTime,
            cacheTime,
          });
        });
      });

      req.on('error', (err) => {
        reject({ ok: false, err, delay: new Date().getTime() - startTime, url });
      });

      req.setTimeout(120_000, () => {
        req.destroy(new Error('Request timed out'));
      });
    });
  };

  return { sendRequest };
};
