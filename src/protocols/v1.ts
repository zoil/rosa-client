import * as Promise from "bluebird";
import { ProtocolType } from "../types/protocol";
import { Connection } from "../connection";
const sha1 = require("sha1");

import {
  Protocols,
  Message,
  ActionName,
  ActionParams,
  PublicationName,
  QueryParams,
  QueryId,
  ConnectionState
} from "rosa-shared";

import { Session } from "../session";
import { NodeStyleCallback } from "../types/utils";
import { QueryState, QueryDataCallback } from "../types/query";
import * as Queries from "../queries";

export class V1Protocol implements ProtocolType {
  private session: Session;
  private queryStore: Queries.Store;

  /**
   * Request a new session from the server.
   */
  private requestSessionNew() {
    const payload: Protocols.V1.Client.SessionNewRequestPayload = {};
    const message = Protocols.V1.Client.messageFactory(
      Protocols.V1.Client.Tokens.SessionNew,
      payload
    );
    this.connection.sendMessage(message);
  }

  /**
   * Reuse an existing session.
   */
  private requestSessionExisting() {
    const session = this.session.getId();
    const secret = this.session.getSecret();
    console.log(session, secret);
    const timestamp = new Date().getTime();
    const signature = sha1(`${session}_${secret}_${timestamp}`);
    const payload: Protocols.V1.Client.SessionReuseRequestPayload = {
      session,
      timestamp,
      signature
    };
    const message = Protocols.V1.Client.messageFactory(
      Protocols.V1.Client.Tokens.SessionReuse,
      payload
    );
    this.connection.sendMessage(
      message,
      (err?: any, message?: Protocols.V1.Server.SessionReuseResponse) => {
        if (err) {
          console.log("ERRORRRR", err);
          this.requestSessionNew();
          return;
        }

        console.log("** Session Reuse!", message.payload.session);
        this.connection.setState(ConnectionState.Ready);
      }
    );
  }

  /**
   * Process a SessionNewResponse message received from the server.
   */
  private sessionNewResponse(message: Protocols.V1.Server.SessionNewResponse) {
    console.log("** Session ID", message.payload.session);
    this.session.setIdAndSecret(
      message.payload.session,
      message.payload.secret
    );
    this.connection.setState(ConnectionState.Ready);
    // return this.connection.setSessionId(message.payload.session);
  }

  /**
   * Process a SessionNewResponse message received from the server.
   */
  // private sessionReuseResponse(
  //   message: Protocols.V1.Server.SessionReuseResponse
  // ) {
  // console.log("** Session ID", message);
  // this.connection.setState(ConnectionState.Ready);
  // return this.connection.setSessionId(message.payload.session);
  // }

  /**
   * Process an ExecResponse message received from the server.
   */
  private execResponse(message: Protocols.V1.Server.ExecResponse) {
    return message.payload;
  }

  /**
   * Process a WatchResponse message received from the server.
   */
  private watchResponse(message: Protocols.V1.Server.WatchResponse) {
    return message.payload.id;
  }

  /**
   * Process an UnwatchResponse message received from the server.
   */
  private unwatchResponse(message: Protocols.V1.Server.UnwatchResponse) {
    const query = this.queryStore.getQueryById(message.payload.handle);
    if (query) {
      query.setState(QueryState.Inactive);
    }
  }

  /**
   * Process an UnwatchResponse message received from the server.
   */
  private errorResponse(message: Protocols.V1.Server.ErrorResponse) {
    throw new Error(message.payload.error.toString());
  }

  /**
   * Process a WatchDataEvent message received from the server.
   */
  private watchData(message: Protocols.V1.Server.WatchDataEvent) {
    const query = this.queryStore.getQueryById(message.payload.id);
    if (query) {
      query.addPart(0, message.payload.stream, message.payload.part);
      if (message.payload.total === message.payload.part) {
        query.broadcastVersion(0, message.payload.total);
      }
    } else {
      console.log(`Unknown subscription ${message.payload.id}`);
    }
  }

  /**
   * Class constructor.
   */
  constructor(private connection: Connection) {
    this.queryStore = Queries.getInstance(connection);
    this.session = new Session();
    this.requestSession();
  }

  /**
   * Return the protocol version of this.
   */
  getVersion() {
    return Protocols.V1.ID;
  }

  /**
   * Handle an incoming message from the server.
   */
  onData(message: Message): any {
    switch (message.type) {
      case Protocols.V1.Server.Tokens.SessionNew:
        return this.sessionNewResponse(message);
      // case Protocols.V1.Server.Tokens.SessionReuse:
      //   return this.sessionReuseResponse(message);
      case Protocols.V1.Server.Tokens.Exec:
        return this.execResponse(message);
      case Protocols.V1.Server.Tokens.Watch:
        return this.watchResponse(message);
      case Protocols.V1.Server.Tokens.Unwatch:
        return this.unwatchResponse(message);
      case Protocols.V1.Server.Tokens.WatchData:
        return this.watchData(message);
      case Protocols.V1.Server.Tokens.Error:
        return this.errorResponse(message);
      default:
        return message;
    }
  }

  /**
   * Handle Socket disconnections.
   */
  onEnd() {}

  onConnect() {}

  /**
   * Request a session from the server.
   * Use existing credentials if available.
   */
  requestSession() {
    if (this.session.getId()) {
      this.requestSessionExisting();
    } else {
      this.requestSessionNew();
    }
  }

  /**
   * Sends a Watch message to the server.
   */
  watch(
    name: PublicationName,
    params: QueryParams,
    callback: NodeStyleCallback
  ) {
    const query = this.queryStore.getForNameAndParams(name, params);
    const payload: Protocols.V1.Client.WatchRequestPayload = {
      id: query.getClientId(),
      name,
      params
    };
    const message = Protocols.V1.Client.messageFactory(
      Protocols.V1.Client.Tokens.Watch,
      payload
    );
    // callback(null, query.consumerInterface());
    if (!query.getServerId()) {
      this.connection.sendMessage(message, (err?: any, payload?: any) => {
        if (err) {
          query.setState(QueryState.Error);
        } else {
          query.setServerId(payload);
          query.setState(QueryState.Confirmed);
        }
      });
    }
  }

  /**
   * Sends an Unwatch message to the server.
   */
  unwatch(id: QueryId, callback: NodeStyleCallback) {
    const payload: Protocols.V1.Client.UnwatchRequestPayload = {
      id
    };
    const message = Protocols.V1.Client.messageFactory(
      Protocols.V1.Client.Tokens.Unwatch,
      payload
    );
    return this.connection.sendMessage(message, callback);
  }

  /**
   * Unwatch all queries of callback.
   */
  unwatchAll(callback: QueryDataCallback) {
    this.queryStore.unsubscribeAll(callback);
    // const queryIds = Queries.getHashesForCallback(callback);
    // const unwatchPromisified = Promise.promisify(this.unwatch, {
    //   context: this
    // });
    // Promise.each(queryIds, (queryId: QueryId) => unwatchPromisified(queryId));
  }

  /**
   * Sends an Exec message to the server.
   */
  exec(name: ActionName, params: ActionParams, callback: NodeStyleCallback) {
    const payload: Protocols.V1.Client.ExecRequestPayload = {
      name,
      params
    };
    const message = Protocols.V1.Client.messageFactory(
      Protocols.V1.Client.Tokens.Exec,
      payload
    );
    this.connection.sendMessage(message, callback);
    return Promise.try(() => false);
  }
}
