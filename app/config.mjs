import fsp from 'fs/promises';

const loadConfig = async (path) => {
  const text = await fsp.readFile(path, { encoding: 'utf-8' });
  return JSON.parse(text);
};

export class ConfigData {
  static #instance;

  constructor(path) {
    this.data = loadConfig(path);
  }

  static getInstance(path) {
    if (!ConfigData.#instance) {
      ConfigData.#instance = new ConfigData(path);
    }
    return ConfigData.#instance;
  }
}
