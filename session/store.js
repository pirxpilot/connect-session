/*!
 * Connect - session - Store
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * MIT Licensed
 */

const Cookie = require('./cookie');
const EventEmitter = require('node:events').EventEmitter;
const Session = require('./session');
const util = require('node:util');

module.exports = Store;

/**
 * Abstract base class for session stores.
 * @public
 */

function Store() {
  EventEmitter.call(this);
}

/**
 * Inherit from EventEmitter.
 */

util.inherits(Store, EventEmitter);

/**
 * Re-generate the given requests's session.
 *
 * @param {IncomingRequest} req
 * @return {Function} fn
 */

Store.prototype.regenerate = function (req, fn) {
  this.destroy(req.sessionID, err => {
    this.generate(req);
    fn(err);
  });
};

/**
 * Load a `Session` instance via the given `sid`
 * and invoke the callback `fn(err, sess)`.
 *
 * @param {String} sid
 * @param {Function} fn
 */

Store.prototype.load = function (sid, fn) {
  this.get(sid, (err, sess) => {
    if (err) return fn(err);
    if (!sess) return fn();
    const req = { sessionID: sid, sessionStore: this };
    fn(null, this.createSession(req, sess));
  });
};

/**
 * Create session from JSON `sess` data.
 *
 * @param {IncomingRequest} req
 * @param {Object} sess
 * @return {Session}
 */

Store.prototype.createSession = (req, sess) => {
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
};
