const { ServerResponse } = require('node:http');

const { serialize } = require('cookie');
const { sign } = require('cookie-signature');

module.exports = decorate;

const proto = Object.create(ServerResponse.prototype);
Object.assign(proto, {
  cookie
});

function decorate(res) {
  Object.setPrototypeOf(res, proto);
}

function cookie(name, value, options = {}) {
  const { signed, maxAge, ...opts } = options;

  if (signed) {
    const { secret } = this.req;
    if (!secret) {
      throw new Error('cookieParser("secret") required for signed cookies');
    }
    value = `s:${sign(value, secret)}`;
  }

  opts.path ??= '/';
  if (maxAge != null) {
    if (!Number.isNaN(maxAge)) {
      opts.expires = new Date(Date.now() + maxAge);
      opts.maxAge = Math.floor(maxAge / 1000);
    }
  }

  this.appendHeader('Set-Cookie', serialize(name, value, opts));
  return this;
}
