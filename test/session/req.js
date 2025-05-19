const { before, describe, it, after } = require('node:test');
const assert = require('node:assert');
const { fetch } = require('supertest-fetch');
const timers = require('node:timers/promises');
const http = require('node:http');

const utils = require('../support/utils');
const { cookie, storeGet, storeLoad } = utils;
const SmartStore = require('../support/smart-store');

const session = require('../../');

const {
  shouldSetSessionInStore,
  shouldSetCookieToExpireIn,
  shouldSetCookieToDifferentSessionId,
  shouldSetCookieWithAttributeAndValue,
  shouldSetCookieToValue,
  shouldSetCookieWithAttribute,
  shouldSetCookieWithoutAttribute
} = require('../support/should');

const { createServer, createRequestListener } = require('../support/server');

const min = 60 * 1000;

describe('req.session', function () {
  it('should persist', async function () {
    const store = new session.MemoryStore();
    const server = createServer({ store }, function (req, res) {
      req.session.count = req.session.count || 0;
      req.session.count++;
      res.end('hits: ' + req.session.count);
    });

    const res = await fetch(server, '/').expect(200, 'hits: 1');
    const sess = await storeLoad(store, utils.sid(res));
    assert.ok(sess);
    await fetch(server, '/', { headers: { Cookie: cookie(res) } }).expect(
      200,
      'hits: 2'
    );
  });

  it('should only set-cookie when modified', async function () {
    let modify = true;
    const server = createServer(null, function (req, res) {
      if (modify) {
        req.session.count = req.session.count || 0;
        req.session.count++;
      }
      res.end(req.session.count.toString());
    });

    let res = await fetch(server, '/').expect(200, '1');
    res = await fetch(server, '/', { headers: { Cookie: cookie(res) } }).expect(
      200,
      '2'
    );
    const val = cookie(res);
    modify = false;

    res = await fetch(server, '/', { headers: { Cookie: val } })
      .expect('Set-Cookie', null)
      .expect(200, '2');

    modify = true;

    await fetch(server, '/', { headers: { Cookie: val } })
      .expect('Set-Cookie', /connect.sid/)
      .expect(200, '3');
  });

  it('should not have enumerable methods', async function () {
    const server = createServer(null, function (req, res) {
      req.session.foo = 'foo';
      req.session.bar = 'bar';
      const keys = [];
      for (const key in req.session) {
        keys.push(key);
      }
      res.end(keys.sort().join(','));
    });

    await fetch(server, '/').expect(200, 'bar,cookie,foo');
  });

  it('should not be set if store is disconnected', async function () {
    const store = new session.MemoryStore();
    const server = createServer({ store }, function (req, res) {
      res.end(typeof req.session);
    });

    store.emit('disconnect');

    await fetch(server, '/')
      .expect('Set-Cookie', null)
      .expect(200, 'undefined');
  });

  it('should be set when store reconnects', async function () {
    const store = new session.MemoryStore();
    const server = createServer({ store }, function (req, res) {
      res.end(typeof req.session);
    });

    store.emit('disconnect');

    await fetch(server, '/')
      .expect('Set-Cookie', null)
      .expect(200, 'undefined');

    store.emit('connect');

    await fetch(server, '/').expect(200, 'object');
  });

  describe('.destroy()', function () {
    it('should destroy the previous session', async function () {
      const server = createServer(null, function (req, res) {
        req.session.destroy(function (err) {
          if (err) res.statusCode = 500;
          res.end(String(req.session));
        });
      });

      await fetch(server, '/')
        .expect('Set-Cookie', null)
        .expect(200, 'undefined');
    });
  });

  describe('.regenerate()', function () {
    it('should destroy/replace the previous session', async function () {
      const server = createServer(null, function (req, res) {
        const id = req.session.id;
        req.session.regenerate(function (err) {
          if (err) res.statusCode = 500;
          res.end(String(req.session.id === id));
        });
      });

      const res = await fetch(server, '/')
        .expect('Set-Cookie', /connect\.sid/)
        .expect(200);
      const res2 = await fetch(server, '/', {
        headers: { Cookie: cookie(res) }
      })
        .expect('Set-Cookie', /connect\.sid/)
        .expect(200, 'false');
      shouldSetCookieToDifferentSessionId(utils.sid(res))(res2);
    });
  });

  describe('.reload()', function () {
    it('should reload session from store', async function () {
      const server = createServer(null, respond);

      const res = await fetch(server, '/').expect(200, 'session created');
      const val = cookie(res);
      await fetch(server, '/foo', { headers: { Cookie: val } }).expect(
        200,
        'saw /bar'
      );

      function respond(req, res) {
        if (req.url === '/') {
          req.session.active = true;
          res.end('session created');
          return;
        }

        req.session.url = req.url;

        if (req.url === '/bar') {
          res.end('saw ' + req.session.url);
          return;
        }

        fetch(server, '/bar', { headers: { Cookie: val } })
          .expect(200, 'saw /bar')
          .then(function (resp) {
            req.session.reload(function () {
              res.end('saw ' + req.session.url);
            });
          });
      }
    });

    it('should error is session missing', async function () {
      const store = new session.MemoryStore();
      const server = createServer({ store }, function (req, res) {
        if (req.url === '/') {
          req.session.active = true;
          res.end('session created');
          return;
        }

        store.clear(function (err) {
          if (err) return res.end(err.message);
          req.session.reload(function (err) {
            res.statusCode = err ? 500 : 200;
            res.end(err ? err.message : '');
          });
        });
      });

      const res = await fetch(server, '/').expect(200, 'session created');
      await fetch(server, '/foo', { headers: { Cookie: cookie(res) } }).expect(
        500,
        'failed to load session'
      );
    });

    it('should not override an overriden `reload` in case of errors', async function () {
      const store = new session.MemoryStore();
      const server = createServer(
        { store, resave: false },
        function (req, res) {
          if (req.url === '/') {
            req.session.active = true;
            res.end('session created');
            return;
          }

          store.clear(function (err) {
            if (err) return res.end(err.message);

            // reload way too many times on top of each other,
            // attempting to overflow the call stack
            let iters = 20;
            reload();

            function reload() {
              if (!--iters) {
                res.end('ok');
                return;
              }

              try {
                req.session.reload(reload);
              } catch (e) {
                res.statusCode = 500;
                res.end(e.message);
              }
            }
          });
        }
      );

      const res = await fetch(server, '/').expect(200, 'session created');
      await fetch(server, '/foo', { headers: { Cookie: cookie(res) } }).expect(
        200,
        'ok'
      );
    });
  });

  describe('.save()', function () {
    it('should save session to store', async function () {
      const store = new session.MemoryStore();
      const server = createServer({ store }, function (req, res) {
        req.session.hit = true;
        req.session.save(function (err) {
          if (err) return res.end(err.message);
          store.get(req.session.id, function (err, sess) {
            if (err) return res.end(err.message);
            res.end(sess ? 'stored' : 'empty');
          });
        });
      });

      await fetch(server, '/').expect(200, 'stored');
    });

    it('should prevent end-of-request save', async function () {
      const store = new session.MemoryStore();
      const server = createServer({ store }, function (req, res) {
        req.session.hit = true;
        req.session.save(function (err) {
          if (err) return res.end(err.message);
          res.end('saved');
        });
      });

      let check = shouldSetSessionInStore(store);
      const res = await fetch(server, '/').expect(200, 'saved');
      check();
      check = shouldSetSessionInStore(store);

      await fetch(server, '/', { headers: { Cookie: cookie(res) } }).expect(
        200,
        'saved'
      );
      check();
    });

    it('should prevent end-of-request save on reloaded session', async function () {
      const store = new session.MemoryStore();
      const server = createServer({ store }, function (req, res) {
        req.session.hit = true;
        req.session.reload(function () {
          req.session.save(function (err) {
            if (err) return res.end(err.message);
            res.end('saved');
          });
        });
      });

      let check = shouldSetSessionInStore(store);
      const res = await fetch(server, '/').expect(200, 'saved');
      check();

      check = shouldSetSessionInStore(store);
      await fetch(server, '/', { headers: { Cookie: cookie(res) } }).expect(
        200,
        'saved'
      );
      check();
    });

    describe('when saveUninitialized is false', function () {
      it('should prevent end-of-request save', async function () {
        const store = new session.MemoryStore();
        const server = createServer(
          { saveUninitialized: false, store },
          function (req, res) {
            req.session.hit = true;
            req.session.save(function (err) {
              if (err) return res.end(err.message);
              res.end('saved');
            });
          }
        );

        let check = shouldSetSessionInStore(store);
        const res = await fetch(server, '/').expect(200, 'saved');
        check();

        check = shouldSetSessionInStore(store);
        await fetch(server, '/', { headers: { Cookie: cookie(res) } }).expect(
          200,
          'saved'
        );
        check();
      });
    });
  });

  describe('.touch()', function () {
    it('should reset session expiration', async function () {
      const store = new session.MemoryStore();
      const server = createServer(
        { resave: false, store, cookie: { maxAge: min } },
        function (req, res) {
          req.session.hit = true;
          req.session.touch();
          res.end();
        }
      );

      const res = await fetch(server, '/').expect(200);
      const id = utils.sid(res);
      let sess = await storeGet(store, id);
      const exp = new Date(sess.cookie.expires);

      await timers.setTimeout(100);
      await fetch(server, '/', { headers: { Cookie: cookie(res) } }).expect(
        200
      );
      sess = await storeGet(store, id);
      assert.notStrictEqual(
        new Date(sess.cookie.expires).getTime(),
        exp.getTime()
      );
    });
  });

  describe('.cookie', function () {
    describe('.*', function () {
      it('should serialize as parameters', async function () {
        const server = createServer({}, function (req, res) {
          req.secure = true;
          req.session.cookie.httpOnly = false;
          req.session.cookie.secure = true;
          res.end();
        });

        const res = await fetch(server, '/').expectStatus(200);
        shouldSetCookieWithoutAttribute('connect.sid', 'HttpOnly')(res);
        shouldSetCookieWithAttribute('connect.sid', 'Secure')(res);
      });

      it('should default to a browser-session length cookie', async function () {
        const res = await fetch(
          createServer({ cookie: { path: '/admin' } }),
          '/admin'
        ).expectStatus(200);
        shouldSetCookieWithoutAttribute('connect.sid', 'Expires')(res);
      });

      it('should Set-Cookie only once for browser-session cookies', async function () {
        const server = createServer({ cookie: { path: '/admin' } });

        const res = await fetch(server, '/admin/foo')
          .expect('Set-Cookie', /connect\.sid/)
          .expect(200);

        await fetch(server, '/admin', { headers: { Cookie: cookie(res) } })
          .expect('Set-Cookie', null)
          .expectStatus(200);
      });

      it('should override defaults', async function () {
        const opts = {
          httpOnly: false,
          maxAge: 5000,
          path: '/admin',
          priority: 'high',
          secure: true
        };
        const server = createServer({ cookie: opts }, function (req, res) {
          req.session.cookie.secure = false;
          res.end();
        });

        const res = await fetch(server, '/admin').expectStatus(200);
        shouldSetCookieWithAttribute('connect.sid', 'Expires')(res);
        shouldSetCookieWithoutAttribute('connect.sid', 'HttpOnly')(res);
        shouldSetCookieWithAttributeAndValue(
          'connect.sid',
          'Path',
          '/admin'
        )(res);
        shouldSetCookieWithoutAttribute('connect.sid', 'Secure')(res);
        shouldSetCookieWithAttributeAndValue(
          'connect.sid',
          'Priority',
          'High'
        )(res);
      });

      it('should forward errors setting cookie', async function () {
        const server = createServer(
          { cookie: { expires: new Date(Number.NaN) } },
          function (req, res) {
            res.end();
          }
        );

        const { promise, resolve } = Promise.withResolvers();
        server.on('error', function onerror(err) {
          assert.ok(err);
          assert.match(err.message, /option expires is invalid/i);
          resolve();
        });

        await Promise.all([promise, fetch(server, '/admin').expect(200)]);
      });

      it('should preserve cookies set before writeHead is called', async function () {
        const server = createServer(null, function (req, res) {
          res.setHeader('Set-Cookie', 'previous=cookieValue');
          res.end();
        });

        const res = await fetch(server, '/').expectStatus(200);
        shouldSetCookieToValue('previous', 'cookieValue')(res);
      });

      it('should preserve cookies set in writeHead', async function () {
        const server = createServer(null, function (req, res) {
          res.writeHead(200, {
            'Set-Cookie': 'previous=cookieValue'
          });
          res.end();
        });

        const res = await fetch(server, '/').expectStatus(200);
        shouldSetCookieToValue('previous', 'cookieValue')(res);
      });
    });

    describe('.originalMaxAge', function () {
      it('should equal original maxAge', async function () {
        const server = createServer(
          { cookie: { maxAge: 2000 } },
          function (req, res) {
            res.end(JSON.stringify(req.session.cookie.originalMaxAge));
          }
        );

        const res = await fetch(server, '/').expect(200);
        // account for 1ms latency
        const text = await res.text();
        assert.ok(
          text === '2000' || text === '1999',
          'expected 2000, got ' + text
        );
      });

      it('should equal original maxAge for all requests', async function () {
        const server = createServer(
          { cookie: { maxAge: 2000 } },
          function (req, res) {
            res.end(JSON.stringify(req.session.cookie.originalMaxAge));
          }
        );

        let res = await fetch(server, '/').expect(200);

        // account for 1ms latency
        let text = await res.text();
        assert.ok(
          text === '2000' || text === '1999',
          'expected 2000, got ' + text
        );
        await timers.setTimeout(100);

        res = await fetch(server, '/', {
          headers: { Cookie: cookie(res) }
        }).expect(200);
        // account for 1ms latency
        text = await res.text();
        assert.ok(
          text === '2000' || text === '1999',
          'expected 2000, got ' + text
        );
      });
    });
  });

  it('should equal original maxAge for all requests', async function () {
    const store = new SmartStore();
    const server = createServer(
      { cookie: { maxAge: 2000 }, store },
      function (req, res) {
        res.end(JSON.stringify(req.session.cookie.originalMaxAge));
      }
    );

    let res = await fetch(server, '/').expect(200);
    // account for 1ms latency
    let text = await res.text();
    assert.ok(text === '2000' || text === '1999', 'expected 2000, got ' + text);
    await timers.setTimeout(100);
    res = await fetch(server, '/', {
      headers: { Cookie: cookie(res) }
    }).expect(200);
    // account for 1ms latency
    text = await res.text();
    assert.ok(text === '2000' || text === '1999', 'expected 2000, got ' + text);
  });
});

