'use strict';

module.exports = {
  cookie,
  sid,
  expires,
  parseSetCookie,
  writePatch
};

function parseSetCookie(header = '') {
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

function sid(res) {
  const header = cookie(res);
  const data = parseSetCookie(header);
  if (!data) {
    return;
  }
  const value = decodeURIComponent(data.value);
  return value?.slice(2, value.indexOf('.'));
}

function cookie(res) {
  return res.headers['set-cookie']?.[0];
}

function expires(res) {
  const header = cookie(res);
  return parseSetCookie(header).expires;
}
