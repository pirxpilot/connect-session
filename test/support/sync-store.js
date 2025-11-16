import session from '../../index.js';

export default class SyncStore extends session.Store {
  sessions = Object.create(null);

  destroy(sid, callback) {
    delete this.sessions[sid];
    callback();
  }

  get(sid, callback) {
    callback(null, JSON.parse(this.sessions[sid]));
  }

  set(sid, sess, callback) {
    this.sessions[sid] = JSON.stringify(sess);
    callback();
  }
}
