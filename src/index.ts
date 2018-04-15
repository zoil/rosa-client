import { ConfigType } from "./types/config";
import { Connection } from "./connection";
import {
  ConnectionState,
  PublicationName,
  QueryParams,
  ActionName,
  ActionParams,
  QueryId
} from "rosa-shared";
import { NodeStyleCallback } from "./types/utils";
import { QueryDataCallback, Query } from ".";
import * as Queries from "./queries";

// export const RosaClient = Connection;

export * from "./types/actions";
export * from "./types/query";
export * from "./connection";

export class RosaClient {
  private connection: Connection;
  private queryStore: Queries.Store;

  private pendingOperations: NodeStyleCallback[] = [];

  private processPendingOperations() {
    console.log("processPendingOperations");
    let operation: NodeStyleCallback;
    while ((operation = this.pendingOperations.shift())) {
      operation();
    }
  }

  constructor(config: ConfigType) {
    this.connection = new Connection(config);
    this.queryStore = Queries.getInstance(this.connection);
    this.connection.on(
      "stateChange",
      (newState: ConnectionState, oldState: ConnectionState) => {
        if (newState === ConnectionState.Ready) {
          this.processPendingOperations();
        }
      }
    );
  }

  on(event: "connecting", callback: () => void): this;
  on(event: "connected", callback: () => void): this;
  on(event: "disconnected", callback: () => void): this;
  on(event: "reconnecting", callback: () => void): this;
  on(
    event: "stateChange",
    callback: (newState: ConnectionState, oldState: ConnectionState) => void
  ): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    const x = this.connection.on(event, (...args: any[]) => {
      listener(...args);
    });
    return this;
  }

  connect() {
    console.log("connect");
    this.connection.connect();
  }

  disconnect() {
    this.connection.disconnect();
  }

  query(name: PublicationName, params: QueryParams): Query {
    return this.queryStore
      .getForNameAndParams(name, params)
      .consumerInterface();
  }

  unwatchAll(callback: QueryDataCallback) {
    this.queryStore.unsubscribeAll(callback);
    // console.log("unwatchAll");
    // this.connection.unwatchAll(callback);
  }

  // unwatch(id: QueryId, callback: NodeStyleCallback) {
  //   console.log("unwatch", id);
  //   this.connection.unwatch(id, callback);
  // }

  /**
   *
   * @param name
   * @param params
   */
  exec(
    name: ActionName,
    params: ActionParams,
    callback: (err: any, data?: any) => void
  ) {
    this.connection.exec(name, params, callback);
  }
}
