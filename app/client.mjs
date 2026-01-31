import fs from 'fs';

const paths = JSON.parse(fs.readFileSync('./paths.json', { encoding: 'utf-8' }));

const getRandomPath = () => {
  return paths[~~(Math.random() * paths.length)];
};

export class Client {
  constructor(url, sendStatistics, sendRequest) {
    this.url = url;
    this.sendStatistics = sendStatistics;
    this.sendRequest = sendRequest;
  }

  async run(min, max) {
    let i = min;
    while (i <= max) {
      const startTime = new Date().getTime();
      const res = await this.runPhase(i);
      const stat = this.getStat(res, new Date().getTime() - startTime);
      this.sendStatistics({ ...stat, i });
      i++;
      // if (stat.failed / stat.total > 0.1) return;
    }
  }

  async runPhase(requestsCount) {
    const promises = Array.from({ length: requestsCount }, () => this.sendRequest(this.url + getRandomPath()));
    return await Promise.allSettled(promises);
  }

  getStat(res, time) {
    const total = res.length;
    const reqPerSec = total / (time / 1000);
    let successful = 0;
    let longestDelay = 0;
    let totalDelay = 0;
    for (let i = 0; i < total; ++i) {
      if (res[i].status === 'fulfilled') {
        successful++;
        totalDelay += res[i].value.delay;
        if (longestDelay < res[i].value.delay) longestDelay = res[i].value.delay;
      } else {
        console.error(res[i]);
        totalDelay += res[i].reason.delay;
        if (longestDelay < res[i].reason.delay) longestDelay = res[i].reason.delay;
      }
    }
    return { total, reqPerSec, successful, failed: total - successful, longestDelay, totalDelay };
  }
}
