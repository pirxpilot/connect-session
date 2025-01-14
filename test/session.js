const { describe, it } = require('node:test');
const assert = require('node:assert');

const after = require('after');
const http = require('http');
const request = require('supertest');
const session = require('../');
const SyncStore = require('./support/sync-store');
const utils = require('./support/utils');
const { cookie } = utils;

const {
  shouldSetSessionInStore,
  shouldNotHaveHeader,
  shouldSetCookie,
  shouldSetCookieToDifferentSessionId,
} = require('./support/should');

const {
  createServer
} = require('./support/server');

const min = 60 * 1000;

describe('session()', function () {
  it('should export constructors', function () {
    assert.strictEqual(typeof session.Session, 'function');
    assert.strictEqual(typeof session.Store, 'function');
    assert.strictEqual(typeof session.MemoryStore, 'function');
  });

  it('should do nothing if req.session exists', function (_, done) {
    function setup(req) {
      req.session = {};
    }

    request(createServer(setup))
      .get('/')
      .expect(shouldNotHaveHeader('Set-Cookie'))
      .expect(200, done);
  });

  it('should error without secret', function (_, done) {
    request(createServer({ secret: false }))
      .get('/')
      .expect(500, /secret.*required/, done);
  });

  it('should get secret from req.secret', function (_, done) {
    function setup(req) {
      req.secret = 'keyboard cat';
    }

    request(createServer(setup))
      .get('/')
      .expect(200, '', done);
  });

  it('should create a new session', function (_, done) {
    const store = new session.MemoryStore();
    const server = createServer({ store }, function (req, res) {
      req.session.active = true;
      res.end('session active');
    });

    request(server)
      .get('/')
      .expect(shouldSetCookie('connect.sid'))
      .expect(200, 'session active', function (err, res) {
        if (err) return done(err);
        store.length(function (err, len) {
          if (err) return done(err);
          assert.strictEqual(len, 1);
          done();
        });
      });
  });

  it('should load session from cookie sid', function (_, done) {
    let count = 0;
    const server = createServer(null, function (req, res) {
      req.session.num = req.session.num || ++count;
      res.end('session ' + req.session.num);
    });

    request(server)
      .get('/')
      .expect(shouldSetCookie('connect.sid'))
      .expect(200, 'session 1', function (err, res) {
        if (err) return done(err);
        request(server).get('/').set('Cookie', cookie(res)).expect(200, 'session 1', done);
      });
  });

  it('should pass session fetch error', function (_, done) {
    const store = new session.MemoryStore();
    const server = createServer({ store }, function (req, res) {
      res.end('hello, world');
    });

    store.get = function destroy(sid, callback) {
      callback(new Error('boom!'));
    };

    request(server)
      .get('/')
      .expect(shouldSetCookie('connect.sid'))
      .expect(200, 'hello, world', function (err, res) {
        if (err) return done(err);
        request(server).get('/').set('Cookie', cookie(res)).expect(500, 'boom!', done);
      });
  });

  it('should treat ENOENT session fetch error as not found', function (_, done) {
    let count = 0;
    const store = new session.MemoryStore();
    const server = createServer({ store }, function (req, res) {
      req.session.num = req.session.num || ++count;
      res.end('session ' + req.session.num);
    });

    store.get = function destroy(sid, callback) {
      const err = new Error('boom!');
      err.code = 'ENOENT';
      callback(err);
    };

    request(server)
      .get('/')
      .expect(shouldSetCookie('connect.sid'))
      .expect(200, 'session 1', function (err, res) {
        if (err) return done(err);
        request(server).get('/').set('Cookie', cookie(res)).expect(200, 'session 2', done);
      });
  });

  it('should create multiple sessions', function (_, done) {
    const cb = after(2, check);
    let count = 0;
    const store = new session.MemoryStore();
    const server = createServer({ store }, function (req, res) {
      const isnew = req.session.num === undefined;
      req.session.num = req.session.num || ++count;
      res.end('session ' + (isnew ? 'created' : 'updated'));
    });

    function check(err) {
      if (err) return done(err);
      store.all(function (err, sess) {
        if (err) return done(err);
        assert.strictEqual(Object.keys(sess).length, 2);
        done();
      });
    }

    request(server).get('/').expect(200, 'session created', cb);

    request(server).get('/').expect(200, 'session created', cb);
  });

  it('should handle empty req.url', function (_, done) {
    function setup(req) {
      req.url = '';
    }

    request(createServer(setup)).get('/').expect(shouldSetCookie('connect.sid')).expect(200, done);
  });

  it('should handle multiple res.end calls', function (_, done) {
    const server = createServer(null, function (req, res) {
      res.setHeader('Content-Type', 'text/plain');
      res.end('Hello, world!');
      res.end();
    });

    request(server)
      .get('/')
      .expect('Content-Type', 'text/plain')
      .expect(200, 'Hello, world!', done);
  });

  it('should handle res.end(null) calls', function (_, done) {
    const server = createServer(null, function (req, res) {
      res.end(null);
    });

    request(server).get('/').expect(200, '', done);
  });

  it('should handle reserved properties in storage', function (_, done) {
    let count = 0;
    let sid;
    const store = new session.MemoryStore();
    const server = createServer({ store }, function (req, res) {
      sid = req.session.id;
      req.session.num = req.session.num || ++count;
      res.end('session saved');
    });

    request(server)
      .get('/')
      .expect(200, 'session saved', function (err, res) {
        if (err) return done(err);
        store.get(sid, function (err, sess) {
          if (err) return done(err);
          // save is reserved
          sess.save = 'nope';
          store.set(sid, sess, function (err) {
            if (err) return done(err);
            request(server).get('/').set('Cookie', cookie(res)).expect(200, 'session saved', done);
          });
        });
      });
  });

  it('should only have session data enumerable (and cookie)', function (_, done) {
    const server = createServer(null, function (req, res) {
      req.session.test1 = 1;
      req.session.test2 = 'b';
      res.end(Object.keys(req.session).sort().join(','));
    });

    request(server).get('/').expect(200, 'cookie,test1,test2', done);
  });

  it('should not save with bogus req.sessionID', function (_, done) {
    const store = new session.MemoryStore();
    const server = createServer({ store }, function (req, res) {
      req.sessionID = function () { };
      req.session.test1 = 1;
      req.session.test2 = 'b';
      res.end();
    });

    request(server)
      .get('/')
      .expect(shouldNotHaveHeader('Set-Cookie'))
      .expect(200, function (err) {
        if (err) return done(err);
        store.length(function (err, length) {
          if (err) return done(err);
          assert.strictEqual(length, 0);
          done();
        });
      });
  });

  it('should update cookie expiration when slow write', function (_, done) {
    const server = createServer({ rolling: true }, function (req, res) {
      req.session.user = 'bob';
      res.write('hello, ');
      setTimeout(function () {
        res.end('world!');
      }, 200);
    });

    request(server)
      .get('/')
      .expect(shouldSetCookie('connect.sid'))
      .expect(200, function (err, res) {
        if (err) return done(err);
        const originalExpires = utils.expires(res);
        setTimeout(
          function () {
            request(server)
              .get('/')
              .set('Cookie', cookie(res))
              .expect(shouldSetCookie('connect.sid'))
              .expect(function (res) {
                assert.notStrictEqual(originalExpires, utils.expires(res));
              })
              .expect(200, done);
          },
          1000 - (Date.now() % 1000) + 200
        );
      });
  });

  describe('when response ended', function () {
    it('should have saved session', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ store }, function (req, res) {
        req.session.hit = true;
        res.end('session saved');
      });

      request(server)
        .get('/')
        .expect(200)
        .expect(shouldSetSessionInStore(store, 200))
        .expect('session saved')
        .end(done);
    });

    it('should have saved session even with empty response', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ store }, function (req, res) {
        req.session.hit = true;
        res.setHeader('Content-Length', '0');
        res.end();
      });

      request(server).get('/').expect(200).expect(shouldSetSessionInStore(store, 200)).end(done);
    });

    it('should have saved session even with multi-write', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ store }, function (req, res) {
        req.session.hit = true;
        res.setHeader('Content-Length', '12');
        res.write('hello, ');
        res.end('world');
      });

      request(server)
        .get('/')
        .expect(200)
        .expect(shouldSetSessionInStore(store, 200))
        .expect('hello, world')
        .end(done);
    });

    it('should have saved session even with non-chunked response', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ store }, function (req, res) {
        req.session.hit = true;
        res.setHeader('Content-Length', '13');
        res.end('session saved');
      });

      request(server)
        .get('/')
        .expect(200)
        .expect(shouldSetSessionInStore(store, 200))
        .expect('session saved')
        .end(done);
    });

    it('should have saved session with updated cookie expiration', function (_, done) {
      const store = new session.MemoryStore();
      const server = createServer({ cookie: { maxAge: min }, store }, function (req, res) {
        req.session.user = 'bob';
        res.end(req.session.id);
      });

      request(server)
        .get('/')
        .expect(shouldSetCookie('connect.sid'))
        .expect(200, function (err, res) {
          if (err) return done(err);
          const id = res.text;
          store.get(id, function (err, sess) {
            if (err) return done(err);
            assert.ok(sess, 'session saved to store');
            const exp = new Date(sess.cookie.expires);
            assert.strictEqual(exp.toUTCString(), utils.expires(res));
            setTimeout(
              function () {
                request(server)
                  .get('/')
                  .set('Cookie', cookie(res))
                  .expect(200, function (err, res) {
                    if (err) return done(err);
                    store.get(id, function (err, sess) {
                      if (err) return done(err);
                      assert.strictEqual(res.text, id);
                      assert.ok(sess, 'session still in store');
                      assert.notStrictEqual(
                        new Date(sess.cookie.expires).toUTCString(),
                        exp.toUTCString(),
                        'session cookie expiration updated'
                      );
                      done();
                    });
                  });
              },
              1000 - (Date.now() % 1000) + 200
            );
          });
        });
    });
  });

  describe('when session expired in store', function () {
    it('should create a new session', function (_, done) {
      let count = 0;
      const store = new session.MemoryStore();
      const server = createServer({ store, cookie: { maxAge: 5 } }, function (req, res) {
        req.session.num = req.session.num || ++count;
        res.end('session ' + req.session.num);
      });

      request(server)
        .get('/')
        .expect(shouldSetCookie('connect.sid'))
        .expect(200, 'session 1', function (err, res) {
          if (err) return done(err);
          setTimeout(function () {
            request(server)
              .get('/')
              .set('Cookie', cookie(res))
              .expect(shouldSetCookie('connect.sid'))
              .expect(200, 'session 2', done);
          }, 20);
        });
    });

    it('should have a new sid', function (_, done) {
      let count = 0;
      const store = new session.MemoryStore();
      const server = createServer({ store, cookie: { maxAge: 5 } }, function (req, res) {
        req.session.num = req.session.num || ++count;
        res.end('session ' + req.session.num);
      });

      request(server)
        .get('/')
        .expect(shouldSetCookie('connect.sid'))
        .expect(200, 'session 1', function (err, res) {
          if (err) return done(err);
          setTimeout(function () {
            request(server)
              .get('/')
              .set('Cookie', cookie(res))
              .expect(shouldSetCookie('connect.sid'))
              .expect(shouldSetCookieToDifferentSessionId(utils.sid(res)))
              .expect(200, 'session 2', done);
          }, 15);
        });
    });

    it('should not exist in store', function (_, done) {
      let count = 0;
      const store = new session.MemoryStore();
      const server = createServer({ store, cookie: { maxAge: 5 } }, function (req, res) {
        req.session.num = req.session.num || ++count;
        res.end('session ' + req.session.num);
      });

      request(server)
        .get('/')
        .expect(shouldSetCookie('connect.sid'))
        .expect(200, 'session 1', function (err, res) {
          if (err) return done(err);
          setTimeout(function () {
            store.all(function (err, sess) {
              if (err) return done(err);
              assert.strictEqual(Object.keys(sess).length, 0);
              done();
            });
          }, 10);
        });
    });
  });

  describe('when session without cookie property in store', function () {
    it('should pass error from inflate', function (_, done) {
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
          store.set(utils.sid(res), { foo: 'bar' }, function (err) {
            if (err) return done(err);
            request(server)
              .get('/')
              .set('Cookie', cookie(res))
              .expect(500, /Cannot read prop/, done);
          });
        });
    });
  });

  describe('res.end patch', function () {
    it('should correctly handle res.end/res.write patched prior', function (_, done) {
      function setup(req, res) {
        utils.writePatch(res);
      }

      function respond(req, res) {
        req.session.hit = true;
        res.write('hello, ');
        res.end('world');
      }

      request(createServer(setup, null, respond))
        .get('/')
        .expect(200, 'hello, world', done);
    });

    it('should correctly handle res.end/res.write patched after', function (_, done) {
      function respond(req, res) {
        utils.writePatch(res);
        req.session.hit = true;
        res.write('hello, ');
        res.end('world');
      }

      request(createServer(null, respond)).get('/').expect(200, 'hello, world', done);
    });

    it('should error when res.end is called twice', function (_, done) {
      let error1 = null;
      let error2 = null;
      const server = http.createServer(function (req, res) {
        res.end();

        try {
          res.setHeader('Content-Length', '3');
          res.end('foo');
        } catch (e) {
          error1 = e;
        }
      });

      function respond(req, res) {
        res.end();

        try {
          res.setHeader('Content-Length', '3');
          res.end('foo');
        } catch (e) {
          error2 = e;
        }
      }

      request(server)
        .get('/')
        .end(function (err, res) {
          if (err) return done(err);
          request(createServer(null, respond))
            .get('/')
            .expect(function () {
              assert.strictEqual(error1 && error1.message, error2 && error2.message);
            })
            .expect(res.statusCode, res.text, done);
        });
    });
  });

  describe('synchronous store', function () {
    it('should respond correctly on save', function (_, done) {
      const store = new SyncStore();
      const server = createServer({ store }, function (req, res) {
        req.session.count = req.session.count || 0;
        req.session.count++;
        res.end('hits: ' + req.session.count);
      });

      request(server).get('/').expect(200, 'hits: 1', done);
    });

    it('should respond correctly on destroy', function (_, done) {
      const store = new SyncStore();
      const server = createServer({ store, unset: 'destroy' }, function (req, res) {
        req.session.count = req.session.count || 0;
        const count = ++req.session.count;
        if (req.session.count > 1) {
          req.session = null;
          res.write('destroyed\n');
        }
        res.end('hits: ' + count);
      });

      request(server)
        .get('/')
        .expect(200, 'hits: 1', function (err, res) {
          if (err) return done(err);
          request(server)
            .get('/')
            .set('Cookie', cookie(res))
            .expect(200, 'destroyed\nhits: 2', done);
        });
    });
  });

});
