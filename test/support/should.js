import assert from 'node:assert';
import { setTimeout } from 'node:timers/promises';
import * as utils from './utils.js';

export function shouldSetSessionInStore(store, delay = 0) {
  const _set = store.set;
  let count = 0;

  store.set = async function set(...args) {
    count++;

    await setTimeout(delay);
    return _set.apply(this, args);
  };

  return () => {
    assert.ok(count === 1, 'should set session in store');
  };
}

export function shouldNotHaveHeader(header) {
  return res => {
    assert.ok(!res.headers.has(header), `should not have ${header} header`);
  };
}

export function shouldNotSetSessionInStore(store) {
  const _set = store.set;
  let count = 0;

  store.set = function set(...args) {
    count++;
    return _set.apply(this, args);
  };

  return () => {
    assert.ok(count === 0, 'should not set session in store');
  };
}

export function shouldSetCookie(name) {
  return res => {
    const header = utils.cookie(res);
    const data = header && utils.parseSetCookie(header);
    assert.ok(header, 'should have a cookie header');
    assert.strictEqual(data.name, name, `should set cookie ${name}`);
  };
}

export function shouldSetCookieToDifferentSessionId(id) {
  return res => {
    assert.notStrictEqual(utils.sid(res), id);
  };
}

export function shouldSetCookieToExpireIn(name, delta) {
  return res => {
    const header = utils.cookie(res);
    const data = header && utils.parseSetCookie(header);
    assert.ok(header, 'should have a cookie header');
    assert.strictEqual(data.name, name, `should set cookie ${name}`);
    assert.ok('expires' in data, 'should set cookie with attribute Expires');
    assert.ok(res.headers.has('date'), 'should have a date header');
    assert.strictEqual(
      Date.parse(data.expires) - Date.parse(res.headers.get('date')),
      delta,
      `should set cookie ${name} to expire in ${delta} ms`
    );
  };
}

export function shouldSetCookieToValue(name, val) {
  return res => {
    const header = utils.cookie(res);
    const data = header && utils.parseSetCookie(header);
    assert.ok(header, 'should have a cookie header');
    assert.strictEqual(data.name, name, `should set cookie ${name}`);
    assert.strictEqual(data.value, val, `should set cookie ${name} to ${val}`);
  };
}

export function shouldSetCookieWithAttribute(name, attrib) {
  return res => {
    const header = utils.cookie(res);
    const data = header && utils.parseSetCookie(header);
    assert.ok(header, 'should have a cookie header');
    assert.strictEqual(data.name, name, `should set cookie ${name}`);
    assert.ok(attrib.toLowerCase() in data, `should set cookie with attribute ${attrib}`);
  };
}

export function shouldSetCookieWithAttributeAndValue(name, attrib, value) {
  return res => {
    const header = utils.cookie(res);
    const data = header && utils.parseSetCookie(header);
    assert.ok(header, 'should have a cookie header');
    assert.strictEqual(data.name, name, `should set cookie ${name}`);
    assert.ok(attrib.toLowerCase() in data, `should set cookie with attribute ${attrib}`);
    assert.strictEqual(data[attrib.toLowerCase()], value, `should set cookie with attribute ${attrib} set to ${value}`);
  };
}

export function shouldSetCookieWithoutAttribute(name, attrib) {
  return res => {
    const header = utils.cookie(res);
    const data = header && utils.parseSetCookie(header);
    assert.ok(header, 'should have a cookie header');
    assert.strictEqual(data.name, name, `should set cookie ${name}`);
    assert.ok(!(attrib.toLowerCase() in data), `should set cookie without attribute ${attrib}`);
  };
}
