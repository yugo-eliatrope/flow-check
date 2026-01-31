import https from 'https';

export const createHttpClient = (config) => {
  const agent = new https.Agent({
    keepAlive: true,
    maxSockets: config.maxSockets,
    maxFreeSockets: config.maxFreeSockets,
    scheduling: 'lifo',
    timeout: 120_000
  });

  const sendRequest = (url) => {
    return new Promise((resolve, reject) => {
      const startTime = new Date().getTime();
      const req = https.get(url, { agent }, (res) => {
        res.resume();

        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            delay: new Date().getTime() - startTime
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
