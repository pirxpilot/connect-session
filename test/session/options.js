const { before, describe, it, after } = require('node:test');
const assert = require('node:assert');
const { fetch } = require('supertest-fetch');
const utils = require('../support/utils');
const { cookie, storeLen } = utils;

const session = require('../../');

const {
  shouldSetSessionInStore,
  shouldNotSetSessionInStore,
  shouldSetCookieToValue,
  shouldSetCookieWithAttribute,
  shouldSetCookieWithoutAttribute
} = require('../support/should');

const { createServer, mountAt } = require('../support/server');

const min = 60 * 1000;

describe('session options', function () {
  describe('cookie option', function () {
    describe('when "path" set to "/foo/bar"', function () {
      const ctx = {};

      before(function () {
        ctx.server = createServer({ cookie: { path: '/foo/bar' } });
      });

      after(function () {
        ctx.server.close();
      });

      it('should not set cookie for "/" request', async function () {
        await fetch(ctx.server, '/')
          .expectHeader('Set-Cookie', null)
          .expectStatus(200);
      });

      it('should not set cookie for "http://foo/bar" request', async function () {
        await fetch(ctx.server, '/', { headers: { host: 'http://foo/bar' } })
          .expectHeader('Set-Cookie', null)
          .expectStatus(200);
      });

      it('should set cookie for "/foo/bar" request', async function () {
        await fetch(ctx.server, '/foo/bar/baz')
          .expectHeader('Set-Cookie', /connect.sid/)
          .expectStatus(200);
      });

      it('should set cookie for "/foo/bar/baz" request', async function () {
        await fetch(ctx.server, '/foo/bar/baz')
          .expectHeader('Set-Cookie', /connect.sid/)
          .expectStatus(200);
      });

      describe('when mounted at "/foo"', function () {
        before(function () {
          ctx.server = createServer(mountAt('/foo'), {
            cookie: { path: '/foo/bar' }
          });
        });

        after(function () {
          ctx.server.close();
        });

        it('should set cookie for "/foo/bar" request', async function () {
          await fetch(ctx.server, '/foo/bar')
            .expectHeader('Set-Cookie', /connect.sid/)
            .expectStatus(200);
        });

        it('should not set cookie for "/foo/foo/bar" request', async function () {
          await fetch(ctx.server, '/foo/foo/bar')
            .expectHeader('Set-Cookie', null)
            .expectStatus(200);
        });
      });
    });

    describe('when "secure" set to "auto"', function () {
      const ctx = {};

      before(function () {
        function setup(req) {
          req.secure = JSON.parse(req.headers['x-secure']);
        }

        function respond(req, res) {
          res.end(String(req.secure));
        }

        ctx.server = createServer(
          setup,
          { cookie: { secure: 'auto' } },
          respond
        );
      });

      it('should set secure if req.secure = true', async function () {
        const check = shouldSetCookieWithAttribute('connect.sid', 'Secure');
        const res = await fetch(ctx.server, '/', {
          headers: { 'X-Secure': 'true' }
        }).expect(200, 'true');
        check(res);
      });

      it('should not set secure if req.secure = false', async function () {
        const check = shouldSetCookieWithoutAttribute('connect.sid', 'Secure');
        const res = await fetch(ctx.server, '/', {
          headers: { 'X-Secure': 'false' }
        }).expect(200, 'false');
        check(res);
      });
    });
  });

  describe('genid option', function () {
    it('should reject non-function values', function () {
      assert.throws(session.bind(null, { genid: 'bogus!' }), /genid.*must/);
    });

    it('should provide default generator', async function () {
      await fetch(createServer(), '/')
        .expectHeader('Set-Cookie', /connect.sid/)
        .expectStatus(200);
    });

    it('should allow custom function', async function () {
      function genid() {
        return 'apple';
      }

      const check = shouldSetCookieToValue(
        'connect.sid',
        's%3Aapple.D8Y%2BpkTAmeR0PobOhY4G97PRW%2Bj7bUnP%2F5m6%2FOn1MCU'
      );

      const res = await fetch(createServer({ genid }), '/').expectStatus(200);
      check(res);
    });

    it('should encode unsafe chars', async function () {
      function genid() {
        return '%';
      }

      const check = shouldSetCookieToValue(
        'connect.sid',
        's%3A%25.kzQ6x52kKVdF35Qh62AWk4ZekS28K5XYCXKa%2FOTZ01g'
      );

      const res = await fetch(createServer({ genid }), '/').expectStatus(200);
      check(res);
    });

    it('should provide req argument', async function () {
      function genid(req) {
        return req.url;
      }

      const check = shouldSetCookieToValue(
        'connect.sid',
        's%3A%2Ffoo.paEKBtAHbV5s1IB8B2zPnzAgYmmnRPIqObW4VRYj%2FMQ'
      );

      const res = await fetch(createServer({ genid }), '/foo').expectStatus(
        200
      );
      check(res);
    });
  });

  describe('key option', function () {
    it('should default to "connect.sid"', async function () {
      await fetch(createServer(), '/')
        .expectHeader('Set-Cookie', /connect.sid/)
        .expectStatus(200);
    });

    it('should allow overriding', async function () {
      await fetch(createServer({ key: 'session_id' }), '/')
        .expectHeader('Set-Cookie', /session_id/)
        .expectStatus(200);
    });
  });

  describe('name option', function () {
    it('should default to "connect.sid"', async function () {
      await fetch(createServer(), '/')
        .expectHeader('Set-Cookie', /connect.sid/)
        .expectStatus(200);
    });

    it('should set the cookie name', async function () {
      await fetch(createServer({ name: 'session_id' }), '/')
        .expectHeader('Set-Cookie', /session_id/)
        .expectStatus(200);
    });
  });

  describe('rolling option', function () {
    it('should default to false', async function () {
      const server = createServer(null, function (req, res) {
        req.session.user = 'bob';
        res.end();
      });

      const res = await fetch(server, '/')
        .expectHeader('Set-Cookie', /connect.sid/)
        .expectStatus(200);
      await fetch(server, '/', { headers: { Cookie: cookie(res) } })
        .expectHeader('Set-Cookie', null)
        .expectStatus(200);
    });

    it('should force cookie on unmodified session', async function () {
      const server = createServer({ rolling: true }, function (req, res) {
        req.session.user = 'bob';
        res.end();
      });

      const res = await fetch(server, '/')
        .expectHeader('Set-Cookie', /connect.sid/)
        .expectStatus(200);
      await fetch(server, '/', { headers: { Cookie: cookie(res) } })
        .expectHeader('Set-Cookie', /connect.sid/)
        .expectStatus(200);
    });

    it('should not force cookie on uninitialized session if saveUninitialized option is set to false', async function () {
      const store = new session.MemoryStore();
      const server = createServer({
        store,
        rolling: true,
        saveUninitialized: false
      });

      const check = shouldNotSetSessionInStore(store);
      await fetch(server, '/')
        .expectHeader('Set-Cookie', null)
        .expectStatus(200);
      check();
    });

    it('should force cookie and save uninitialized session if saveUninitialized option is set to true', async function () {
      const store = new session.MemoryStore();
      const server = createServer({
        store,
        rolling: true,
        saveUninitialized: true
      });

      const check = shouldSetSessionInStore(store);
      await fetch(server, '/')
        .expectHeader('Set-Cookie', /connect.sid/)
        .expectStatus(200);
      check();
    });

    it('should force cookie and save modified session even if saveUninitialized option is set to false', async function () {
      const store = new session.MemoryStore();
      const server = createServer(
        { store, rolling: true, saveUninitialized: false },
        function (req, res) {
          req.session.user = 'bob';
          res.end();
        }
      );

      const check = shouldSetSessionInStore(store);
      await fetch(server, '/')
        .expectHeader('Set-Cookie', /connect.sid/)
        .expectStatus(200);
      check();
    });
  });

  describe('resave option', function () {
    it('should default to true', async function () {
      const store = new session.MemoryStore();
      const server = createServer({ store }, function (req, res) {
        req.session.user = 'bob';
        res.end();
      });

      let check = shouldSetSessionInStore(store);
      const res = await fetch(server, '/').expectStatus(200);
      check();
      check = shouldSetSessionInStore(store);
      await fetch(server, '/', {
        headers: { Cookie: cookie(res) }
      }).expectStatus(200);
      check();
    });

    describe('when true', function () {
      it('should force save on unmodified session', async function () {
        const store = new session.MemoryStore();
        const server = createServer(
          { store, resave: true },
          function (req, res) {
            req.session.user = 'bob';
            res.end();
          }
        );
        let check = shouldSetSessionInStore(store);

        const res = await fetch(server, '/').expectStatus(200);
        check();
        check = shouldSetSessionInStore(store);

        await fetch(server, '/', {
          headers: { Cookie: cookie(res) }
        }).expectStatus(200);
        check();
      });
    });

    describe('when false', function () {
      it('should prevent save on unmodified session', async function () {
        const store = new session.MemoryStore();
        const server = createServer(
          { store, resave: false },
          function (req, res) {
            req.session.user = 'bob';
            res.end();
          }
        );

        let check = shouldSetSessionInStore(store);

        const res = await fetch(server, '/').expectStatus(200);
        check();
        check = shouldNotSetSessionInStore(store);
        await fetch(server, '/', {
          headers: { Cookie: cookie(res) }
        }).expectStatus(200);
        check();
      });

      it('should still save modified session', async function () {
        const store = new session.MemoryStore();

        const server = createServer(
          { resave: false, store },
          function (req, res) {
            if (req.method === 'PUT') {
              req.session.token = req.url.substr(1);
            }
            res.end('token=' + (req.session.token || ''));
          }
        );

        let check = shouldSetSessionInStore(store);
        const res = await fetch(server, '/w6RHhwaA', { method: 'PUT' })
          .expectStatus(200)
          .expect('token=w6RHhwaA');
        check();
        const sess = cookie(res);

        check = shouldNotSetSessionInStore(store);
        await fetch(server, '/', { headers: { Cookie: sess } })
          .expectStatus(200)
          .expect('token=w6RHhwaA');
        check();

        check = shouldSetSessionInStore(store);
        await fetch(server, '/zfQ3rzM3', {
          method: 'PUT',
          headers: { Cookie: sess }
        })
          .expectStatus(200)
          .expect('token=zfQ3rzM3');
        check();
      });

      it('should detect a "cookie" property as modified', async function () {
        const store = new session.MemoryStore();
        const server = createServer(
          { store, resave: false },
          function (req, res) {
            req.session.user = req.session.user || {};
            req.session.user.name = 'bob';
            req.session.user.cookie = req.session.user.cookie || 0;
            req.session.user.cookie++;
            res.end();
          }
        );

        let check = shouldSetSessionInStore(store);
        const res = await fetch(server, '/').expectStatus(200);
        check();

        check = shouldSetSessionInStore(store);
        await fetch(server, '/', {
          headers: { Cookie: cookie(res) }
        }).expectStatus(200);
        check();
      });

      it('should pass session touch error', async function () {
        const store = new session.MemoryStore();
        const server = createServer(
          { store, resave: false },
          function (req, res) {
            req.session.hit = true;
            res.end('session saved');
          }
        );

        store.touch = function touch(sid, sess, callback) {
          callback(new Error('boom!'));
        };

        const { promise, resolve } = Promise.withResolvers();

        server.on('error', function onerror(err) {
          assert.ok(err);
          assert.strictEqual(err.message, 'boom!');
          resolve();
        });

        const res = await fetch(server, '/').expect(200, 'session saved');
        await Promise.all([
          promise,
          await fetch(server, '/', { headers: { Cookie: cookie(res) } })
        ]);
      });
    });
  });

  describe('saveUninitialized option', function () {
    it('should default to true', async function () {
      const store = new session.MemoryStore();
      const server = createServer({ store });

      const check = shouldSetSessionInStore(store);
      await fetch(server, '/')
        .expectHeader('Set-Cookie', /connect.sid/)
        .expectStatus(200);
      check();
    });

    it('should force save of uninitialized session', async function () {
      const store = new session.MemoryStore();
      const server = createServer({ store, saveUninitialized: true });

      const check = shouldSetSessionInStore(store);
      await fetch(server, '/')
        .expectHeader('Set-Cookie', /connect.sid/)
        .expectStatus(200);
      check();
    });

    it('should prevent save of uninitialized session', async function () {
      const store = new session.MemoryStore();
      const server = createServer({ store, saveUninitialized: false });

      const check = shouldNotSetSessionInStore(store);
      const res = await fetch(server, '/')
        .expectHeader('Set-Cookie', null)
        .expectStatus(200);
      check(res);
    });

    it('should still save modified session', async function () {
      const store = new session.MemoryStore();
      const server = createServer(
        { store, saveUninitialized: false },
        function (req, res) {
          req.session.count = req.session.count || 0;
          req.session.count++;
          res.end();
        }
      );

      const check = shouldSetSessionInStore(store);
      const res = await fetch(server, '/')
        .expectHeader('Set-Cookie', /connect.sid/)
        .expectStatus(200);
      check(res);
    });

    it('should pass session save error', async function () {
      const store = new session.MemoryStore();
      const server = createServer(
        { store, saveUninitialized: true },
        function (req, res) {
          res.end('session saved');
        }
      );

      store.set = function destroy(sid, sess, callback) {
        callback(new Error('boom!'));
      };

      const { promise, resolve } = Promise.withResolvers();
      server.on('error', function onerror(err) {
        assert.ok(err);
        assert.strictEqual(err.message, 'boom!');
        resolve();
      });

      await Promise.all([
        fetch(server, '/').expect(200, 'session saved'),
        promise
      ]);
    });

    it('should prevent uninitialized session from being touched', async function () {
      const store = new session.MemoryStore();
      const server = createServer(
        { saveUninitialized: false, store, cookie: { maxAge: min } },
        function (req, res) {
          res.end();
        }
      );

      store.touch = function () {
        assert.fail('should not call touch');
      };

      await fetch(server, '/').expectStatus(200);
    });
  });

  describe('secret option', function () {
    it('should sign and unsign with a string', async function () {
      const server = createServer(
        { secret: 'awesome cat' },
        function (req, res) {
          if (!req.session.user) {
            req.session.user = 'bob';
            res.end('set');
          } else {
            res.end('get:' + JSON.stringify(req.session.user));
          }
        }
      );

      const res = await fetch(server, '/')
        .expectHeader('Set-Cookie', /connect.sid/)
        .expect(200, 'set');
      await fetch(server, '/', { headers: { Cookie: cookie(res) } }).expect(
        200,
        'get:"bob"'
      );
    });

    describe('when an array', function () {
      it('should sign cookies', async function () {
        const server = createServer(
          { secret: ['keyboard cat', 'nyan cat'] },
          function (req, res) {
            req.session.user = 'bob';
            res.end(req.session.user);
          }
        );

        await fetch(server, '/')
          .expectHeader('Set-Cookie', /connect.sid/)
          .expect(200, 'bob');
      });

      it('should sign cookies with first element', async function () {
        const store = new session.MemoryStore();

        const server1 = createServer(
          { secret: ['keyboard cat', 'nyan cat'], store },
          function (req, res) {
            req.session.user = 'bob';
            res.end(req.session.user);
          }
        );

        const server2 = createServer(
          { secret: 'nyan cat', store },
          function (req, res) {
            res.end(String(req.session.user));
          }
        );

        const res = await fetch(server1, '/')
          .expectHeader('Set-Cookie', /connect.sid/)
          .expect(200, 'bob');

        await fetch(server2, '/', { headers: { Cookie: cookie(res) } }).expect(
          200
        );
      });

      it('should read cookies using all elements', async function () {
        const store = new session.MemoryStore();

        const server1 = createServer(
          { secret: 'nyan cat', store },
          function (req, res) {
            req.session.user = 'bob';
            res.end(req.session.user);
          }
        );

        const server2 = createServer(
          { secret: ['keyboard cat', 'nyan cat'], store },
          function (req, res) {
            res.end(String(req.session.user));
          }
        );

        const res = await fetch(server1, '/')
          .expectHeader('Set-Cookie', /connect.sid/)
          .expect(200, 'bob');
        await fetch(server2, '/', {
          headers: {
            Cookie: cookie(res)
          }
        }).expect(200, 'bob');
      });
    });
  });

  describe('unset option', function () {
    it('should reject unknown values', function () {
      assert.throws(session.bind(null, { unset: 'bogus!' }), /unset.*must/);
    });

    it('should default to keep', async function () {
      const store = new session.MemoryStore();
      const server = createServer({ store }, function (req, res) {
        req.session.count = req.session.count || 0;
        req.session.count++;
        if (req.session.count === 2) req.session = null;
        res.end();
      });

      const res = await fetch(server, '/').expectStatus(200);
      let len = await storeLen(store);
      assert.strictEqual(len, 1);
      await fetch(server, '/', { headers: { Cookie: cookie(res) } }).expect(
        200
      );
      len = await storeLen(store);
      assert.strictEqual(len, 1);
    });

    it('should allow destroy on req.session = null', async function () {
      const store = new session.MemoryStore();
      const server = createServer(
        { store, unset: 'destroy' },
        function (req, res) {
          req.session.count = req.session.count || 0;
          req.session.count++;
          if (req.session.count === 2) req.session = null;
          res.end();
        }
      );

      const res = await fetch(server, '/').expectStatus(200);
      let len = await storeLen(store);
      assert.strictEqual(len, 1);

      await fetch(server, '/', {
        headers: { Cookie: cookie(res) }
      }).expectStatus(200);
      len = await storeLen(store);
      assert.strictEqual(len, 0);
    });

    it('should not set cookie if initial session destroyed', async function () {
      const store = new session.MemoryStore();
      const server = createServer(
        { store, unset: 'destroy' },
        function (req, res) {
          req.session = null;
          res.end();
        }
      );

      const res = await fetch(server, '/')
        .expectHeader('Set-Cookie', null)
        .expectStatus(200);

      const len = await storeLen(store);
      assert.strictEqual(len, 0);
    });

    it('should pass session destroy error', async function () {
      const store = new session.MemoryStore();
      const server = createServer(
        { store, unset: 'destroy' },
        function (req, res) {
          req.session = null;
          res.end('session destroyed');
        }
      );

      store.destroy = function destroy(sid, callback) {
        callback(new Error('boom!'));
      };

      const { promise, resolve } = Promise.withResolvers();
      server.on('error', function onerror(err) {
        assert.ok(err);
        assert.strictEqual(err.message, 'boom!');
        resolve();
      });

      await Promise.all([
        fetch(server, '/').expect(200, 'session destroyed'),
        promise
      ]);
    });
  });
});
