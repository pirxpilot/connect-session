export function parseSetCookie(header = '') {
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

export function writePatch(res) {
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

export function sid(res) {
  const header = cookie(res);
  const data = parseSetCookie(header);
  if (!data) {
    return;
  }
  const value = decodeURIComponent(data.value);
  return value?.slice(2, value.indexOf('.'));
}

export function cookie(res) {
  return res.headers.getSetCookie()[0];
}

export function expires(res) {
  const header = cookie(res);
  return parseSetCookie(header).expires;
}
