const session = require('../../');
const util = require('node:util');

module.exports = SmartStore;

function SmartStore() {
  session.Store.call(this);
  this.sessions = Object.create(null);
}

util.inherits(SmartStore, session.Store);

SmartStore.prototype.destroy = function destroy(sid, callback) {
  delete this.sessions[sid];
  setImmediate(callback, null);
};

SmartStore.prototype.get = function get(sid, callback) {
  let sess = this.sessions[sid];

  if (!sess) {
    return;
  }

  // parse
  sess = JSON.parse(sess);

  if (sess.cookie) {
    // expand expires into Date object
    sess.cookie.expires =
      typeof sess.cookie.expires === 'string'
        ? new Date(sess.cookie.expires)
        : sess.cookie.expires;

    // destroy expired session
    if (sess.cookie.expires && sess.cookie.expires <= Date.now()) {
      delete this.sessions[sid];
      sess = null;
    }
  }

  setImmediate(callback, null, sess);
};

SmartStore.prototype.set = function set(sid, sess, callback) {
  this.sessions[sid] = JSON.stringify(sess);
  setImmediate(callback, null);
};
