/*!
 * express-session
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 * @private
 */

const Buffer = require('node:buffer').Buffer;
const cookie = require('cookie');
const crypto = require('crypto');
const debug = require('debug')('connect-session');
const deprecate = require('depd')('connect-session');
const onHeaders = require('on-headers');
const parseUrl = require('parseurl');
const signature = require('cookie-signature');
const uid = require('ufid').generator({ size: 24 });

const Cookie = require('./session/cookie');
const MemoryStore = require('./session/memory');
const Session = require('./session/session');
const Store = require('./session/store');

// environment

const env = process.env.NODE_ENV;

/**
 * Expose the middleware.
 */

exports = module.exports = session;

/**
 * Expose constructors.
 */

exports.Store = Store;
exports.Cookie = Cookie;
exports.Session = Session;
exports.MemoryStore = MemoryStore;

/**
 * Warning message for `MemoryStore` usage in production.
 * @private
 */

const warning =
  'Warning: connect.session() MemoryStore is not\n' +
  'designed for a production environment, as it will leak\n' +
  'memory, and will not scale past a single process.';

/**
 * Setup session store with the given `options`.
 *
 * @param {Object} [options]
 * @param {Object} [options.cookie] Options for cookie
 * @param {Function} [options.genid]
 * @param {String} [options.name=connect.sid] Session ID cookie name
 * @param {Boolean} [options.resave] Resave unmodified sessions back to the store
 * @param {Boolean} [options.rolling] Enable/disable rolling session expiration
 * @param {Boolean} [options.saveUninitialized] Save uninitialized sessions to the store
 * @param {String|Array} [options.secret] Secret for signing session ID
 * @param {Object} [options.store=MemoryStore] Session store
 * @param {String} [options.unset]
 * @return {Function} middleware
 * @public
 */

