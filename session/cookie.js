/*!
 * Connect - session - Cookie
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * MIT Licensed
 */

const deprecate = require('depd')('connect-session');

/**
 * Initialize a new `Cookie` with the given `options`.
 *
 * @param {IncomingMessage} req
 * @param {Object} options
 */

const Cookie = (module.exports = function Cookie(options) {
  this.path = '/';
  this.maxAge = null;
  this.httpOnly = true;

  if (options) {
    if (typeof options !== 'object') {
      throw new TypeError('argument options must be a object');
    }

    for (const key in options) {
      if (key !== 'data') {
        this[key] = options[key];
      }
    }
  }

  if (this.originalMaxAge === undefined || this.originalMaxAge === null) {
    this.originalMaxAge = this.maxAge;
  }
});

/*!
 * Prototype.
 */

Cookie.prototype = {
  /**
   * Set expires `date`.
   *
   * @param {Date} date
   */

  set expires(date) {
    this._expires = date;
    this.originalMaxAge = this.maxAge;
  },

  /**
   * Get expires `date`.
   *
   * @return {Date}
   */

  get expires() {
    return this._expires;
  },

  /**
   * Set expires via max-age in `ms`.
   *
   * @param {Number} ms
   */

  set maxAge(ms) {
    if (ms && typeof ms !== 'number' && !(ms instanceof Date)) {
      throw new TypeError('maxAge must be a number or Date');
    }

    if (ms instanceof Date) {
      deprecate('maxAge as Date; pass number of milliseconds instead');
    }

    this.expires = typeof ms === 'number' ? new Date(Date.now() + ms) : ms;
  },

  /**
   * Get expires max-age in `ms`.
   *
   * @return {Number}
   */

  get maxAge() {
    return this.expires instanceof Date ? this.expires.valueOf() - Date.now() : this.expires;
  },

  /**
   * Return cookie data object.
   *
   * @return {Object}
   */

  get data() {
    return {
      originalMaxAge: this.originalMaxAge,
      partitioned: this.partitioned,
      priority: this.priority,
      expires: this._expires,
      secure: this.secure,
      httpOnly: this.httpOnly,
      domain: this.domain,
      path: this.path,
      sameSite: this.sameSite
    };
  },

  /**
   * Return JSON representation of this cookie.
   *
   * @return {Object}
   */

  toJSON() {
    return this.data;
  }
};
