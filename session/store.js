/*!
 * Connect - session - Store
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * MIT Licensed
 */

import { EventEmitter } from 'node:events';
import Cookie from './cookie.js';
import Session from './session.js';

/**
 * Abstract base class for session stores.
 * @public
 */

export default class Store extends EventEmitter {
  /**
   * Re-generate the given requests's session.
   *
   * @param {IncomingRequest} req
   */

  async regenerate(req) {
    await this.destroy(req.sessionID);
    await this.generate(req);
  }

  /**
   * Load a `Session` instance via the given `sid`.
   *
   * @param {String} sid
   */

  async load(sid) {
    const sess = await this.get(sid);
    if (!sess) return;
    const req = { sessionID: sid, sessionStore: this };
    return this.createSession(req, sess);
  }

  /**
   * Create session from JSON `sess` data.
   *
   * @param {IncomingRequest} req
   * @param {Object} sess
   * @return {Session}
   */

  createSession(req, sess) {
    const { expires, originalMaxAge } = sess.cookie;

    sess.cookie = new Cookie(sess.cookie);

    if (typeof expires === 'string') {
      // convert expires to a Date object
      sess.cookie.expires = new Date(expires);
    }

    // keep originalMaxAge intact
    sess.cookie.originalMaxAge = originalMaxAge;

    req.session = new Session(req, sess);
    return req.session;
  }
}
