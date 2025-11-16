/*!
 * Connect - session - Store
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * MIT Licensed
 */

const { EventEmitter } = require('node:events');
const Cookie = require('./cookie');
const Session = require('./session');

/**
 * Abstract base class for session stores.
 * @public
 */

class Store extends EventEmitter {
  /**
   * Re-generate the given requests's session.
   *
   * @param {IncomingRequest} req
   * @return {Function} fn
   */

  regenerate(req, fn) {
    this.destroy(req.sessionID, err => {
      this.generate(req);
      fn(err);
    });
  }

  /**
   * Load a `Session` instance via the given `sid`
   * and invoke the callback `fn(err, sess)`.
   *
   * @param {String} sid
   * @param {Function} fn
   */

  load(sid, fn) {
    this.get(sid, (err, sess) => {
      if (err) return fn(err);
      if (!sess) return fn();
      const req = { sessionID: sid, sessionStore: this };
      fn(null, this.createSession(req, sess));
    });
  }

  /**
   * Create session from JSON `sess` data.
   *
   * @param {IncomingRequest} req
   * @param {Object} sess
   * @return {Session}
   */

  createSession(req, sess) {
    const expires = sess.cookie.expires;
    const originalMaxAge = sess.cookie.originalMaxAge;

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

module.exports = Store;
