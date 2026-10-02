import { readFile, rename, writeFile } from "node:fs/promises";
import { PlayCreditTracker } from "./play-credit.mjs";

export class PlayCreditStore {
  constructor(filePath, tracker) { this.filePath = filePath; this.tracker = tracker; this.queue = Promise.resolve(); }
  static async open(filePath) {
    let tracker;
    try { tracker = PlayCreditTracker.restore(JSON.parse(await readFile(filePath, "utf8"))); }
    catch (error) { if (error.code !== "ENOENT") throw error; tracker = new PlayCreditTracker(); }
    return new PlayCreditStore(filePath, tracker);
  }
  save() {
    const contents = JSON.stringify(this.tracker.toJSON());
    const operation = async () => {
      const temporary = this.filePath + ".tmp";
      await writeFile(temporary, contents, "utf8");
      await rename(temporary, this.filePath);
    };
    this.queue = this.queue.then(operation, operation);
    return this.queue;
  }
}
