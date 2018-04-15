import { QueryId } from "rosa-shared";
import { QueryInternal } from "../queries/query";
import { NodeStyleCallback } from "./utils";

export interface QueryDefinition<N = string, P = {}> {
  name: N;
  params: P;
}

export type QueryDataCallback = (query: Query) => Promise<void> | void;

export enum QueryState {
  Requested = "requested",
  Confirmed = "confirmed",
  Ready = "ready",
  Inactive = "inactive",
  Error = "error"
}

export class Query {
  constructor(private query: QueryInternal) {}

  get id(): any {
    return this.query.getClientId();
  }

  get state(): QueryState {
    return this.query.getState();
  }

  get data(): any {
    return this.query.getData();
  }

  subscribe(callback: QueryDataCallback): (() => void) {
    this.query.addSubscriber(callback);
    return () => this.query.removeSubscriber(callback);
  }
}
