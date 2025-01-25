const assert = require('node:assert');
const utils = require('./utils');

module.exports = {
  shouldSetSessionInStore,
  shouldNotHaveHeader,
  shouldNotSetSessionInStore,
  shouldSetCookie,
  shouldSetCookieToDifferentSessionId,
  shouldSetCookieToExpireIn,
  shouldSetCookieToValue,
  shouldSetCookieWithAttribute,
  shouldSetCookieWithAttributeAndValue,
  shouldSetCookieWithoutAttribute
};

function shouldSetSessionInStore(store, delay) {
  const _set = store.set;
  let count = 0;

  store.set = function set(...args) {
    count++;

    if (!delay) {
      return _set.apply(this, args);
    }

    setTimeout(() => _set.apply(this, args), delay);
  };

  return function () {
    assert.ok(count === 1, 'should set session in store');
  };
}

function shouldNotHaveHeader(header) {
  return function (res) {
    assert.ok(
      !(header.toLowerCase() in res.headers),
      'should not have ' + header + ' header'
    );
  };
}

function shouldNotSetSessionInStore(store) {
  const _set = store.set;
  let count = 0;

  store.set = function set(...args) {
    count++;
    return _set.apply(this, args);
  };

  return function () {
    assert.ok(count === 0, 'should not set session in store');
  };
}

function shouldSetCookie(name) {
  return function (res) {
    const header = utils.cookie(res);
    const data = header && utils.parseSetCookie(header);
    assert.ok(header, 'should have a cookie header');
    assert.strictEqual(data.name, name, 'should set cookie ' + name);
  };
}

function shouldSetCookieToDifferentSessionId(id) {
  return function (res) {
    assert.notStrictEqual(utils.sid(res), id);
  };
}

function shouldSetCookieToExpireIn(name, delta) {
  return function (res) {
    const header = utils.cookie(res);
    const data = header && utils.parseSetCookie(header);
    assert.ok(header, 'should have a cookie header');
    assert.strictEqual(data.name, name, 'should set cookie ' + name);
    assert.ok('expires' in data, 'should set cookie with attribute Expires');
    assert.ok('date' in res.headers, 'should have a date header');
    assert.strictEqual(
      Date.parse(data.expires) - Date.parse(res.headers.date),
      delta,
      'should set cookie ' + name + ' to expire in ' + delta + ' ms'
    );
  };
}

function shouldSetCookieToValue(name, val) {
  return function (res) {
    const header = utils.cookie(res);
    const data = header && utils.parseSetCookie(header);
    assert.ok(header, 'should have a cookie header');
    assert.strictEqual(data.name, name, 'should set cookie ' + name);
    assert.strictEqual(
      data.value,
      val,
      'should set cookie ' + name + ' to ' + val
    );
  };
}

function shouldSetCookieWithAttribute(name, attrib) {
  return function (res) {
    const header = utils.cookie(res);
    const data = header && utils.parseSetCookie(header);
    assert.ok(header, 'should have a cookie header');
    assert.strictEqual(data.name, name, 'should set cookie ' + name);
    assert.ok(
      attrib.toLowerCase() in data,
      'should set cookie with attribute ' + attrib
    );
  };
}

function shouldSetCookieWithAttributeAndValue(name, attrib, value) {
  return function (res) {
    const header = utils.cookie(res);
    const data = header && utils.parseSetCookie(header);
    assert.ok(header, 'should have a cookie header');
    assert.strictEqual(data.name, name, 'should set cookie ' + name);
    assert.ok(
      attrib.toLowerCase() in data,
      'should set cookie with attribute ' + attrib
    );
    assert.strictEqual(
      data[attrib.toLowerCase()],
      value,
      'should set cookie with attribute ' + attrib + ' set to ' + value
    );
  };
}

function shouldSetCookieWithoutAttribute(name, attrib) {
  return function (res) {
    const header = utils.cookie(res);
    const data = header && utils.parseSetCookie(header);
    assert.ok(header, 'should have a cookie header');
    assert.strictEqual(data.name, name, 'should set cookie ' + name);
    assert.ok(
      !(attrib.toLowerCase() in data),
      'should set cookie without attribute ' + attrib
    );
  };
}
