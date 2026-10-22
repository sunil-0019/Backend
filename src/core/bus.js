import { EventEmitter } from 'events';

class AppEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * Safe asynchronous emit: runs all handlers and logs any unhandled error without crashing
   */
  async emitAsync(event, payload) {
    const listeners = this.rawListeners(event);
    for (const listener of listeners) {
      try {
        await Promise.resolve(listener(payload));
      } catch (err) {
        console.error(`Error in event listener for [${event}]:`, err);
      }
    }
  }
}

export const bus = new AppEventBus();
