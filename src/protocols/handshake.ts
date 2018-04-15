// import * as Promise from "bluebird";
import { ProtocolType } from "../types/protocol";
import { Connection } from "../connection";

import { Protocols, Message } from "rosa-shared";

export class HandshakeProtocol implements ProtocolType {
  constructor(private connection: Connection) {}

  getVersion() {
    return Protocols.Handshake.ID;
  }

  errorResponse(response: Protocols.Handshake.Server.ErrorResponse) {
    console.log("Error", response);
  }

  switchProtocolResponse(
    response: Protocols.Handshake.Server.SwitchProtocolResponse
  ) {
    this.connection.setProtocol(response.payload.version);
  }

  /**
   * Handle any incoming `payload` from a Connection.
   */
  onData(message: Message): any {
    switch (message.type) {
      case Protocols.Handshake.Server.Tokens.Error:
        return this.errorResponse(message);
      case Protocols.Handshake.Server.Tokens.SwitchProtocol:
        return this.switchProtocolResponse(message);
      default:
        // unknown message, try to queue for later, perhaps another
        // WebsocketProtocol will support this in the future
        console.log("Unknown message", message);
      // this.connection.queueIncomingMessage(message);
    }
  }

  onConnect() {
    // Send handshake message on connect
    const payload: Protocols.Handshake.Client.ConnectRequestPayload = {
      versions: [Protocols.V1.ID]
    };
    const message = Protocols.Handshake.Client.messageFactory(
      Protocols.Handshake.Client.Tokens.Connect,
      payload
    );
    this.connection.sendMessage(message);
  }

  /**
   * Handle Socket disconnections.
   */
  onEnd(): void {}

  watch() {
    throw new Error("Invalid");
  }

  unwatch() {
    throw new Error("Invalid");
  }

  unwatchAll() {
    throw new Error("Invalid");
  }

  exec() {
    throw new Error("Invalid");
  }
}
