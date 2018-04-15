import * as SockJS from "sockjs-client";

export interface ConfigType {
  endpoint: string;
  sockjs?: SockJS.Options;
  reconnect?: true;
}
