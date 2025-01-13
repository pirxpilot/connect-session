'use strict';

module.exports = {
  cookie,
  sid,
  expires,
  parseSetCookie,
  writePatch
};

function parseSetCookie(header) {
  let match;
  const pairs = [];
  const pattern = /\s*([^=;]+)(?:=([^;]*);?|;|$)/g;

  while ((match = pattern.exec(header))) {
    pairs.push({ name: match[1], value: match[2] });
  }

  const cookie = pairs.shift();

  for (let i = 0; i < pairs.length; i++) {
    match = pairs[i];
    cookie[match.name.toLowerCase()] = match.value || true;
  }

  return cookie;
}

function writePatch(res) {
  const _end = res.end;
  const _write = res.write;
  let ended = false;

  res.end = function end() {
    ended = true;
    return _end.apply(this, arguments);
  };

  res.write = function write() {
    if (ended) {
      throw new Error('write after end');
    }

    return _write.apply(this, arguments);
  };
}

/* global unescape */
function sid(res) {
  const header = cookie(res);
  const data = header && parseSetCookie(header);
  const value = data && unescape(data.value);
  const sid = value && value.substring(2, value.indexOf('.'));
  return sid || undefined;
}

function cookie(res) {
  const setCookie = res.headers['set-cookie'];
  return (setCookie && setCookie[0]) || undefined;
}

function expires(res) {
  const header = cookie(res);
  return header && parseSetCookie(header).expires;
}
