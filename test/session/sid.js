const { describe, it } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const utils = require('../support/utils');
const { cookie } = utils;

const session = require('../../');

const {
  shouldSetCookie,
  shouldSetCookieToDifferentSessionId
} = require('../support/should');

const { createServer } = require('../support/server');

describe('when sid not in store', function () {
  it('should create a new session', function (_, done) {
    let count = 0;
    const store = new session.MemoryStore();
    const server = createServer({ store }, function (req, res) {
      req.session.num = req.session.num || ++count;
      res.end('session ' + req.session.num);
    });

    request(server)
      .get('/')
      .expect(shouldSetCookie('connect.sid'))
      .expect(200, 'session 1', function (err, res) {
        if (err) return done(err);
        store.clear(function (err) {
          if (err) return done(err);
          request(server)
            .get('/')
            .set('Cookie', cookie(res))
            .expect(200, 'session 2', done);
        });
      });
  });

  it('should have a new sid', function (_, done) {
    let count = 0;
    const store = new session.MemoryStore();
    const server = createServer({ store }, function (req, res) {
      req.session.num = req.session.num || ++count;
      res.end('session ' + req.session.num);
    });

    request(server)
      .get('/')
      .expect(shouldSetCookie('connect.sid'))
      .expect(200, 'session 1', function (err, res) {
        if (err) return done(err);
        store.clear(function (err) {
          if (err) return done(err);
          request(server)
            .get('/')
            .set('Cookie', cookie(res))
            .expect(shouldSetCookie('connect.sid'))
            .expect(shouldSetCookieToDifferentSessionId(utils.sid(res)))
            .expect(200, 'session 2', done);
        });
      });
  });
});

describe('when sid not properly signed', function () {
  it('should generate new session', function (_, done) {
    const store = new session.MemoryStore();
    const server = createServer({ store, key: 'sessid' }, function (req, res) {
      const isnew = req.session.active === undefined;
      req.session.active = true;
      res.end('session ' + (isnew ? 'created' : 'read'));
    });

    request(server)
      .get('/')
      .expect(shouldSetCookie('sessid'))
      .expect(200, 'session created', function (err, res) {
        if (err) return done(err);
        const val = utils.sid(res);
        assert.ok(val);
        request(server)
          .get('/')
          .set('Cookie', 'sessid=' + val)
          .expect(shouldSetCookie('sessid'))
          .expect(shouldSetCookieToDifferentSessionId(val))
          .expect(200, 'session created', done);
      });
  });

  it('should not attempt fetch from store', function (_, done) {
    const store = new session.MemoryStore();
    const server = createServer({ store, key: 'sessid' }, function (req, res) {
      const isnew = req.session.active === undefined;
      req.session.active = true;
      res.end('session ' + (isnew ? 'created' : 'read'));
    });

    request(server)
      .get('/')
      .expect(shouldSetCookie('sessid'))
      .expect(200, 'session created', function (err, res) {
        if (err) return done(err);
        const val = cookie(res).replace(/...\./, '.');

        assert.ok(val);
        request(server)
          .get('/')
          .set('Cookie', val)
          .expect(shouldSetCookie('sessid'))
          .expect(200, 'session created', done);
      });
  });
});
