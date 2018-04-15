import { QueryInternal, QueryInternalParams } from "./query";
import {
  QueryId,
  PublicationName,
  QueryParams,
  ConnectionState
} from "rosa-shared";
import { QueryDataCallback } from "..";
import * as md5 from "md5";
import { Connection } from "../connection";

/**
 * Singleton class to keep track of the currently live queries.
 */
export class Store {
  private queryHashesById: { [queryId: string]: string } = Object.create(null);
  private queriesByHash: { [hash: string]: QueryInternal } = Object.create(
    null
  );

  /**
   * Generate the has for the input params.
   */
  private generateHash(name: PublicationName, params: QueryParams) {
    return md5(`${name}_${JSON.stringify(params)}`);
  }

  private linkAll() {
    for (let hash in this.queriesByHash) {
      this.queriesByHash[hash].link();
    }
  }

  private onLinked(query: QueryInternal) {
    const serverId = query.getServerId();
    const clientId = query.getClientId();
    this.queryHashesById[serverId] = clientId;
  }

  private onUnlinked(query: QueryInternal) {
    const clientId = query.getClientId();
    Object.keys(this.queryHashesById).some((serverId: string) => {
      if (this.queryHashesById[serverId] === clientId) {
        delete this.queryHashesById[serverId];
        return true;
      }
      return false;
    });
  }

  constructor(private connection: Connection) {
    this.connection.on("ready", this.linkAll.bind(this));
    this.onLinked = this.onLinked.bind(this);
    this.onUnlinked = this.onUnlinked.bind(this);
  }

  /**
   * Return a QueryInternal for the input params.
   */
  getForNameAndParams(
    name: PublicationName,
    params: QueryParams
  ): QueryInternal {
    const hash = this.generateHash(name, params);
    if (!this.queriesByHash[hash]) {
      this.queriesByHash[hash] = new QueryInternal({
        name,
        params,
        hash,
        watch: this.connection.watch,
        unwatch: this.connection.unwatch,
        isReady: this.connection.isReady,
        onLinked: this.onLinked,
        onUnlinked: this.onUnlinked
      });
    }
    return this.queriesByHash[hash];
  }

  /**
   * Return the QueryInternal instance for queryId.
   */
  getQueryById(queryId: QueryId): QueryInternal {
    if (!this.queryHashesById[queryId]) {
      return null;
    }
    const hash = this.queryHashesById[queryId];
    return this.queriesByHash[hash];
  }

  /**
   * Broadcast data to the QueryInternal instance for queryId.
   */
  broadcast(queryId: QueryId, data: any) {
    const query = this.getQueryById(queryId);
    if (query) query.broadcast(data);
  }

  /**
   * Return the query hashes for callback.
   */
  getHashesForCallback(callback: QueryDataCallback): string[] {
    const result: string[] = [];
    for (const hash in this.queriesByHash) {
      if (this.queriesByHash[hash].hasSubscriber(callback)) {
        result.push(hash);
      }
    }
    return result;
  }

  /**
   * Unsubscribe callback from all queries.
   */
  unsubscribeAll(callback: QueryDataCallback) {
    for (const hash in this.queriesByHash) {
      this.queriesByHash[hash].removeSubscriber(callback);
    }
  }
}

// Return a singleton for each Connection instance.
const instances: { [connectionId: number]: Store } = Object.create(null);
export function getInstance(connection: Connection): Store {
  const connectionId = connection.getId();
  if (!instances[connectionId]) {
    instances[connectionId] = new Store(connection);
  }
  return instances[connectionId];
}
