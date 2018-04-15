import * as Promise from "bluebird";

import { QueryDataCallback, QueryState, Query } from "../types/query";
import { QueryId, PublicationName, QueryParams } from "rosa-shared";
import { NodeStyleCallback } from "../types/utils";
import * as LocalStorage from "local-storage";

export interface QueryInternalParams {
  hash: string;
  name: PublicationName;
  params: QueryParams;
  watch(
    name: PublicationName,
    params: QueryParams,
    callback: NodeStyleCallback
  ): void;
  unwatch(id: QueryId, callback: NodeStyleCallback): void;
  isReady(): boolean;
  onLinked(query: QueryInternal): void;
  onUnlinked(query: QueryInternal): void;
}

export class QueryInternal {
  private linked: boolean = false;
  private serverId: QueryId;
  private publicInterface: Query;

  /**
   * The subscribers of this.
   */
  private subscribers: QueryDataCallback[] = [];

  /**
   * The state of this.
   */
  private state: QueryState = QueryState.Inactive;

  private unusedSince: number = 0;

  /**
   * Return the index of `subscriber` in this.subscribers.
   */
  private getSubscriberIndex(subscriber: QueryDataCallback) {
    return this.subscribers.indexOf(subscriber);
  }

  /**
   * The data parts for the versions of this.
   */
  private dataParts: {
    [version: number]: any;
  } = Object.create(null);

  private dataPartsVersion: number = -1;

  private dataTimer: any;
  private data: any;

  /**
   * Reset the data parts.
   */
  private resetDataParts(version: number) {
    delete this.dataParts;
    this.dataParts = Object.create(null);
    this.dataPartsVersion = version;
  }

  /**
   * Subscribe for this on the server.
   */
  link() {
    // do we have this being linked already?
    if (this.linked || !this.params.isReady()) {
      // then no need to subscribe again
      return;
    }
    this.params.watch(
      this.params.name,
      this.params.params,
      (err?: any, queryId?: any) => {
        if (err) {
          throw new Error("Can't subscribe");
        }
        this.serverId = queryId;
        this.linked = true;
      }
    );
  }

  /**
   * Unsubscribe on the server.
   */
  unlink() {
    // have we unsubscribed already?
    if (!this.linked) {
      return;
    }
    this.params.unwatch(this.serverId, (err?: any) => {
      this.linked = false;
      delete this.serverId;
    });
  }

  /**
   * Query Constructor.
   * @param queryId
   */
  constructor(private params: QueryInternalParams) {
    this.unusedSince = new Date().getTime();
    this.publicInterface = new Query(this);
    this.flushData = this.flushData.bind(this);
  }

  getClientId() {
    return this.params.hash;
  }

  /**
   * Return true if this should be considered as unused.
   * In that case this will be decommissioned.
   */
  isUnused(): boolean {
    if (this.subscribers.length > 0) {
      return false;
    }
    return this.unusedSince < new Date().getTime() - 10000;
  }

  /**
   * Record data as a part of a version of the data for this Query.
   */
  addPart(version: number, data: any, sequence: number) {
    // Are we recording parts for a newer version already?
    if (this.dataPartsVersion > version) {
      // Skip this part if so.
      return;
    }

    // Is this the start of recording a new version?
    if (this.dataPartsVersion < version) {
      // Reset the dataParts object then.
      this.resetDataParts(version);
    }

    // Record the data part.
    this.dataParts[sequence] = data;
  }

  /**
   * Broadcast a finished stream of data.
   */
  broadcastVersion(version: number, totalParts: number) {
    if (this.dataPartsVersion !== version) {
      return;
    }
    let stream = "";
    for (let sequence = 1; sequence <= totalParts; sequence++) {
      const part = this.dataParts[sequence];
      if (!part) {
        throw new Error(`Inconsistent version, missing part #${sequence}`);
      }
      stream += part;
    }
    const data = JSON.parse(stream);
    LocalStorage.set(this.getClientId(), data);
    delete this.data;
    this.broadcast(data);
    this.resetDataParts(-1);
  }

  /**
   * Set the state of this.
   */
  setState(state: QueryState) {
    this.state = state;
  }

  /**
   * Return the current state of this.
   */
  getState() {
    return this.state;
  }

  /**
   * Return the query id of this.
   */
  getServerId() {
    return this.serverId;
  }

  setServerId(serverId: QueryId) {
    this.serverId = serverId;
    this.params.onLinked(this);
  }

  /**
   * Add callback as a subscriber for the data provided by this.
   */
  addSubscriber(callback: QueryDataCallback) {
    // Add callback as a subscriber if it's not on the list yet.
    const subscriberIndex = this.getSubscriberIndex(callback);
    if (subscriberIndex === -1) {
      this.subscribers.push(callback);
    }

    // This is not unused anymore.
    this.unusedSince = 0;

    this.link();

    callback(this.publicInterface);
  }

  /**
   * Unsubscribe callback from further data updates.
   */
  removeSubscriber(callback: QueryDataCallback) {
    // Remove callback from the list of subscribers, if it's on it.
    const subscriberIndex = this.getSubscriberIndex(callback);
    if (subscriberIndex !== -1) {
      this.subscribers.splice(subscriberIndex, 1);
    }

    // No more subscribers?
    if (this.subscribers.length === 0) {
      // Record the time when this became unused.
      this.unusedSince = new Date().getTime();
    }
  }

  /**
   * Return true if callback is a subscriber.
   */
  hasSubscriber(callback: QueryDataCallback): boolean {
    const subscriberIndex = this.getSubscriberIndex(callback);
    return subscriberIndex !== -1;
  }
  /**
   * Return true if this has any subscribers.
   */
  hasSubscribers(): boolean {
    return this.subscribers.length === 0;
  }

  /**
   * Broadcast `payload` to all subscribers.
   */
  broadcast(apayload: any) {
    Promise.each(this.subscribers, (callback: QueryDataCallback) =>
      Promise.try(() => callback(this.publicInterface))
    );
  }

  /**
   * Bind event listeners.
   */
  on(event: "destroy", callback: () => void): void;
  on(event: "stateChange", callback: (state: QueryState) => void): void;
  on(event: string, callback: (...args: any[]) => void) {
    switch (event) {
      case "destroy":
      case "stateChange":
        callback;
        break;
      default:
        throw new Error(`Unknown event type: ${event}`);
    }
  }

  private resetDataTimer() {
    this.clearDataTimeout();
    this.dataTimer = setTimeout(this.flushData, 1000);
  }

  private clearDataTimeout() {
    if (this.dataTimer) {
      clearTimeout(this.dataTimer), delete this.dataTimer;
    }
  }

  private flushData() {
    delete this.data;
    this.clearDataTimeout();
    console.log("flushData");
  }

  getData() {
    this.resetDataTimer();
    if (!this.data) {
      this.data = LocalStorage.get(this.getClientId());
    }
    return this.data;
  }

  /**
   * Provide a consumer interface.
   */
  consumerInterface(): Query {
    return this.publicInterface;
  }
}