function session(options) {
  const opts = options || {};

  // get the cookie options
  const cookieOptions = opts.cookie || {};

  // get the session id generate function
  const generateId = opts.genid || generateSessionId;

  // get the session cookie name
  const name = opts.name || opts.key || 'connect.sid';

  // get the session store
  const store = opts.store || new MemoryStore();

  // get the resave session option
  let resaveSession = opts.resave;

  // get the rolling session option
  const rollingSessions = Boolean(opts.rolling);

  // get the save uninitialized session option
  let saveUninitializedSession = opts.saveUninitialized;

  // get the cookie signing secret
  let secret = opts.secret;

  if (typeof generateId !== 'function') {
    throw new TypeError('genid option must be a function');
  }

  if (resaveSession === undefined) {
    deprecate('undefined resave option; provide resave option');
    resaveSession = true;
  }

  if (saveUninitializedSession === undefined) {
    deprecate('undefined saveUninitialized option; provide saveUninitialized option');
    saveUninitializedSession = true;
  }

  if (opts.unset && opts.unset !== 'destroy' && opts.unset !== 'keep') {
    throw new TypeError('unset option must be "destroy" or "keep"');
  }

  // TODO: switch to "destroy" on next major
  const unsetDestroy = opts.unset === 'destroy';

  if (Array.isArray(secret) && secret.length === 0) {
    throw new TypeError('secret option array must contain one or more strings');
  }

  if (secret && !Array.isArray(secret)) {
    secret = [secret];
  }

  if (!secret) {
    deprecate('req.secret; provide secret option');
  }

  // notify user that this store is not
  // meant for a production environment
  /* istanbul ignore next: not tested */
  if (env === 'production' && store instanceof MemoryStore) {
    console.warn(warning);
  }

  // generates the new session
  store.generate = function (req) {
    req.sessionID = generateId(req);
    req.session = new Session(req);
    req.session.cookie = new Cookie(cookieOptions);

    if (cookieOptions.secure === 'auto') {
      req.session.cookie.secure = req.secure;
    }
  };

  const storeImplementsTouch = typeof store.touch === 'function';

  // register event listeners for the store to track readiness
  let storeReady = true;
  store.on('disconnect', function ondisconnect() {
    storeReady = false;
  });
  store.on('connect', function onconnect() {
    storeReady = true;
  });

  return function session(req, res, next) {
    // self-awareness
    if (req.session) {
      next();
      return;
    }

    // Handle connection as if there is no session if
    // the store has temporarily disconnected etc
    if (!storeReady) {
      debug('store is disconnected');
      next();
      return;
    }

    // pathname mismatch
    const originalPath = parseUrl.original(req).pathname || '/';
    if (originalPath.indexOf(cookieOptions.path || '/') !== 0) {
      debug('pathname mismatch');
      next();
      return;
    }

    // ensure a secret is available or bail
    if (!secret && !req.secret) {
      next(new Error('secret option required for sessions'));
      return;
    }

    // backwards compatibility for signed cookies
    // req.secret is passed from the cookie parser middleware
    const secrets = secret || [req.secret];

    let originalHash;
    let originalId;
    let savedHash;
    let touched = false;

    // expose store
    req.sessionStore = store;

    // get the session ID from the cookie
    const cookieId = (req.sessionID = getcookie(req, name, secrets));

    // set-cookie
    onHeaders(res, function () {
      if (!req.session) {
        debug('no session');
        return;
      }

      if (!shouldSetCookie(req)) {
        return;
      }

      // only send secure cookies via https
      if (req.session.cookie.secure && !req.secure) {
        debug('not secured');
        return;
      }

      if (!touched) {
        // touch session
        req.session.touch();
        touched = true;
      }

      // set cookie
      try {
        setcookie(res, name, req.sessionID, secrets[0], req.session.cookie.data);
      } catch (err) {
        setImmediate(next, err);
      }
    });

    // proxy end() to commit the session
    const _end = res.end;
    const _write = res.write;
    let ended = false;
    res.end = function end(chunk, encoding) {
      if (ended) {
        return false;
      }

      ended = true;

      let ret;
      let sync = true;

      function writeend() {
        if (sync) {
          ret = _end.call(res, chunk, encoding);
          sync = false;
          return;
        }

        _end.call(res);
      }

      function writetop() {
        if (!sync) {
          return ret;
        }

        if (!res._header) {
          res._implicitHeader();
        }

        if (chunk == null) {
          ret = true;
          return ret;
        }

        const contentLength = Number(res.getHeader('Content-Length'));

        if (!isNaN(contentLength) && contentLength > 0) {
          // measure chunk
          chunk = !Buffer.isBuffer(chunk) ? Buffer.from(chunk, encoding) : chunk;
          encoding = undefined;

          if (chunk.length !== 0) {
            debug('split response');
            ret = _write.call(res, chunk.slice(0, chunk.length - 1));
            chunk = chunk.slice(chunk.length - 1, chunk.length);
            return ret;
          }
        }

        ret = _write.call(res, chunk, encoding);
        sync = false;

        return ret;
      }

      if (shouldDestroy(req)) {
        // destroy session
        debug('destroying');
        store.destroy(req.sessionID, function ondestroy(err) {
          if (err) {
            setImmediate(next, err);
          }

          debug('destroyed');
          writeend();
        });

        return writetop();
      }

      // no session to save
      if (!req.session) {
        debug('no session');
        return _end.call(res, chunk, encoding);
      }

      if (!touched) {
        // touch session
        req.session.touch();
        touched = true;
      }

      if (shouldSave(req)) {
        req.session.save(function onsave(err) {
          if (err) {
            setImmediate(next, err);
          }

          writeend();
        });

        return writetop();
      } else if (storeImplementsTouch && shouldTouch(req)) {
        // store implements touch method
        debug('touching');
        store.touch(req.sessionID, req.session, function ontouch(err) {
          if (err) {
            setImmediate(next, err);
          }

          debug('touched');
          writeend();
        });

        return writetop();
      }

      return _end.call(res, chunk, encoding);
    };

    // generate the session
    function generate() {
      store.generate(req);
      originalId = req.sessionID;
      originalHash = hash(req.session);
      wrapmethods(req.session);
    }

    // inflate the session
    function inflate(req, sess) {
      store.createSession(req, sess);
      originalId = req.sessionID;
      originalHash = hash(sess);

      if (!resaveSession) {
        savedHash = originalHash;
      }

      wrapmethods(req.session);
    }

    function rewrapmethods(sess, callback) {
      return function () {
        if (req.session !== sess) {
          wrapmethods(req.session);
        }

        callback.apply(this, arguments);
      };
    }

    // wrap session methods
    function wrapmethods(sess) {
      const _reload = sess.reload;
      const _save = sess.save;

      function reload(callback) {
        debug('reloading %s', this.id);
        _reload.call(this, rewrapmethods(this, callback));
      }

      function save() {
        debug('saving %s', this.id);
        savedHash = hash(this);
        _save.apply(this, arguments);
      }

      Object.defineProperty(sess, 'reload', {
        configurable: true,
        enumerable: false,
        value: reload,
        writable: true
      });

      Object.defineProperty(sess, 'save', {
        configurable: true,
        enumerable: false,
        value: save,
        writable: true
      });
    }

    // check if session has been modified
    function isModified(sess) {
      return originalId !== sess.id || originalHash !== hash(sess);
    }

    // check if session has been saved
    function isSaved(sess) {
      return originalId === sess.id && savedHash === hash(sess);
    }

    // determine if session should be destroyed
    function shouldDestroy(req) {
      return req.sessionID && unsetDestroy && req.session == null;
    }

    // determine if session should be saved to store
    function shouldSave(req) {
      // cannot set cookie without a session ID
      if (typeof req.sessionID !== 'string') {
        debug('session ignored because of bogus req.sessionID %o', req.sessionID);
        return false;
      }

      return !saveUninitializedSession && !savedHash && cookieId !== req.sessionID ?
        isModified(req.session) :
        !isSaved(req.session);
    }

    // determine if session should be touched
    function shouldTouch(req) {
      // cannot set cookie without a session ID
      if (typeof req.sessionID !== 'string') {
        debug('session ignored because of bogus req.sessionID %o', req.sessionID);
        return false;
      }

      return cookieId === req.sessionID && !shouldSave(req);
    }

    // determine if cookie should be set on response
    function shouldSetCookie(req) {
      // cannot set cookie without a session ID
      if (typeof req.sessionID !== 'string') {
        return false;
      }

      return cookieId !== req.sessionID ?
        saveUninitializedSession || isModified(req.session) :
        rollingSessions || (req.session.cookie.expires != null && isModified(req.session));
    }

    // generate a session if the browser doesn't send a sessionID
    if (!req.sessionID) {
      debug('no SID sent, generating session');
      generate();
      next();
      return;
    }

    // generate the session object
    debug('fetching %s', req.sessionID);
    store.get(req.sessionID, function (err, sess) {
      // error handling
      if (err && err.code !== 'ENOENT') {
        debug('error %j', err);
        next(err);
        return;
      }

      try {
        if (err || !sess) {
          debug('no session found');
          generate();
        } else {
          debug('session found');
          inflate(req, sess);
        }
      } catch (e) {
        next(e);
        return;
      }

      next();
    });
  };
}

