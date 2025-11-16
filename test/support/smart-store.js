import session from '../../index.js';

export default class SmartStore extends session.Store {
  #sessions = Object.create(null);

  async destroy(sid) {
    delete this.#sessions[sid];
  }

  async get(sid) {
    let sess = this.#sessions[sid];

    if (!sess) {
      return;
    }

    // parse
    sess = JSON.parse(sess);

    if (sess.cookie) {
      // expand expires into Date object
      sess.cookie.expires =
        typeof sess.cookie.expires === 'string' ? new Date(sess.cookie.expires) : sess.cookie.expires;

      // destroy expired session
      if (sess.cookie.expires && sess.cookie.expires <= Date.now()) {
        delete this.#sessions[sid];
        sess = null;
      }
    }

    return sess;
  }

  async set(sid, sess) {
    this.#sessions[sid] = JSON.stringify(sess);
  }
}
