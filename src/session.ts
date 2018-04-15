import { SessionId } from "rosa-shared";
import * as LocalStorage from "local-storage";

const ls_sessionId = "SI";
const ls_sessionSecret = "SS";

export class Session {
  private id: SessionId;
  private secret: string;

  constructor() {
    this.id = LocalStorage.get(ls_sessionId);
    this.secret = LocalStorage.get(ls_sessionSecret);
  }

  /**
   * Return the current session id.
   */
  getId() {
    return this.id;
  }

  getSecret() {
    return this.secret;
  }

  /**
   * Set new session details.
   */
  setIdAndSecret(id: SessionId, secret: string) {
    const oldSessionId = LocalStorage.get(ls_sessionId);
    if (oldSessionId !== id) {
      LocalStorage.clear();
    }

    this.id = id;
    this.secret = secret;
    LocalStorage.set(ls_sessionId, id);
    LocalStorage.set(ls_sessionSecret, secret);
  }
}
