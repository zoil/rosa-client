import {
  Message,
  ActionName,
  ActionParams,
  PublicationName,
  QueryParams,
  QueryId
} from "rosa-shared";
import { NodeStyleCallback } from "./utils";
import { QueryDataCallback } from "..";

export interface ProtocolType {
  /**
   * Return the version of this.
   */
  getVersion(): string;

  /**
   * Handle any incoming `payload` from a Connection.
   */
  onData(request: Message): any;

  /**
   * Handle Socket disconnections.
   */
  onEnd(): void;

  onConnect(): void;

  /**
   * Handle full data transmit events from Subscriptions.
   */
  // onSubscriptionData(queryId: QueryId, payload: any): void;

  // call(action: string, params: {}, callback: NodeStyleCallback);

  /**
   * Handle delta data transmit events from Subscriptions.
   */
  // onSubscriptionChanges(queryId: QueryId, changeset: any): void;
  exec(
    name: ActionName,
    params: ActionParams,
    callback: NodeStyleCallback
  ): void;

  watch(
    name: PublicationName,
    params: QueryParams,
    callback: NodeStyleCallback
  ): void;

  unwatch(id: QueryId, callback: NodeStyleCallback): void;

  unwatchAll(callback: QueryDataCallback): void;
}
