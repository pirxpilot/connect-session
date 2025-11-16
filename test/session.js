import assert from 'node:assert';
import http from 'node:http';
import { describe, it } from 'node:test';
import timers from 'node:timers/promises';
import { fetch } from 'supertest-fetch';
import session from '../index.js';
import { createServer } from './support/server.js';
import { shouldSetCookieToDifferentSessionId, shouldSetSessionInStore } from './support/should.js';
import SyncStore from './support/sync-store.js';
import { cookie, expires, sid, writePatch } from './support/utils.js';

const min = 60 * 1000;

describe('session()', () => {
  it('should export constructors', () => {
    assert.strictEqual(typeof session.Session, 'function');
    assert.strictEqual(typeof session.Store, 'function');
    assert.strictEqual(typeof session.MemoryStore, 'function');
  });

  it('should do nothing if req.session exists', async () => {
    function setup(req) {
      req.session = {};
    }

    await fetch(createServer(setup), '/').expectHeader('set-cookie', null).expect(200);
  });

  it('should error without secret', async () => {
    const server = createServer({ secret: false });
    await fetch(server, '/').expect(500, /secret.*required/);
  });

  it('should get secret from req.secret', async () => {
    function setup(req) {
      req.secret = 'keyboard cat';
    }

    const server = createServer(setup);
    await fetch(server, '/').expectStatus(200).expectBody('');
  });

  it('should create a new session', async () => {
    const store = new session.MemoryStore();
    const server = createServer({ store }, (req, res) => {
      req.session.active = true;
      res.end('session active');
    });

    await fetch(server, '/')
      .expectHeader('set-cookie', /connect.sid/)
      .expectStatus(200)
      .expectBody('session active');

    const len = await store.length();
    assert.strictEqual(len, 1);
  });

  it('should load session from cookie sid', async () => {
    let count = 0;
    const server = createServer(null, (req, res) => {
      req.session.num ??= ++count;
      res.end(`session ${req.session.num}`);
    });

    const res = await fetch(server, '/')
      .expectHeader('set-cookie', /connect.sid/)
      .expectStatus(200)
      .expectBody('session 1');

    await fetch(server, '/', { headers: { Cookie: cookie(res) } })
      .expectStatus(200)
      .expectBody('session 1');
  });

  it('should pass session fetch error', async () => {
    const store = new session.MemoryStore();
    const server = createServer({ store, saveUninitialized: true }, (_req, res) => {
      res.end('hello, world');
    });

    store.get = async function destroy(_sid) {
      throw new Error('boom!');
    };

    const res = await fetch(server, '/')
      .expectHeader('Set-Cookie', /connect\.sid/)
      .expectStatus(200)
      .expectBody('hello, world');

    await fetch(server, '/', { headers: { Cookie: cookie(res) } })
      .expectStatus(500)
      .expectBody('boom!');
  });

  it('should treat ENOENT session fetch error as not found', async () => {
    let count = 0;
    const store = new session.MemoryStore();
    const server = createServer({ store }, (req, res) => {
      req.session.num ??= ++count;
      res.end(`session ${req.session.num}`);
    });

    store.get = async function destroy(_sid) {
      const err = new Error('boom!');
      err.code = 'ENOENT';
      throw err;
    };

    const res = await fetch(server, '/')
      .expectHeader('Set-Cookie', /connect\.sid/)
      .expectStatus(200)
      .expectBody('session 1');

    await fetch(server, '/', { headers: { Cookie: cookie(res) } })
      .expectHeader('Set-Cookie', /connect\.sid/)
      .expectStatus(200)
      .expectBody('session 2');
  });

  it('should create multiple sessions', async () => {
    let count = 0;
    const store = new session.MemoryStore();
    const server = createServer({ store }, (req, res) => {
      const isnew = req.session.num === undefined;
      req.session.num ??= ++count;
      res.end(`session ${isnew ? 'created' : 'updated'}`);
    });

    await Promise.all([
      fetch(server, '/').expectStatus(200).expectBody('session created'),
      fetch(server, '/').expectStatus(200).expectBody('session created')
    ]);

    const len = await store.length();
    assert.strictEqual(len, 2);
  });

  it('should handle empty req.url', async () => {
    function setup(req) {
      req.url = '';
    }

    const server = createServer(setup, { saveUninitialized: true });
    await fetch(server, '/')
      .expectHeader('Set-Cookie', /connect\.sid/)
      .expect(200);
  });

  it('should handle multiple res.end calls', async () => {
    const server = createServer(null, (_req, res) => {
      res.setHeader('Content-Type', 'text/plain');
      res.end('Hello, world!');
      res.end();
    });

    await fetch(server, '/').expect('Content-Type', 'text/plain').expectStatus(200).expectBody('Hello, world!');
  });

  it('should handle res.end(null) calls', async () => {
    const server = createServer(null, (_req, res) => {
      res.end(null);
    });

    await fetch(server, '/').expectStatus(200).expectBody('');
  });

  it('should handle reserved properties in storage', async () => {
    let count = 0;
    let sid;
    const store = new session.MemoryStore();
    const server = createServer({ store }, (req, res) => {
      sid = req.session.id;
      req.session.num ??= ++count;
      res.end('session saved');
    });

    const res = await fetch(server, '/').expectStatus(200).expectBody('session saved');
    const sess = await store.get(sid);
    // save is reserved
    sess.save = 'nope';
    await store.set(sid, sess);
    await fetch(server, '/', { headers: { Cookie: cookie(res) } })
      .expectStatus(200)
      .expectBody('session saved');
  });

  it('should only have session data enumerable (and cookie)', async () => {
    const server = createServer(null, (req, res) => {
      req.session.test1 = 1;
      req.session.test2 = 'b';
      res.end(Object.keys(req.session).sort().join(','));
    });

    await fetch(server, '/').expectStatus(200).expectBody('cookie,test1,test2');
  });

  it('should not save with bogus req.sessionID', async () => {
    const store = new session.MemoryStore();
    const server = createServer({ store }, (req, res) => {
      req.sessionID = () => {};
      req.session.test1 = 1;
      req.session.test2 = 'b';
      res.end();
    });

    await fetch(server, '/').expectHeader('Set-Cookie', null).expectStatus(200);

    const len = await store.length();
    assert.strictEqual(len, 0);
  });

  it('should update cookie expiration when slow write', async () => {
    const server = createServer({ rolling: true }, (req, res) => {
      req.session.user = 'bob';
      res.write('hello, ');
      setTimeout(() => {
        res.end('world!');
      }, 200);
    });

    const res = await fetch(server, '/')
      .expectHeader('Set-Cookie', /connect\.sid/)
      .expect(200);

    const originalExpires = expires(res);
    await timers.setTimeout(1000 - (Date.now() % 1000) + 200);

    const res2 = await fetch(server, '/', { headers: { Cookie: cookie(res) } })
      .expectHeader('Set-Cookie', /connect\.sid/)
      .expect(200);

    assert.notEqual(originalExpires, expires(res2));
  });

  describe('when response ended', () => {
    it('should have saved session', async () => {
      const store = new session.MemoryStore();
      const server = createServer({ store }, (req, res) => {
        req.session.hit = true;
        res.end('session saved');
      });

      const checkSession = shouldSetSessionInStore(store, 200);
      const res = await fetch(server, '/').expectStatus(200).expectBody('session saved');

      checkSession(res);
    });

    it('should have saved session even with empty response', async () => {
      const store = new session.MemoryStore();
      const server = createServer({ store }, (req, res) => {
        req.session.hit = true;
        res.setHeader('Content-Length', '0');
        res.end();
      });

      const checkSession = shouldSetSessionInStore(store, 200);
      const res = await fetch(server, '/').expectStatus(200);

      checkSession(res);
    });

    it('should have saved session even with multi-write', async () => {
      const store = new session.MemoryStore();
      const server = createServer({ store }, (req, res) => {
        req.session.hit = true;
        res.setHeader('Content-Length', '12');
        res.write('hello, ');
        res.end('world');
      });

      const checkSession = shouldSetSessionInStore(store, 200);
      const res = await fetch(server, '/').expectStatus(200).expectBody('hello, world');

      checkSession(res);
    });

    it('should have saved session even with non-chunked response', async () => {
      const store = new session.MemoryStore();
      const server = createServer({ store }, (req, res) => {
        req.session.hit = true;
        res.setHeader('Content-Length', '13');
        res.end('session saved');
      });

      const checkSession = shouldSetSessionInStore(store, 200);
      const res = await fetch(server, '/').expectStatus(200).expectBody('session saved');
      checkSession(res);
    });

    it('should have saved session with updated cookie expiration', async () => {
      const store = new session.MemoryStore();
      const server = createServer({ cookie: { maxAge: min }, store }, (req, res) => {
        req.session.user = 'bob';
        res.end(req.session.id);
      });

      const res = await fetch(server, '/')
        .expectHeader('Set-Cookie', /connect\.sid/)
        .expect(200);

      const id = await res.text();
      const sess = await store.get(id);
      assert.ok(sess, 'session saved to store');
      const exp = new Date(sess.cookie.expires);
      assert.strictEqual(exp.toUTCString(), expires(res));

      await timers.setTimeout(1000 - (Date.now() % 1000) + 200);

      const res2 = await fetch(server, '/', {
        headers: { Cookie: cookie(res) }
      }).expect(200);

      assert.strictEqual(await res2.text(), id);
      const sess2 = await store.get(id);

      assert.ok(sess2, 'session still in store');
      assert.notEqual(
        new Date(sess2.cookie.expires).toUTCString(),
        exp.toUTCString(),
        'session cookie expiration updated'
      );
    });
  });

  describe('when session expired in store', () => {
    it('should create a new session', async () => {
      let count = 0;
      const store = new session.MemoryStore();
      const server = createServer({ store, cookie: { maxAge: 5 } }, (req, res) => {
        req.session.num ??= ++count;
        res.end(`session ${req.session.num}`);
      });

      const res = await fetch(server, '/')
        .expectHeader('Set-Cookie', /connect\.sid/)
        .expectStatus(200)
        .expectBody('session 1');
      await timers.setTimeout(20);

      await fetch(server, '/', { headers: { Cookie: cookie(res) } })
        .expectHeader('Set-Cookie', /connect\.sid/)
        .expectStatus(200)
        .expectBody('session 2');
    });

    it('should have a new sid', async () => {
      let count = 0;
      const store = new session.MemoryStore();
      const server = createServer({ store, cookie: { maxAge: 5 } }, (req, res) => {
        req.session.num ??= ++count;
        res.end(`session ${req.session.num}`);
      });

      const res = await fetch(server, '/')
        .expectHeader('Set-Cookie', /connect\.sid/)
        .expectStatus(200)
        .expectBody('session 1');

      await timers.setTimeout(15);
      const res2 = await fetch(server, '/', {
        headers: { Cookie: cookie(res) }
      })
        .expectHeader('Set-Cookie', /connect\.sid/)
        .expectStatus(200)
        .expectBody('session 2');

      shouldSetCookieToDifferentSessionId(sid(res))(res2);
    });

    it('should not exist in store', async () => {
      let count = 0;
      const store = new session.MemoryStore();
      const server = createServer({ store, cookie: { maxAge: 5 } }, (req, res) => {
        req.session.num ??= ++count;
        res.end(`session ${req.session.num}`);
      });

      const _res = await fetch(server, '/')
        .expectHeader('Set-Cookie', /connect\.sid/)
        .expectStatus(200)
        .expectBody('session 1');
      await timers.setTimeout(10);

      const len = await store.length();
      assert.strictEqual(len, 0);
    });
  });

  describe('when session without cookie property in store', () => {
    it('should pass error from inflate', async () => {
      let count = 0;
      const store = new session.MemoryStore();
      const server = createServer({ store }, (req, res) => {
        req.session.num ??= ++count;
        res.end(`session ${req.session.num}`);
      });

      const res = await fetch(server, '/')
        .expectHeader('Set-Cookie', /connect\.sid/)
        .expectStatus(200)
        .expectBody('session 1');

      await store.set(sid(res), { foo: 'bar' });

      await fetch(server, '/', { headers: { Cookie: cookie(res) } }).expect(500, /Cannot destructure property/);
    });

    describe('res.end patch', () => {
      it('should correctly handle res.end/res.write patched prior', async () => {
        function setup(_req, res) {
          writePatch(res);
        }

        function respond(req, res) {
          req.session.hit = true;
          res.write('hello, ');
          res.end('world');
        }

        const server = createServer(setup, null, respond);
        await fetch(server, '/').expectStatus(200).expectBody('hello, world');
      });

      it('should correctly handle res.end/res.write patched after', async () => {
        function respond(req, res) {
          writePatch(res);
          req.session.hit = true;
          res.write('hello, ');
          res.end('world');
        }
        const server = createServer(null, respond);
        await fetch(server, '/').expectStatus(200).expectBody('hello, world');
      });

      it('should error when res.end is called twice', async () => {
        let error1 = null;
        let error2 = null;
        const server = http.createServer((_req, res) => {
          res.end();

          try {
            res.setHeader('Content-Length', '3');
            res.end('foo');
          } catch (e) {
            error1 = e;
          }
        });

        function respond(_req, res) {
          res.end();

          try {
            res.setHeader('Content-Length', '3');
            res.end('foo');
          } catch (e) {
            error2 = e;
          }
        }

        await fetch(server, '/').expectStatus(200).expectBody('');
        assert.ok(error1 instanceof Error);

        await fetch(createServer(null, respond), '/').expectStatus(200).expectBody('');
        assert.ok(error2 instanceof Error);

        assert.strictEqual(error1.message, error2.message);
      });
    });

    describe('synchronous store', () => {
      it('should respond correctly on save', async () => {
        const store = new SyncStore();
        const server = createServer({ store }, (req, res) => {
          req.session.count ??= 0;
          req.session.count++;
          res.end(`hits: ${req.session.count}`);
        });

        await fetch(server, '/').expectStatus(200).expectBody('hits: 1');
      });

      it('should respond correctly on destroy', async () => {
        const store = new SyncStore();
        const server = createServer({ store, unset: 'destroy' }, (req, res) => {
          req.session.count ??= 0;
          const count = ++req.session.count;
          if (count > 1) {
            req.session = null;
            res.write('destroyed\n');
          }
          res.end(`hits: ${count}`);
        });

        const res = await fetch(server, '/').expectStatus(200).expectBody('hits: 1');
        await fetch(server, '/', {
          headers: { cookie: cookie(res) }
        })
          .expectStatus(200)
          .expectBody('destroyed\nhits: 2');
      });
    });
  });
});
