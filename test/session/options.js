const { before, describe, it } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const after = require('after');

const crypto = require('node:crypto');


const utils = require('../support/utils');
const { cookie } = utils;

const session = require('../../');

const {
  shouldSetSessionInStore,
  shouldNotHaveHeader,
  shouldNotSetSessionInStore,
  shouldSetCookie,
  shouldSetCookieToValue,
  shouldSetCookieWithAttribute,
  shouldSetCookieWithoutAttribute
} = require('../support/should');

const {
  createServer,
  mountAt
} = require('../support/server');

const min = 60 * 1000;

describe('session options', function () {

  describe('proxy option', function () {
    describe('when enabled', function () {
      let server;
      before(function () {
        server = createServer({ proxy: true, cookie: { secure: true, maxAge: 5 } });
      });

      it('should trust X-Forwarded-Proto when string', function (_, done) {
        request(server)
          .get('/')
          .set('X-Forwarded-Proto', 'https')
          .expect(shouldSetCookie('connect.sid'))
          .expect(200, done);
      });

      it('should trust X-Forwarded-Proto when comma-separated list', function (_, done) {
        request(server)
          .get('/')
          .set('X-Forwarded-Proto', 'https,http')
          .expect(shouldSetCookie('connect.sid'))
          .expect(200, done);
      });

      it('should work when no header', function (_, done) {
        request(server).get('/').expect(shouldNotHaveHeader('Set-Cookie')).expect(200, done);
      });
    });

    describe('when disabled', function () {
      const ctx = {};

      before(function () {
        function setup(req) {
          req.secure = req.headers['x-secure'] ? JSON.parse(req.headers['x-secure']) : undefined;
        }

        function respond(req, res) {
          res.end(String(req.secure));
        }

        ctx.server = createServer(setup, { proxy: false, cookie: { secure: true } }, respond);
      });

      it('should not trust X-Forwarded-Proto', function (_, done) {
        request(ctx.server)
          .get('/')
          .set('X-Forwarded-Proto', 'https')
          .expect(shouldNotHaveHeader('Set-Cookie'))
          .expect(200, done);
      });

      it('should ignore req.secure', function (_, done) {
        request(ctx.server)
          .get('/')
          .set('X-Forwarded-Proto', 'https')
          .set('X-Secure', 'true')
          .expect(shouldNotHaveHeader('Set-Cookie'))
          .expect(200, 'true', done);
      });
    });

    describe('when unspecified', function () {
      const ctx = {};

      before(function () {
        function setup(req) {
          req.secure = req.headers['x-secure'] ? JSON.parse(req.headers['x-secure']) : undefined;
        }

        function respond(req, res) {
          res.end(String(req.secure));
        }

        ctx.server = createServer(setup, { cookie: { secure: true } }, respond);
      });

      it('should not trust X-Forwarded-Proto', function (_, done) {
        request(ctx.server)
          .get('/')
          .set('X-Forwarded-Proto', 'https')
          .expect(shouldNotHaveHeader('Set-Cookie'))
          .expect(200, done);
      });

      it('should use req.secure', function (_, done) {
        request(ctx.server)
          .get('/')
          .set('X-Forwarded-Proto', 'https')
          .set('X-Secure', 'true')
          .expect(shouldSetCookie('connect.sid'))
          .expect(200, 'true', done);
      });
    });
  });

  describe('cookie option', function () {
    describe('when "path" set to "/foo/bar"', function () {
      const ctx = {};

      before(function () {
        ctx.server = createServer({ cookie: { path: '/foo/bar' } });
      });

      it('should not set cookie for "/" request', function (_, done) {
        request(ctx.server).get('/').expect(shouldNotHaveHeader('Set-Cookie')).expect(200, done);
      });

      it('should not set cookie for "http://foo/bar" request', function (_, done) {
        request(ctx.server)
          .get('/')
          .set('host', 'http://foo/bar')
          .expect(shouldNotHaveHeader('Set-Cookie'))
          .expect(200, done);
      });

      it('should set cookie for "/foo/bar" request', function (_, done) {
        request(ctx.server)
          .get('/foo/bar/baz')
          .expect(shouldSetCookie('connect.sid'))
          .expect(200, done);
      });

      it('should set cookie for "/foo/bar/baz" request', function (_, done) {
        request(ctx.server)
          .get('/foo/bar/baz')
          .expect(shouldSetCookie('connect.sid'))
          .expect(200, done);
      });

      describe('when mounted at "/foo"', function () {
        before(function () {
          ctx.server = createServer(mountAt('/foo'), { cookie: { path: '/foo/bar' } });
        });

        it('should set cookie for "/foo/bar" request', function (_, done) {
          request(ctx.server)
            .get('/foo/bar')
            .expect(shouldSetCookie('connect.sid'))
            .expect(200, done);
        });

        it('should not set cookie for "/foo/foo/bar" request', function (_, done) {
          request(ctx.server)
            .get('/foo/foo/bar')
            .expect(shouldNotHaveHeader('Set-Cookie'))
            .expect(200, done);
        });
      });
    });

    describe('when "secure" set to "auto"', function () {
      const ctx = {};

      describe('when "proxy" is "true"', function () {
        before(function () {
          ctx.server = createServer({ proxy: true, cookie: { maxAge: 5, secure: 'auto' } });
        });

        it('should set secure when X-Forwarded-Proto is https', function (_, done) {
          request(ctx.server)
            .get('/')
            .set('X-Forwarded-Proto', 'https')
            .expect(shouldSetCookieWithAttribute('connect.sid', 'Secure'))
            .expect(200, done);
        });
      });

      describe('when "proxy" is "false"', function () {
        before(function () {
          ctx.server = createServer({ proxy: false, cookie: { maxAge: 5, secure: 'auto' } });
        });

        it('should not set secure when X-Forwarded-Proto is https', function (_, done) {
          request(ctx.server)
            .get('/')
            .set('X-Forwarded-Proto', 'https')
            .expect(shouldSetCookieWithoutAttribute('connect.sid', 'Secure'))
            .expect(200, done);
        });
      });

      describe('when "proxy" is undefined', function () {
        before(function () {
          function setup(req) {
            req.secure = JSON.parse(req.headers['x-secure']);
          }

          function respond(req, res) {
            res.end(String(req.secure));
          }

          ctx.server = createServer(setup, { cookie: { secure: 'auto' } }, respond);
        });

        it('should set secure if req.secure = true', function (_, done) {
          request(ctx.server)
            .get('/')
            .set('X-Secure', 'true')
            .expect(shouldSetCookieWithAttribute('connect.sid', 'Secure'))
            .expect(200, 'true', done);
        });

        it('should not set secure if req.secure = false', function (_, done) {
          request(ctx.server)
            .get('/')
            .set('X-Secure', 'false')
            .expect(shouldSetCookieWithoutAttribute('connect.sid', 'Secure'))
            .expect(200, 'false', done);
        });
      });
    });
  });

  describe('genid option', function () {
    it('should reject non-function values', function () {
      assert.throws(session.bind(null, { genid: 'bogus!' }), /genid.*must/);
    });

    it('should provide default generator', function (_, done) {
      request(createServer()).get('/').expect(shouldSetCookie('connect.sid')).expect(200, done);
    });

    it('should allow custom function', function (_, done) {
      function genid() {
        return 'apple';
      }

      request(createServer({ genid }))
        .get('/')
        .expect(
          shouldSetCookieToValue(
            'connect.sid',
            's%3Aapple.D8Y%2BpkTAmeR0PobOhY4G97PRW%2Bj7bUnP%2F5m6%2FOn1MCU'
          )
        )
        .expect(200, done);
    });

    it('should encode unsafe chars', function (_, done) {
      function genid() {
        return '%';
      }

      request(createServer({ genid }))
        .get('/')
        .expect(
          shouldSetCookieToValue(
            'connect.sid',
            's%3A%25.kzQ6x52kKVdF35Qh62AWk4ZekS28K5XYCXKa%2FOTZ01g'
          )
        )
        .expect(200, done);
    });

    it('should provide req argument', function (_, done) {
      function genid(req) {
        return req.url;
      }

      request(createServer({ genid }))
        .get('/foo')
        .expect(
          shouldSetCookieToValue(
            'connect.sid',
            's%3A%2Ffoo.paEKBtAHbV5s1IB8B2zPnzAgYmmnRPIqObW4VRYj%2FMQ'
          )
        )
        .expect(200, done);
    });
  });

  describe('key option', function () {
    it('should default to "connect.sid"', function (_, done) {
      request(createServer()).get('/').expect(shouldSetCookie('connect.sid')).expect(200, done);
    });

    it('should allow overriding', function (_, done) {
      request(createServer({ key: 'session_id' }))
        .get('/')
        .expect(shouldSetCookie('session_id'))
        .expect(200, done);
    });
  });

  describe('name option', function () {
    it('should default to "connect.sid"', function (_, done) {
      request(createServer()).get('/').expect(shouldSetCookie('connect.sid')).expect(200, done);
    });

    it('should set the cookie name', function (_, done) {
      request(createServer({ name: 'session_id' }))
        .get('/')
        .expect(shouldSetCookie('session_id'))
        .expect(200, done);
    });
  });

  describe('rolling option', function () {
    it('should default to false', function (_, done) {
      const server = createServer(null, function (req, res) {
        req.session.user = 'bob';
        res.end();
      });

      request(server)
        .get('/')
        .expect(shouldSetCookie('connect.sid'))
        .expect(200, function (err, res) {
          if (err) return done(err);
          request(server)
            .get('/')
            .set('Cookie', cookie(res))
            .expect(shouldNotHaveHeader('Set-Cookie'))
            .expect(200, done);
        });
    });

    it('should force cookie on unmodified session', function (_, done) {
      const server = createServer({ rolling: true }, function (req, res) {
        req.session.user = 'bob';
        res.end();
      });

      request(server)
        .get('/')
        .expect(shouldSetCookie('connect.sid'))
        .expect(200, function (err, res) {
          if (err) return done(err);
          request(server)
            .get('/')
            .set('Cookie', cookie(res))
            .expect(shouldSetCookie('connect.sid'))
            .expect(200, done);
        });
    });

    it('should not force cookie on uninitialized session if saveUninitialized option is set to false', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ store, rolling: true, saveUninitialized: false });

      request(server)
        .get('/')
        .expect(shouldNotSetSessionInStore(store))
        .expect(shouldNotHaveHeader('Set-Cookie'))
        .expect(200, done);
    });

    it('should force cookie and save uninitialized session if saveUninitialized option is set to true', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ store, rolling: true, saveUninitialized: true });

      request(server)
        .get('/')
        .expect(shouldSetSessionInStore(store))
        .expect(shouldSetCookie('connect.sid'))
        .expect(200, done);
    });

    it('should force cookie and save modified session even if saveUninitialized option is set to false', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ store, rolling: true, saveUninitialized: false },
        function (req, res) {
          req.session.user = 'bob';
          res.end();
        }
      );

      request(server)
        .get('/')
        .expect(shouldSetSessionInStore(store))
        .expect(shouldSetCookie('connect.sid'))
        .expect(200, done);
    });
  });

  describe('resave option', function () {
    it('should default to true', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ store }, function (req, res) {
        req.session.user = 'bob';
        res.end();
      });

      request(server)
        .get('/')
        .expect(shouldSetSessionInStore(store))
        .expect(200, function (err, res) {
          if (err) return done(err);
          request(server)
            .get('/')
            .set('Cookie', cookie(res))
            .expect(shouldSetSessionInStore(store))
            .expect(200, done);
        });
    });

    describe('when true', function () {
      it('should force save on unmodified session', function (_, done) {
        const store = new session.MemoryStore();
        const server = createServer({ store, resave: true }, function (req, res) {
          req.session.user = 'bob';
          res.end();
        });

        request(server)
          .get('/')
          .expect(shouldSetSessionInStore(store))
          .expect(200, function (err, res) {
            if (err) return done(err);
            request(server)
              .get('/')
              .set('Cookie', cookie(res))
              .expect(shouldSetSessionInStore(store))
              .expect(200, done);
          });
      });
    });

    describe('when false', function () {
      it('should prevent save on unmodified session', function (_, done) {
        const store = new session.MemoryStore();
        const server = createServer({ store, resave: false }, function (req, res) {
          req.session.user = 'bob';
          res.end();
        });

        request(server)
          .get('/')
          .expect(shouldSetSessionInStore(store))
          .expect(200, function (err, res) {
            if (err) return done(err);
            request(server)
              .get('/')
              .set('Cookie', cookie(res))
              .expect(shouldNotSetSessionInStore(store))
              .expect(200, done);
          });
      });

      it('should still save modified session', function (_, done) {
        const store = new session.MemoryStore();
        const server = createServer({ resave: false, store }, function (req, res) {
          if (req.method === 'PUT') {
            req.session.token = req.url.substr(1);
          }
          res.end('token=' + (req.session.token || ''));
        });

        request(server)
          .put('/w6RHhwaA')
          .expect(200)
          .expect(shouldSetSessionInStore(store))
          .expect('token=w6RHhwaA')
          .end(function (err, res) {
            if (err) return done(err);
            const sess = cookie(res);
            request(server)
              .get('/')
              .set('Cookie', sess)
              .expect(200)
              .expect(shouldNotSetSessionInStore(store))
              .expect('token=w6RHhwaA')
              .end(function (err) {
                if (err) return done(err);
                request(server)
                  .put('/zfQ3rzM3')
                  .set('Cookie', sess)
                  .expect(200)
                  .expect(shouldSetSessionInStore(store))
                  .expect('token=zfQ3rzM3')
                  .end(done);
              });
          });
      });

      it('should detect a "cookie" property as modified', function (_, done) {
        const store = new session.MemoryStore();
        const server = createServer({ store, resave: false }, function (req, res) {
          req.session.user = req.session.user || {};
          req.session.user.name = 'bob';
          req.session.user.cookie = req.session.user.cookie || 0;
          req.session.user.cookie++;
          res.end();
        });

        request(server)
          .get('/')
          .expect(shouldSetSessionInStore(store))
          .expect(200, function (err, res) {
            if (err) return done(err);
            request(server)
              .get('/')
              .set('Cookie', cookie(res))
              .expect(shouldSetSessionInStore(store))
              .expect(200, done);
          });
      });

      it('should pass session touch error', function (_, done) {
        const cb = after(2, done);
        const store = new session.MemoryStore();
        const server = createServer({ store, resave: false }, function (req, res) {
          req.session.hit = true;
          res.end('session saved');
        });

        store.touch = function touch(sid, sess, callback) {
          callback(new Error('boom!'));
        };

        server.on('error', function onerror(err) {
          assert.ok(err);
          assert.strictEqual(err.message, 'boom!');
          cb();
        });

        request(server)
          .get('/')
          .expect(200, 'session saved', function (err, res) {
            if (err) return cb(err);
            request(server).get('/').set('Cookie', cookie(res)).end(cb);
          });
      });
    });
  });

  describe('saveUninitialized option', function () {
    it('should default to true', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ store });

      request(server)
        .get('/')
        .expect(shouldSetSessionInStore(store))
        .expect(shouldSetCookie('connect.sid'))
        .expect(200, done);
    });

    it('should force save of uninitialized session', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ store, saveUninitialized: true });

      request(server)
        .get('/')
        .expect(shouldSetSessionInStore(store))
        .expect(shouldSetCookie('connect.sid'))
        .expect(200, done);
    });

    it('should prevent save of uninitialized session', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ store, saveUninitialized: false });

      request(server)
        .get('/')
        .expect(shouldNotSetSessionInStore(store))
        .expect(shouldNotHaveHeader('Set-Cookie'))
        .expect(200, done);
    });

    it('should still save modified session', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ store, saveUninitialized: false }, function (req, res) {
        req.session.count = req.session.count || 0;
        req.session.count++;
        res.end();
      });

      request(server)
        .get('/')
        .expect(shouldSetSessionInStore(store))
        .expect(shouldSetCookie('connect.sid'))
        .expect(200, done);
    });

    it('should pass session save error', function (_, done) {
      const cb = after(2, done);
      const store = new session.MemoryStore();
      const server = createServer({ store, saveUninitialized: true }, function (req, res) {
        res.end('session saved');
      });

      store.set = function destroy(sid, sess, callback) {
        callback(new Error('boom!'));
      };

      server.on('error', function onerror(err) {
        assert.ok(err);
        assert.strictEqual(err.message, 'boom!');
        cb();
      });

      request(server).get('/').expect(200, 'session saved', cb);
    });

    it('should prevent uninitialized session from being touched', function (_, done) {
      const cb = after(1, done);
      const store = new session.MemoryStore();
      const server = createServer({ saveUninitialized: false, store, cookie: { maxAge: min } },
        function (req, res) {
          res.end();
        }
      );

      store.touch = function () {
        cb(new Error('should not be called'));
      };

      request(server).get('/').expect(200, cb);
    });
  });

  describe('secret option', function () {
    it('should reject empty arrays', function () {
      assert.throws(createServer.bind(null, { secret: [] }), /secret option array/);
    });

    it('should sign and unsign with a string', function (_, done) {
      const server = createServer({ secret: 'awesome cat' }, function (req, res) {
        if (!req.session.user) {
          req.session.user = 'bob';
          res.end('set');
        } else {
          res.end('get:' + JSON.stringify(req.session.user));
        }
      });

      request(server)
        .get('/')
        .expect(shouldSetCookie('connect.sid'))
        .expect(200, 'set', function (err, res) {
          if (err) return done(err);
          request(server).get('/').set('Cookie', cookie(res)).expect(200, 'get:"bob"', done);
        });
    });

    it('should sign and unsign with a Buffer', function (_, done) {
      const server = createServer({ secret: crypto.randomBytes(32) }, function (req, res) {
        if (!req.session.user) {
          req.session.user = 'bob';
          res.end('set');
        } else {
          res.end('get:' + JSON.stringify(req.session.user));
        }
      });

      request(server)
        .get('/')
        .expect(shouldSetCookie('connect.sid'))
        .expect(200, 'set', function (err, res) {
          if (err) return done(err);
          request(server).get('/').set('Cookie', cookie(res)).expect(200, 'get:"bob"', done);
        });
    });

    describe('when an array', function () {
      it('should sign cookies', function (_, done) {
        const server = createServer({ secret: ['keyboard cat', 'nyan cat'] }, function (req, res) {
          req.session.user = 'bob';
          res.end(req.session.user);
        });

        request(server).get('/').expect(shouldSetCookie('connect.sid')).expect(200, 'bob', done);
      });

      it('should sign cookies with first element', function (_, done) {
        const store = new session.MemoryStore();

        const server1 = createServer({ secret: ['keyboard cat', 'nyan cat'], store },
          function (req, res) {
            req.session.user = 'bob';
            res.end(req.session.user);
          }
        );

        const server2 = createServer({ secret: 'nyan cat', store }, function (req, res) {
          res.end(String(req.session.user));
        });

        request(server1)
          .get('/')
          .expect(shouldSetCookie('connect.sid'))
          .expect(200, 'bob', function (err, res) {
            if (err) return done(err);
            request(server2).get('/').set('Cookie', cookie(res)).expect(200, 'undefined', done);
          });
      });

      it('should read cookies using all elements', function (_, done) {
        const store = new session.MemoryStore();

        const server1 = createServer({ secret: 'nyan cat', store }, function (req, res) {
          req.session.user = 'bob';
          res.end(req.session.user);
        });

        const server2 = createServer({ secret: ['keyboard cat', 'nyan cat'], store },
          function (req, res) {
            res.end(String(req.session.user));
          }
        );

        request(server1)
          .get('/')
          .expect(shouldSetCookie('connect.sid'))
          .expect(200, 'bob', function (err, res) {
            if (err) return done(err);
            request(server2).get('/').set('Cookie', cookie(res)).expect(200, 'bob', done);
          });
      });
    });
  });

  describe('unset option', function () {
    it('should reject unknown values', function () {
      assert.throws(session.bind(null, { unset: 'bogus!' }), /unset.*must/);
    });

    it('should default to keep', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ store }, function (req, res) {
        req.session.count = req.session.count || 0;
        req.session.count++;
        if (req.session.count === 2) req.session = null;
        res.end();
      });

      request(server)
        .get('/')
        .expect(200, function (err, res) {
          if (err) return done(err);
          store.length(function (err, len) {
            if (err) return done(err);
            assert.strictEqual(len, 1);
            request(server)
              .get('/')
              .set('Cookie', cookie(res))
              .expect(200, function (err, res) {
                if (err) return done(err);
                store.length(function (err, len) {
                  if (err) return done(err);
                  assert.strictEqual(len, 1);
                  done();
                });
              });
          });
        });
    });

    it('should allow destroy on req.session = null', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ store, unset: 'destroy' }, function (req, res) {
        req.session.count = req.session.count || 0;
        req.session.count++;
        if (req.session.count === 2) req.session = null;
        res.end();
      });

      request(server)
        .get('/')
        .expect(200, function (err, res) {
          if (err) return done(err);
          store.length(function (err, len) {
            if (err) return done(err);
            assert.strictEqual(len, 1);
            request(server)
              .get('/')
              .set('Cookie', cookie(res))
              .expect(200, function (err, res) {
                if (err) return done(err);
                store.length(function (err, len) {
                  if (err) return done(err);
                  assert.strictEqual(len, 0);
                  done();
                });
              });
          });
        });
    });

    it('should not set cookie if initial session destroyed', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ store, unset: 'destroy' }, function (req, res) {
        req.session = null;
        res.end();
      });

      request(server)
        .get('/')
        .expect(shouldNotHaveHeader('Set-Cookie'))
        .expect(200, function (err, res) {
          if (err) return done(err);
          store.length(function (err, len) {
            if (err) return done(err);
            assert.strictEqual(len, 0);
            done();
          });
        });
    });

    it('should pass session destroy error', function (_, done) {
      const cb = after(2, done);
      const store = new session.MemoryStore();
      const server = createServer({ store, unset: 'destroy' }, function (req, res) {
        req.session = null;
        res.end('session destroyed');
      });

      store.destroy = function destroy(sid, callback) {
        callback(new Error('boom!'));
      };

      server.on('error', function onerror(err) {
        assert.ok(err);
        assert.strictEqual(err.message, 'boom!');
        cb();
      });

      request(server).get('/').expect(200, 'session destroyed', cb);
    });
  });

});
