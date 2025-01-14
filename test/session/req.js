const { before, describe, it } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const after = require('after');

const http = require('node:http');

const utils = require('../support/utils');
const { cookie } = utils;
const SmartStore = require('../support/smart-store');

const session = require('../../');
const Cookie = require('../../session/cookie');

const {
  shouldSetSessionInStore,
  shouldNotHaveHeader,
  shouldSetCookie,
  shouldSetCookieToExpireIn,
  shouldSetCookieToDifferentSessionId,
  shouldSetCookieWithAttributeAndValue,
  shouldSetCookieToValue,
  shouldSetCookieWithAttribute,
  shouldSetCookieWithoutAttribute
} = require('../support/should');

const {
  createServer,
  createRequestListener
} = require('../support/server');

const min = 60 * 1000;

describe('req.session', function () {
  it('should persist', function (_, done) {
    const store = new session.MemoryStore();
    const server = createServer({ store }, function (req, res) {
      req.session.count = req.session.count || 0;
      req.session.count++;
      res.end('hits: ' + req.session.count);
    });

    request(server)
      .get('/')
      .expect(200, 'hits: 1', function (err, res) {
        if (err) return done(err);
        store.load(utils.sid(res), function (err, sess) {
          if (err) return done(err);
          assert.ok(sess);
          request(server).get('/').set('Cookie', cookie(res)).expect(200, 'hits: 2', done);
        });
      });
  });

  it('should only set-cookie when modified', function (_, done) {
    let modify = true;
    const server = createServer(null, function (req, res) {
      if (modify) {
        req.session.count = req.session.count || 0;
        req.session.count++;
      }
      res.end(req.session.count.toString());
    });

    request(server)
      .get('/')
      .expect(200, '1', function (err, res) {
        if (err) return done(err);
        request(server)
          .get('/')
          .set('Cookie', cookie(res))
          .expect(200, '2', function (err, res) {
            if (err) return done(err);
            const val = cookie(res);
            modify = false;

            request(server)
              .get('/')
              .set('Cookie', val)
              .expect(shouldNotHaveHeader('Set-Cookie'))
              .expect(200, '2', function (err, res) {
                if (err) return done(err);
                modify = true;

                request(server)
                  .get('/')
                  .set('Cookie', val)
                  .expect(shouldSetCookie('connect.sid'))
                  .expect(200, '3', done);
              });
          });
      });
  });

  it('should not have enumerable methods', function (_, done) {
    const server = createServer(null, function (req, res) {
      req.session.foo = 'foo';
      req.session.bar = 'bar';
      const keys = [];
      for (const key in req.session) {
        keys.push(key);
      }
      res.end(keys.sort().join(','));
    });

    request(server).get('/').expect(200, 'bar,cookie,foo', done);
  });

  it('should not be set if store is disconnected', function (_, done) {
    const store = new session.MemoryStore();
    const server = createServer({ store }, function (req, res) {
      res.end(typeof req.session);
    });

    store.emit('disconnect');

    request(server)
      .get('/')
      .expect(shouldNotHaveHeader('Set-Cookie'))
      .expect(200, 'undefined', done);
  });

  it('should be set when store reconnects', function (_, done) {
    const store = new session.MemoryStore();
    const server = createServer({ store }, function (req, res) {
      res.end(typeof req.session);
    });

    store.emit('disconnect');

    request(server)
      .get('/')
      .expect(shouldNotHaveHeader('Set-Cookie'))
      .expect(200, 'undefined', function (err) {
        if (err) return done(err);

        store.emit('connect');

        request(server).get('/').expect(200, 'object', done);
      });
  });

  describe('.destroy()', function () {
    it('should destroy the previous session', function (_, done) {
      const server = createServer(null, function (req, res) {
        req.session.destroy(function (err) {
          if (err) res.statusCode = 500;
          res.end(String(req.session));
        });
      });

      request(server)
        .get('/')
        .expect(shouldNotHaveHeader('Set-Cookie'))
        .expect(200, 'undefined', done);
    });
  });

  describe('.regenerate()', function () {
    it('should destroy/replace the previous session', function (_, done) {
      const server = createServer(null, function (req, res) {
        const id = req.session.id;
        req.session.regenerate(function (err) {
          if (err) res.statusCode = 500;
          res.end(String(req.session.id === id));
        });
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
            .expect(shouldSetCookieToDifferentSessionId(utils.sid(res)))
            .expect(200, 'false', done);
        });
    });
  });

  describe('.reload()', function () {
    it('should reload session from store', function (_, done) {
      const server = createServer(null, function (req, res) {
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

        request(server)
          .get('/bar')
          .set('Cookie', val)
          .expect(200, 'saw /bar', function (err, resp) {
            if (err) return done(err);
            req.session.reload(function (err) {
              if (err) return done(err);
              res.end('saw ' + req.session.url);
            });
          });
      });
      var val;

      request(server)
        .get('/')
        .expect(200, 'session created', function (err, res) {
          if (err) return done(err);
          val = cookie(res);
          request(server).get('/foo').set('Cookie', val).expect(200, 'saw /bar', done);
        });
    });

    it('should error is session missing', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ store }, function (req, res) {
        if (req.url === '/') {
          req.session.active = true;
          res.end('session created');
          return;
        }

        store.clear(function (err) {
          if (err) return done(err);
          req.session.reload(function (err) {
            res.statusCode = err ? 500 : 200;
            res.end(err ? err.message : '');
          });
        });
      });

      request(server)
        .get('/')
        .expect(200, 'session created', function (err, res) {
          if (err) return done(err);
          request(server)
            .get('/foo')
            .set('Cookie', cookie(res))
            .expect(500, 'failed to load session', done);
        });
    });

    it('should not override an overriden `reload` in case of errors', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ store, resave: false }, function (req, res) {
        if (req.url === '/') {
          req.session.active = true;
          res.end('session created');
          return;
        }

        store.clear(function (err) {
          if (err) return done(err);

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
      });

      request(server)
        .get('/')
        .expect(200, 'session created', function (err, res) {
          if (err) return done(err);
          request(server).get('/foo').set('Cookie', cookie(res)).expect(200, 'ok', done);
        });
    });
  });

  describe('.save()', function () {
    it('should save session to store', function (_, done) {
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

      request(server).get('/').expect(200, 'stored', done);
    });

    it('should prevent end-of-request save', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ store }, function (req, res) {
        req.session.hit = true;
        req.session.save(function (err) {
          if (err) return res.end(err.message);
          res.end('saved');
        });
      });

      request(server)
        .get('/')
        .expect(shouldSetSessionInStore(store))
        .expect(200, 'saved', function (err, res) {
          if (err) return done(err);
          request(server)
            .get('/')
            .set('Cookie', cookie(res))
            .expect(shouldSetSessionInStore(store))
            .expect(200, 'saved', done);
        });
    });

    it('should prevent end-of-request save on reloaded session', function (_, done) {
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

      request(server)
        .get('/')
        .expect(shouldSetSessionInStore(store))
        .expect(200, 'saved', function (err, res) {
          if (err) return done(err);
          request(server)
            .get('/')
            .set('Cookie', cookie(res))
            .expect(shouldSetSessionInStore(store))
            .expect(200, 'saved', done);
        });
    });

    describe('when saveUninitialized is false', function () {
      it('should prevent end-of-request save', function (_, done) {
        const store = new session.MemoryStore();
        const server = createServer({ saveUninitialized: false, store },
          function (req, res) {
            req.session.hit = true;
            req.session.save(function (err) {
              if (err) return res.end(err.message);
              res.end('saved');
            });
          }
        );

        request(server)
          .get('/')
          .expect(shouldSetSessionInStore(store))
          .expect(200, 'saved', function (err, res) {
            if (err) return done(err);
            request(server)
              .get('/')
              .set('Cookie', cookie(res))
              .expect(shouldSetSessionInStore(store))
              .expect(200, 'saved', done);
          });
      });
    });
  });

  describe('.touch()', function () {
    it('should reset session expiration', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ resave: false, store, cookie: { maxAge: min } },
        function (req, res) {
          req.session.hit = true;
          req.session.touch();
          res.end();
        }
      );

      request(server)
        .get('/')
        .expect(200, function (err, res) {
          if (err) return done(err);
          const id = utils.sid(res);
          store.get(id, function (err, sess) {
            if (err) return done(err);
            const exp = new Date(sess.cookie.expires);
            setTimeout(function () {
              request(server)
                .get('/')
                .set('Cookie', cookie(res))
                .expect(200, function (err, res) {
                  if (err) return done(err);
                  store.get(id, function (err, sess) {
                    if (err) return done(err);
                    assert.notStrictEqual(new Date(sess.cookie.expires).getTime(), exp.getTime());
                    done();
                  });
                });
            }, 100);
          });
        });
    });
  });

  describe('.cookie', function () {
    describe('.*', function () {
      it('should serialize as parameters', function (_, done) {
        const server = createServer({}, function (req, res) {
          req.secure = true;
          req.session.cookie.httpOnly = false;
          req.session.cookie.secure = true;
          res.end();
        });

        request(server)
          .get('/')
          .expect(shouldSetCookieWithoutAttribute('connect.sid', 'HttpOnly'))
          .expect(shouldSetCookieWithAttribute('connect.sid', 'Secure'))
          .expect(200, done);
      });

      it('should default to a browser-session length cookie', function (_, done) {
        request(createServer({ cookie: { path: '/admin' } }))
          .get('/admin')
          .expect(shouldSetCookieWithoutAttribute('connect.sid', 'Expires'))
          .expect(200, done);
      });

      it('should Set-Cookie only once for browser-session cookies', function (_, done) {
        const server = createServer({ cookie: { path: '/admin' } });

        request(server)
          .get('/admin/foo')
          .expect(shouldSetCookie('connect.sid'))
          .expect(200, function (err, res) {
            if (err) return done(err);
            request(server)
              .get('/admin')
              .set('Cookie', cookie(res))
              .expect(shouldNotHaveHeader('Set-Cookie'))
              .expect(200, done);
          });
      });

      it('should override defaults', function (_, done) {
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

        request(server)
          .get('/admin')
          .expect(shouldSetCookieWithAttribute('connect.sid', 'Expires'))
          .expect(shouldSetCookieWithoutAttribute('connect.sid', 'HttpOnly'))
          .expect(shouldSetCookieWithAttributeAndValue('connect.sid', 'Path', '/admin'))
          .expect(shouldSetCookieWithoutAttribute('connect.sid', 'Secure'))
          .expect(shouldSetCookieWithAttributeAndValue('connect.sid', 'Priority', 'High'))
          .expect(200, done);
      });

      it('should forward errors setting cookie', function (_, done) {
        const cb = after(2, done);
        const server = createServer({ cookie: { expires: new Date(NaN) } }, function (req, res) {
          res.end();
        });

        server.on('error', function onerror(err) {
          assert.ok(err);
          assert.strictEqual(err.message, 'option expires is invalid');
          cb();
        });

        request(server).get('/admin').expect(200, cb);
      });

      it('should preserve cookies set before writeHead is called', function (_, done) {
        const server = createServer(null, function (req, res) {
          const cookie = new Cookie();
          res.setHeader('Set-Cookie', cookie.serialize('previous', 'cookieValue'));
          res.end();
        });

        request(server)
          .get('/')
          .expect(shouldSetCookieToValue('previous', 'cookieValue'))
          .expect(200, done);
      });

      it('should preserve cookies set in writeHead', function (_, done) {
        const server = createServer(null, function (req, res) {
          const cookie = new Cookie();
          res.writeHead(200, {
            'Set-Cookie': cookie.serialize('previous', 'cookieValue')
          });
          res.end();
        });

        request(server)
          .get('/')
          .expect(shouldSetCookieToValue('previous', 'cookieValue'))
          .expect(200, done);
      });
    });

    describe('.originalMaxAge', function () {
      it('should equal original maxAge', function (_, done) {
        const server = createServer({ cookie: { maxAge: 2000 } }, function (req, res) {
          res.end(JSON.stringify(req.session.cookie.originalMaxAge));
        });

        request(server)
          .get('/')
          .expect(200)
          .expect(function (res) {
            // account for 1ms latency
            assert.ok(
              res.text === '2000' || res.text === '1999',
              'expected 2000, got ' + res.text
            );
          })
          .end(done);
      });

      it('should equal original maxAge for all requests', function (_, done) {
        const server = createServer({ cookie: { maxAge: 2000 } }, function (req, res) {
          res.end(JSON.stringify(req.session.cookie.originalMaxAge));
        });

        request(server)
          .get('/')
          .expect(200)
          .expect(function (res) {
            // account for 1ms latency
            assert.ok(
              res.text === '2000' || res.text === '1999',
              'expected 2000, got ' + res.text
            );
          })
          .end(function (err, res) {
            if (err) return done(err);
            setTimeout(function () {
              request(server)
                .get('/')
                .set('Cookie', cookie(res))
                .expect(200)
                .expect(function (res) {
                  // account for 1ms latency
                  assert.ok(
                    res.text === '2000' || res.text === '1999',
                    'expected 2000, got ' + res.text
                  );
                })
                .end(done);
            }, 100);
          });
      });

      it('should equal original maxAge for all requests', function (_, done) {
        const store = new SmartStore();
        const server = createServer({ cookie: { maxAge: 2000 }, store },
          function (req, res) {
            res.end(JSON.stringify(req.session.cookie.originalMaxAge));
          }
        );

        request(server)
          .get('/')
          .expect(200)
          .expect(function (res) {
            // account for 1ms latency
            assert.ok(
              res.text === '2000' || res.text === '1999',
              'expected 2000, got ' + res.text
            );
          })
          .end(function (err, res) {
            if (err) return done(err);
            setTimeout(function () {
              request(server)
                .get('/')
                .set('Cookie', cookie(res))
                .expect(200)
                .expect(function (res) {
                  // account for 1ms latency
                  assert.ok(
                    res.text === '2000' || res.text === '1999',
                    'expected 2000, got ' + res.text
                  );
                })
                .end(done);
            }, 100);
          });
      });
    });

    describe('.secure', function () {
      let app;

      before(function () {
        app = createRequestListener({ secret: 'keyboard cat', cookie: { secure: true } });
      });

      it('should not set-cookie when insecure', function (_, done) {
        const server = http.createServer(app);

        request(server).get('/').expect(shouldNotHaveHeader('Set-Cookie')).expect(200, done);
      });
    });

    describe('.maxAge', function () {
      const ctx = {};

      before(function (_, done) {

        ctx.cookie = '';
        ctx.server = createServer({ cookie: { maxAge: 2000 } }, function (req, res) {
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
        });

        request(ctx.server)
          .get('/')
          .end(function (err, res) {
            ctx.cookie = res && cookie(res);
            done(err);
          });
      });

      it('should set cookie expires relative to maxAge', function (_, done) {
        request(ctx.server)
          .get('/')
          .set('Cookie', ctx.cookie)
          .expect(shouldSetCookieToExpireIn('connect.sid', 2000))
          .expect(200, '1', done);
      });

      it('should modify cookie expires when changed', function (_, done) {
        request(ctx.server)
          .get('/')
          .set('Cookie', ctx.cookie)
          .expect(shouldSetCookieToExpireIn('connect.sid', 5000))
          .expect(200, '2', done);
      });

      it('should modify cookie expires when changed to large value', function (_, done) {
        request(ctx.server)
          .get('/')
          .set('Cookie', ctx.cookie)
          .expect(shouldSetCookieToExpireIn('connect.sid', 3000000000))
          .expect(200, '3', done);
      });
    });

    describe('.expires', function () {
      describe('when given a Date', function () {
        it('should set absolute', function (_, done) {
          const server = createServer(null, function (req, res) {
            req.session.cookie.expires = new Date(0);
            res.end();
          });

          request(server)
            .get('/')
            .expect(
              shouldSetCookieWithAttributeAndValue(
                'connect.sid',
                'Expires',
                'Thu, 01 Jan 1970 00:00:00 GMT'
              )
            )
            .expect(200, done);
        });
      });

      describe('when null', function () {
        it('should be a browser-session cookie', function (_, done) {
          const server = createServer(null, function (req, res) {
            req.session.cookie.expires = null;
            res.end();
          });

          request(server)
            .get('/')
            .expect(shouldSetCookieWithoutAttribute('connect.sid', 'Expires'))
            .expect(200, done);
        });

        it('should not reset cookie', function (_, done) {
          const server = createServer(null, function (req, res) {
            req.session.cookie.expires = null;
            res.end();
          });

          request(server)
            .get('/')
            .expect(shouldSetCookieWithoutAttribute('connect.sid', 'Expires'))
            .expect(200, function (err, res) {
              if (err) return done(err);
              request(server)
                .get('/')
                .set('Cookie', cookie(res))
                .expect(shouldNotHaveHeader('Set-Cookie'))
                .expect(200, done);
            });
        });

        it('should not reset cookie when modified', function (_, done) {
          const server = createServer(null, function (req, res) {
            req.session.cookie.expires = null;
            req.session.hit = (req.session.hit || 0) + 1;
            res.end();
          });

          request(server)
            .get('/')
            .expect(shouldSetCookieWithoutAttribute('connect.sid', 'Expires'))
            .expect(200, function (err, res) {
              if (err) return done(err);
              request(server)
                .get('/')
                .set('Cookie', cookie(res))
                .expect(shouldNotHaveHeader('Set-Cookie'))
                .expect(200, done);
            });
        });
      });
    });

    describe('.partitioned', function () {
      describe('by default', function () {
        it('should not set partitioned attribute', function (_, done) {
          const server = createServer();

          request(server)
            .get('/')
            .expect(shouldSetCookieWithoutAttribute('connect.sid', 'Partitioned'))
            .expect(200, done);
        });
      });

      describe('when "false"', function () {
        it('should not set partitioned attribute', function (_, done) {
          const server = createServer({ cookie: { partitioned: false } });

          request(server)
            .get('/')
            .expect(shouldSetCookieWithoutAttribute('connect.sid', 'Partitioned'))
            .expect(200, done);
        });
      });

      describe('when "true"', function () {
        it('should set partitioned attribute', function (_, done) {
          const server = createServer({ cookie: { partitioned: true } });

          request(server)
            .get('/')
            .expect(shouldSetCookieWithAttribute('connect.sid', 'Partitioned'))
            .expect(200, done);
        });
      });
    });
  });
});
