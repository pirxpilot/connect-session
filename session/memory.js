/*!
 * express-session
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */

import Store from './store.js';

/**
 * A session store in memory.
 */
export default class MemoryStore extends Store {
  #sessions = Object.create(null);

  /**
   * Get all active #sessions.
   *
   */
  async all() {
    const sessionIds = Object.keys(this.#sessions);
    const sessions = Object.create(null);

    for (let i = 0; i < sessionIds.length; i++) {
      const sessionId = sessionIds[i];
      const session = this.#getSession(sessionId);

      if (session) {
        sessions[sessionId] = session;
      }
    }

    return sessions;
  }

  /**
   * Clear all #sessions.
   */
  async clear() {
    this.#sessions = Object.create(null);
  }

  /**
   * Destroy the session associated with the given session ID.
   *
   * @param {string} sessionId
   */

  async destroy(sessionId) {
    delete this.#sessions[sessionId];
  }

  /**
   * Fetch session by the given session ID.
   *
   * @param {string} sessionId
   */
  async get(sessionId) {
    return this.#getSession(sessionId);
  }

  /**
   * Commit the given session associated with the given sessionId to the store.
   *
   * @param {string} sessionId
   * @param {object} session
   */
  async set(sessionId, session) {
    this.#sessions[sessionId] = JSON.stringify(session);
  }

  /**
   * Get number of active #sessions.
   */
  async length() {
    const sessions = await this.all();
    return Object.keys(sessions).length;
  }

  /**
   * Touch the given session object associated with the given session ID.
   *
   * @param {string} sessionId
   * @param {object} session
   */
  async touch(sessionId, session) {
    const currentSession = this.#getSession(sessionId);

    if (currentSession) {
      // update expiration
      currentSession.cookie = session.cookie;
      this.#sessions[sessionId] = JSON.stringify(currentSession);
    }
  }

  /**
   * Get session from the store.
   */
  #getSession(sessionId) {
    const json = this.#sessions[sessionId];

    if (!json) {
      return;
    }

    // parse
    const sess = JSON.parse(json);

    if (sess.cookie) {
      const expires = typeof sess.cookie.expires === 'string' ? new Date(sess.cookie.expires) : sess.cookie.expires;

      // destroy expired session
      if (expires && expires <= Date.now()) {
        delete this.#sessions[sessionId];
        return;
      }
    }

    return sess;
  }
}
