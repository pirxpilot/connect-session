import session from '../../index.js';

export default class SyncStore extends session.Store {
  #sessions = Object.create(null);

  async destroy(sid) {
    delete this.#sessions[sid];
  }

  async get(sid) {
    return JSON.parse(this.#sessions[sid]);
  }

  async set(sid, sess) {
    this.#sessions[sid] = JSON.stringify(sess);
  }
}