describe('.secure', function () {
  let server;

  before(function () {
    const app = createRequestListener({
      secret: 'keyboard cat',
      cookie: { secure: true }
    });
    server = http.createServer(app);
  });

  after(function () {
    server.close();
  });

  it('should not set-cookie when insecure', async function () {
    await fetch(server, '/').expect('Set-Cookie', null).expectStatus(200);
  });
});

describe('.maxAge', function () {
  const ctx = {};

  before(async function () {
    ctx.cookie = '';
    ctx.server = createServer(
      { cookie: { maxAge: 2000 } },
      function (req, res) {
        switch (++req.session.count) {
          case 1:
            break;
          case 2:
            req.session.cookie.maxAge = 5000;
            break;
          case 3:
            req.session.cookie.maxAge = 3000000000;
            break;
          default:
            req.session.count = 0;
            break;
        }
        res.end(req.session.count.toString());
      }
    );

    const res = await fetch(ctx.server, '/');
    ctx.cookie = cookie(res);
  });

  after(function () {
    ctx.server.close();
  });

  it('should set cookie expires relative to maxAge', async function () {
    const res = await fetch(ctx.server, '/', {
      headers: { Cookie: ctx.cookie }
    }).expect(200, '1');
    shouldSetCookieToExpireIn('connect.sid', 2000)(res);
  });

  it('should modify cookie expires when changed', async function () {
    const res = await fetch(ctx.server, '/', {
      headers: { Cookie: ctx.cookie }
    }).expect(200, '2');
    shouldSetCookieToExpireIn('connect.sid', 5000)(res);
  });

  it('should modify cookie expires when changed to large value', async function () {
    const res = await fetch(ctx.server, '/', {
      headers: { Cookie: ctx.cookie }
    }).expect(200, '3');
    shouldSetCookieToExpireIn('connect.sid', 3000000000)(res);
  });
});

