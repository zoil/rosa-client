import * as SockJS from "sockjs-client";
import * as Async from "async";
import * as Promise from "bluebird";
import * as ejson from "ejson";
import chalk from "chalk";
// import { EventEmitter } from "events";
import * as EventEmitter from "eventemitter3";

import {
  Message,
  ConnectionState,
  // SessionId,
  Protocols,
  QueryParams,
  PublicationName,
  ActionName,
  ActionParams,
  QueryId
} from "rosa-shared";
import { ConfigType } from "./types/config";
import { ProtocolType } from "./types/protocol";
import { HandshakeProtocol } from "./protocols/handshake";
import { V1Protocol } from "./protocols/v1";
import { NodeStyleCallback } from "./types/utils";
import { Requests } from "./requests";

let connectionsCount = 0;

/**
 * TODO:
 * Connect & Session messages go on fast tracks, queues are paused
 * until session has been established.
 */

export class Connection extends EventEmitter {
  private id: number;

  private conn: SockJS | null = null;

  private state: ConnectionState = ConnectionState.Disconnected;

  private protocol: ProtocolType | null = null;

  // private sessionId: SessionId | null = null;

  private requestCount = 1;

  private requests: Requests;

  // private subscribers: {
  //   [key: string]: NodeStyleCallback;
  // } = Object.create(null);

  /**
   * Unprocessed outgoing Messages which may only be sent once
   * this.state === ConnectionState.Ready.
   */
  private outgoingMessagesQueue: Async.AsyncQueue<Message>;

  /**
   * Unprocessed incoming Messages.
   */
  private incomingMessagesQueue: Async.AsyncQueue<Message>;

  /**
   * Async queue worker for incoming messages.
   */
  private processIncomingMessage(message: Message, callback: () => {}) {
    if (message.requestId) {
      this.requests.clearTimeout(message.requestId);
    }

    // Try and process `message`.
    Promise.try(() => {
      if (!this.protocol) {
        throw new Error("Unset protocol");
      }
      console.log(chalk.yellow("<-"), this.protocol.getVersion(), message.type);
      return this.protocol.onData(message);
    })
      .then((data?: any) => {
        if (message.requestId) {
          this.requests.resolve(message.requestId, data);
        }
      })
      // Was there an uncaught error?
      .catch(err => {
        // Log it and tell the Client.
        // console.log(err);
        // this.requestError(message);
        if (message.requestId) {
          this.requests.error(message.requestId, err);
        }
      })
      // Finally get to the next item in the queue
      .finally(() => {
        // unregister the request
        callback();
      });
  }

  /**
   * Async queue worker for outgoing messages.
   */
  private processOutgoingMessage(message: Message, callback: () => {}) {
    try {
      if (!this.protocol) throw new Error();

      if (!this.conn) throw new Error("Socket is not connected.");

      console.log(chalk.blue("->"), this.protocol.getVersion(), message.type);

      const payload = [
        message.requestId ? message.requestId : 0,
        message.type,
        message.payload
      ];
      const stringPayload = ejson.stringify(payload);
      if (this.conn && this.conn.readyState === SockJS.OPEN) {
        this.conn.send(stringPayload);
      }
    } catch (err) {
      console.log("Error sending message", err);
    } finally {
      callback();
    }
  }

  /**
   * This is called when a Websocket Server sends something to the Client.
   */
  onData(e: SockJS.MessageEvent) {
    const message: Message = Object.create(null);
    try {
      // try and parse `payloadString` into `message`.
      const payload = ejson.parse(e.data);
      const [requestId, messageType, messagePayload] = payload;
      message.type = messageType;
      message.payload = messagePayload;
      message.requestId = requestId;
    } catch (err) {
      // Invalid payload.
      // there was an error parsing `payloadString`, let's build up an
      console.log("Received invalid payload from the server", err);
    }

    // remove timeout

    // Queue `message` to be processed.
    this.incomingMessagesQueue.push(message);
  }

