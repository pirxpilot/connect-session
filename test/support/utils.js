const { promisify } = require('node:util');

module.exports = {
  cookie,
  sid,
  expires,
  parseSetCookie,
  writePatch,
  storeGet,
  storeLen,
  storeSet,
  storeLoad,
  storeClear
};

function storeLen(store) {
  const fn = promisify(store.length).bind(store);
  return fn();
}

function storeGet(store, ...args) {
  const fn = promisify(store.get).bind(store);
  return fn(...args);
}

function storeSet(store, ...args) {
  const fn = promisify(store.set).bind(store);
  return fn(...args);
}

function storeLoad(store, ...args) {
  const fn = promisify(store.load).bind(store);
  return fn(...args);
}

function storeClear(store) {
  const fn = promisify(store.clear).bind(store);
  return fn();
}

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

  res.end = function end(...args) {
    ended = true;
    return _end.apply(this, args);
  };

  res.write = function write(...args) {
    if (ended) {
      throw new Error('write after end');
    }

    return _write.apply(this, args);
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
  return res.headers.getSetCookie()[0];
}

function expires(res) {
  const header = cookie(res);
  return parseSetCookie(header).expires;
}