describe('.expires', function () {
  describe('when given a Date', function () {
    it('should set absolute', async function () {
      const server = createServer(null, function (req, res) {
        req.session.cookie.expires = new Date(0);
        res.end();
      });

      const res = await fetch(server, '/').expectStatus(200);
      shouldSetCookieWithAttributeAndValue(
        'connect.sid',
        'Expires',
        'Thu, 01 Jan 1970 00:00:00 GMT'
      )(res);
    });
  });

  describe('when null', function () {
    it('should be a browser-session cookie', async function () {
      const server = createServer(null, function (req, res) {
        req.session.cookie.expires = null;
        res.end();
      });

      const res = await fetch(server, '/').expectStatus(200);
      shouldSetCookieWithoutAttribute('connect.sid', 'Expires')(res);
    });

    it('should not reset cookie', async function () {
      const server = createServer(null, function (req, res) {
        req.session.cookie.expires = null;
        res.end();
      });

      const res = await fetch(server, '/').expect(200);
      shouldSetCookieWithoutAttribute('connect.sid', 'Expires')(res);

      await fetch(server, '/', { headers: { Cookie: cookie(res) } })
        .expect('Set-Cookie', null)
        .expectStatus(200);
    });

    it('should not reset cookie when modified', async function () {
      const server = createServer(null, function (req, res) {
        req.session.cookie.expires = null;
        req.session.hit = (req.session.hit || 0) + 1;
        res.end();
      });

      const res = await fetch(server, '/').expect(200);
      shouldSetCookieWithoutAttribute('connect.sid', 'Expires')(res);
      await fetch(server, '/', { headers: { Cookie: cookie(res) } })
        .expect('Set-Cookie', null)
        .expectStatus(200);
    });
  });
});

describe('.partitioned', function () {
  describe('by default', function () {
    it('should not set partitioned attribute', async function () {
      const server = createServer();

      const res = await fetch(server, '/').expectStatus(200);
      shouldSetCookieWithoutAttribute('connect.sid', 'Partitioned')(res);
    });
  });

  describe('when "false"', function () {
    it('should not set partitioned attribute', async function () {
      const server = createServer({ cookie: { partitioned: false } });

      const res = await fetch(server, '/').expectStatus(200);
      shouldSetCookieWithoutAttribute('connect.sid', 'Partitioned')(res);
    });
  });

  describe('when "true"', function () {
    it('should set partitioned attribute', async function () {
      const server = createServer({ cookie: { partitioned: true } });

      const res = await fetch(server, '/').expectStatus(200);
      shouldSetCookieWithAttribute('connect.sid', 'Partitioned')(res);
    });
  });
});