/**
 * Generate a session ID for a new session.
 *
 * @return {String}
 * @private
 */

function generateSessionId() {
  return uid();
}

/**
 * Get the session ID cookie from request.
 *
 * @return {string}
 * @private
 */

function getcookie(req, name, secrets) {
  const header = req.headers.cookie;
  let raw;
  let val;

  // read from cookie header
  if (header) {
    const cookies = cookie.parse(header);

    raw = cookies[name];

    if (raw) {
      if (raw.substr(0, 2) === 's:') {
        val = unsigncookie(raw.slice(2), secrets);

        if (val === false) {
          debug('cookie signature invalid');
          val = undefined;
        }
      } else {
        debug('cookie unsigned');
      }
    }
  }

  // back-compat read from cookieParser() signedCookies data
  if (!val && req.signedCookies) {
    val = req.signedCookies[name];

    if (val) {
      deprecate('cookie should be available in req.headers.cookie');
    }
  }

  // back-compat read from cookieParser() cookies data
  if (!val && req.cookies) {
    raw = req.cookies[name];

    if (raw) {
      if (raw.substr(0, 2) === 's:') {
        val = unsigncookie(raw.slice(2), secrets);

        if (val) {
          deprecate('cookie should be available in req.headers.cookie');
        }

        if (val === false) {
          debug('cookie signature invalid');
          val = undefined;
        }
      } else {
        debug('cookie unsigned');
      }
    }
  }

  return val;
}

/**
 * Hash the given `sess` object omitting changes to `.cookie`.
 *
 * @param {Object} sess
 * @return {String}
 * @private
 */

function hash(sess) {
  // serialize
  const str = JSON.stringify(sess, function (key, val) {
    // ignore sess.cookie property
    if (this === sess && key === 'cookie') {
      return;
    }

    return val;
  });

  // hash
  return crypto.createHash('sha1').update(str, 'utf8').digest('hex');
}

/**
 * Set cookie on response.
 *
 * @private
 */

function setcookie(res, name, val, secret, options) {
  const signed = 's:' + signature.sign(val, secret);
  const data = cookie.serialize(name, signed, options);

  debug('set-cookie %s', data);
  res.appendHeader('Set-Cookie', data);
}

/**
 * Verify and decode the given `val` with `secrets`.
 *
 * @param {String} val
 * @param {Array} secrets
 * @returns {String|Boolean}
 * @private
 */
function unsigncookie(val, secrets) {
  for (let i = 0; i < secrets.length; i++) {
    const result = signature.unsign(val, secrets[i]);

    if (result !== false) {
      return result;
    }
  }

  return false;
}
