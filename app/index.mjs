import cluster from 'cluster';
import os from 'os';
import process from 'process';
import { ConfigData } from './config.mjs';
import { Client } from './client.mjs';
import { createHttpClient } from './https.mjs';

const main = async () => {
  if (cluster.isPrimary) {
    const configPath = process.argv[2] || './config.json';
    const config = await ConfigData.getInstance(configPath).data;
    const numCPUs = os.cpus().length > 1 ? config.maxCPUcount : 1;

    const t1 = new Date();

    console.log('\nUSING CONFIG:', configPath);
    console.log('TARGET HOST:', config.target);
    console.log('WORKERS COUNT:', numCPUs, '\n');

    for (let i = 0; i < numCPUs; i++) {
      cluster.fork({ config: JSON.stringify(config) });
    }

    let msgsBuffer = [];
    const globalCounter = {
      failed: 0,
      total: 0
    };
    const period = 60_000;

    const getMinStat = () => {
      let total = 0;
      let failed = 0;
      let longestDelay = 0;
      let totalDelay = 0;
      for (let i = 0; i < msgsBuffer.length; ++i) {
        total += msgsBuffer[i].total;
        failed += msgsBuffer[i].failed;
        totalDelay += msgsBuffer[i].totalDelay;
        if (longestDelay < msgsBuffer[i].longestDelay) longestDelay = msgsBuffer[i].longestDelay;
      }
      msgsBuffer = [];
      console.log(
        '\x1b[32m%s\x1b[0m',
        `\nStat for minute: ${total} req/min, avg speed: ${(total / 60).toFixed(2)} req/sec, failed reqs: ${failed}, avg delay: ${Math.round(totalDelay / total)}ms, max delay: ${longestDelay}ms\n`,
      );
      globalCounter.total += total;
      globalCounter.failed += failed;
    }

    const interval = setInterval(getMinStat, period);

    Object.values(cluster.workers).forEach(worker => {
      worker.on('message', (msg) => {
        if (msg.type === 'stats') {
          const stat = JSON.parse(msg.data);
          console.log(`W${stat.workerId} (${stat.i}/${config.maxCountOfReqsInBatch}) Total requests: ${stat.total}, failed: ${stat.failed}, speed: ${stat.reqPerSec.toFixed(2)} req/sec`);
          msgsBuffer.push(stat);
        }

        if (msg.type === 'done') {
          worker.disconnect();

          // Check if all workers are done
          if (Object.values(cluster.workers).every(w => !w.isConnected())) {
            clearInterval(interval);
            getMinStat();
            const t2 = new Date();
            const minPassed = (t2.getTime() - t1.getTime()) / 60_000;
            console.log('\x1b[32m%s\x1b[0m', `Total number of reqs: ${globalCounter.total}, failed: ${globalCounter.failed}.`);
            console.log(`Started at:  ${t1.toISOString()}`);
            console.log(`Finished at: ${t2.toISOString()}`);
            console.log(`Time passed: ${minPassed.toFixed(2)} mins.`);
            console.log(`Avg speed:   ${(globalCounter.total / minPassed).toFixed(1)} req/min`);
            console.log('All workers completed. Main process is stopping...');
            process.exit(0);
          }
        }
      });
    });
  } else {
    console.log(`Starting worker ${cluster.worker.id}`);
    const config = JSON.parse(process.env.config);
    const sendToPrimary = (msg) => {
      try {
        process.send(msg);
        return true;
      } catch (err) {
        console.log('Message is not sent, channel might be closed.', err);
        return false;
      }
    };
    const httpClient = createHttpClient(config);
    const client = new Client(
      config.target,
      (data) => sendToPrimary({ type: 'stats', data: JSON.stringify({ ...data, workerId: cluster.worker.id }) }),
      httpClient.sendRequest,
      config.delayBetweenBatchesMs,
    );
    client.run(config.minCountOfReqsInBatch, config.maxCountOfReqsInBatch)
      .catch((err) => {
        console.error(`Worker ${cluster.worker.id} failed:`, err);
      })
      .finally(() => {
        sendToPrimary({ type: 'done' });
        console.log(`Finishing worker ${cluster.worker.id}`);
        process.exit(0);
      });
  }
};

main();
