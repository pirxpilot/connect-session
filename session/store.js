/*!
 * Connect - session - Store
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * MIT Licensed
 */

/**
 * Module dependencies.
 * @private
 */

const Cookie = require('./cookie');
const EventEmitter = require('node:events').EventEmitter;
const Session = require('./session');
const util = require('node:util');

/**
 * Module exports.
 * @public
 */

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
 * @api public
 */

Store.prototype.regenerate = function (req, fn) {
  const self = this;
  this.destroy(req.sessionID, function (err) {
    self.generate(req);
    fn(err);
  });
};

/**
 * Load a `Session` instance via the given `sid`
 * and invoke the callback `fn(err, sess)`.
 *
 * @param {String} sid
 * @param {Function} fn
 * @api public
 */

Store.prototype.load = function (sid, fn) {
  const self = this;
  this.get(sid, function (err, sess) {
    if (err) return fn(err);
    if (!sess) return fn();
    const req = { sessionID: sid, sessionStore: self };
    fn(null, self.createSession(req, sess));
  });
};

/**
 * Create session from JSON `sess` data.
 *
 * @param {IncomingRequest} req
 * @param {Object} sess
 * @return {Session}
 * @api private
 */

Store.prototype.createSession = function (req, sess) {
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
