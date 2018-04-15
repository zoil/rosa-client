import { NodeStyleCallback } from "./types/utils";

export class Requests {
  private pendingRequests: {
    [key: string]: {
      callback: NodeStyleCallback;
      timeout: NodeJS.Timer;
    };
  } = Object.create(null);

  private timeout(requestId: number) {
    if (!this.pendingRequests[requestId]) {
      return;
    }
    const callback = this.pendingRequests[requestId].callback;
    this.delete(requestId);
    callback("timeout");
  }

  private delete(requestId: number) {
    if (!this.pendingRequests[requestId]) {
      return;
    }
    this.clearTimeout(requestId);
    delete this.pendingRequests[requestId];
  }

  create(requestId: number, callback: NodeStyleCallback, timeout: number) {
    if (this.pendingRequests[requestId]) {
      throw new Error("this requestId already exists");
    }

    this.pendingRequests[requestId] = {
      timeout: setTimeout(() => {
        this.timeout(requestId);
      }, timeout),
      callback
    };
  }

  error(requestId: any, payload: any) {
    if (!this.pendingRequests[requestId]) {
      return;
    }
    const callback = this.pendingRequests[requestId].callback;
    this.delete(requestId);
    callback(payload);
  }

  resolve(requestId: number, payload: any) {
    if (!this.pendingRequests[requestId]) {
      return;
    }
    const callback = this.pendingRequests[requestId].callback;
    this.delete(requestId);
    callback(null, payload);
  }

  clearTimeout(requestId: number) {
    if (!this.pendingRequests[requestId]) {
      return;
    }
    if (this.pendingRequests[requestId].timeout) {
      clearTimeout(this.pendingRequests[requestId].timeout);
      delete this.pendingRequests[requestId].timeout;
    }
  }

  flush() {
    const keys = Object.keys(this.pendingRequests);
    keys.forEach(requestId => {
      this.error(requestId, "disconnected");
    });
  }
}
