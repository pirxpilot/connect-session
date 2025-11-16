/*!
 * Connect - session - Session
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * MIT Licensed
 */

/**
 * Create a new `Session` with the given request and `data`.
 *
 * @param {IncomingRequest} req
 * @param {Object} data
 */

export default class Session {
  constructor(req, data) {
    Object.defineProperty(this, 'req', { value: req });
    Object.defineProperty(this, 'id', { value: req.sessionID });

    if (typeof data === 'object' && data !== null) {
      // merge data into this, ignoring prototype properties
      for (const prop in data) {
        if (!(prop in this)) {
          this[prop] = data[prop];
        }
      }
    }
  }

  /**
   * Update reset `.cookie.maxAge` to prevent
   * the cookie from expiring when the
   * session is still active.
   *
   * @return {Session} for chaining
   */

  touch() {
    return this.resetMaxAge();
  }

  /**
   * Reset `.maxAge` to `.originalMaxAge`.
   *
   * @return {Session} for chaining
   */

  resetMaxAge() {
    this.cookie.maxAge = this.cookie.originalMaxAge;
    return this;
  }

  /**
   * Save the session data`.
   *
   * @return {Session} for chaining
   */

  async save() {
    await this.req.sessionStore.set(this.id, this);
    return this;
  }

  /**
   * Re-loads the session data _without_ altering
   * the maxAge properties. If no exception has occurred the
   * `req.session` property will be a new `Session` object,
   * although representing the same session.
   *
   * @return {Session} for chaining
   */

  async reload() {
    const req = this.req;
    const store = this.req.sessionStore;

    const sess = await store.get(this.id);
    if (!sess) throw new Error('failed to load session');
    store.createSession(req, sess);
  }

  /**
   * Destroy `this` session.
   *
   * @return {Session} for chaining
   */

  async destroy() {
    delete this.req.session;
    await this.req.sessionStore.destroy(this.id);
    return this;
  }

  /**
   * Regenerate this request's session.
   *
   * @return {Session} for chaining
   */
  async regenerate() {
    await this.req.sessionStore.regenerate(this.req);
    return this;
  }
}