  /**
   * Callback for detecting socket disconnection.
   * @param e
   */
  private onDisconnect(e: SockJS.CloseEvent) {
    this.conn = null;
    this.incomingMessagesQueue.drain();
    this.outgoingMessagesQueue.drain();
    this.protocol = null;
    this.setState(ConnectionState.Disconnected);
    this.requests.flush();
    console.log("disconnect");
    console.log(e.reason);
    setTimeout(() => {
      this.connect();
    }, 1000);
  }

  private onConnect(/*e: SockJS.OpenEvent*/) {
    if (!this.protocol) return;
    this.setState(ConnectionState.HandshakePending);
    this.protocol.onConnect();
    console.log("Open");
  }

  isReady(): boolean {
    return this.state === ConnectionState.Ready;
  }

  setState(newState: ConnectionState) {
    const oldState = this.state;
    this.state = newState;
    if (
      oldState !== ConnectionState.Ready &&
      newState === ConnectionState.Ready
    ) {
      this.emit("ready");
    }
    this.emit("stateChange", newState, oldState);
  }

  getState() {
    return this.state;
  }

  getId(): number {
    return this.id;
  }

  constructor(private config: ConfigType) {
    super();

    this.watch = this.watch.bind(this);
    this.unwatch = this.unwatch.bind(this);
    this.isReady = this.isReady.bind(this);

    this.id = connectionsCount++;

    this.requests = new Requests();

    // set up incoming & outgoing tubes
    this.incomingMessagesQueue = Async.queue(
      this.processIncomingMessage.bind(this),
      1
    );
    this.outgoingMessagesQueue = Async.queue(
      this.processOutgoingMessage.bind(this),
      1
    );
  }

  /**
   * Connect to the server.
   */
  connect() {
    if (this.conn !== null) return;
    this.setState(ConnectionState.Connecting);
    this.setProtocol(Protocols.Handshake.ID);

    // create the SockJS client and wire it up
    (this.conn = new SockJS(this.config.endpoint, this.config.sockjs)),
      (this.conn.onmessage = this.onData.bind(this)),
      (this.conn.onclose = this.onDisconnect.bind(this)),
      (this.conn.onopen = this.onConnect.bind(this));
  }

  /**
   * Disconnect from the server.
   */
  disconnect() {
    // but only if there is a connection already
    if (this.conn !== null) {
      this.conn.close();
    }
  }

  setProtocol(version: string) {
    switch (version) {
      case Protocols.V1.ID:
        this.protocol = new V1Protocol(this);
        break;
      case Protocols.Handshake.ID:
        this.protocol = new HandshakeProtocol(this);
        break;
      default:
        throw new Error(`Unknown protocol ${version}`);
    }
    console.log("** Protocol set:", version);
  }

  /**
   * Send `message` to the Client.
   */
  sendMessage(message: Message, callback?: NodeStyleCallback) {
    message.requestId = this.requestCount++;
    if (callback) {
      // TODO: get this from the config or override it optionally
      const interval = 1000;
      this.requests.create(message.requestId, callback, interval);
    }
    this.outgoingMessagesQueue.push(message);
  }

  setSessionId(/*sessionId: SessionId*/) {
    // this.sessionId = sessionId;
    this.setState(ConnectionState.Ready);
  }

  watch(
    name: PublicationName,
    params: QueryParams,
    callback: NodeStyleCallback
  ) {
    console.log("watch", name, params);
    if (!this.protocol) {
      callback(1);
      return;
    }
    this.protocol.watch(name, params, callback);
  }

  unwatch(id: QueryId, callback: NodeStyleCallback) {
    if (!this.protocol) {
      callback(1);
      return;
    }
    this.protocol.unwatch(id, callback);
  }

  unwatchAll(callback: NodeStyleCallback) {
    if (!this.protocol) {
      callback(1);
      return;
    }
    this.protocol.unwatchAll(callback);
  }

  exec(name: ActionName, params: ActionParams, callback: NodeStyleCallback) {
    // TODO: this has to be able to be called even before the connection establishes
    // when it resumes, it'll pick up any existing watch requests and re-subscribes them
    // the server will only send down delta if needed?
    if (!this.protocol) {
      callback(1);
      return;
    }
    this.protocol.exec(name, params, callback);
  }
}
