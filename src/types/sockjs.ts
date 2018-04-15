declare module "sockjs-client" {
  export = SockJS;
}

declare class SockJS extends EventTarget {
  constructor(url: string, _reserved?: any, options?: SockJS.Options);

  readyState: SockJS.State;
  protocol: string;
  url: string;
  onopen: (e: SockJS.OpenEvent) => any;
  onclose: (e: SockJS.CloseEvent) => any;
  onmessage: (e: MessageEvent) => any;
  send(data: any): void;
  close(code?: number, reason?: string): void;

  static CONNECTING: SockJS.State;
  static OPEN: SockJS.State;
  static CLOSING: SockJS.State;
  static CLOSED: SockJS.State;
}

declare namespace SockJS {
  interface BaseEvent extends Event {
    type: string;
  }

  interface OpenEvent extends BaseEvent {}

  interface CloseEvent extends BaseEvent {
    code: number;
    reason: string;
    wasClean: boolean;
  }

  interface MessageEvent extends BaseEvent {
    data: string;
  }

  interface SessionGenerator {
    (): string;
  }

  interface Options {
    server?: string;
    sessionId?: number | SessionGenerator;
    transports?: string | string[];
  }

  enum State {
    CONNECTING = 0,
    OPEN,
    CLOSING,
    CLOSED
  }
}
