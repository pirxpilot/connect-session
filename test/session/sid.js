import assert from 'node:assert';
import { describe, it } from 'node:test';
import { fetch } from 'supertest-fetch';
import session from '../../index.js';
import { createServer } from '../support/server.js';
import { shouldSetCookieToDifferentSessionId } from '../support/should.js';
import { cookie, sid, storeClear } from '../support/utils.js';

describe('when sid not in store', () => {
  it('should create a new session', async () => {
    let count = 0;
    const store = new session.MemoryStore();
    const server = createServer({ store }, (req, res) => {
      req.session.num = req.session.num || ++count;
      res.end(`session ${req.session.num}`);
    });

    const res = await fetch(server, '/')
      .expect('Set-Cookie', /connect.sid/)
      .expect(200, 'session 1');

    await storeClear(store);
    await fetch(server, '/', { headers: { Cookie: cookie(res) } }).expect(200, 'session 2');
  });

  it('should have a new sid', async () => {
    let count = 0;
    const store = new session.MemoryStore();
    const server = createServer({ store }, (req, res) => {
      req.session.num = req.session.num || ++count;
      res.end(`session ${req.session.num}`);
    });

    const res = await fetch(server, '/')
      .expect('Set-Cookie', /connect.sid/)
      .expect(200, 'session 1');
    await storeClear(store);
    const res2 = await fetch(server, '/', { headers: { Cookie: cookie(res) } })
      .expect('Set-Cookie', /connect.sid/)
      .expect(200, 'session 2');
    shouldSetCookieToDifferentSessionId(sid(res))(res2);
  });
});

describe('when sid not properly signed', () => {
  it('should generate new session', async () => {
    const store = new session.MemoryStore();
    const server = createServer({ store, key: 'sessid' }, (req, res) => {
      const isnew = req.session.active === undefined;
      req.session.active = true;
      res.end(`session ${isnew ? 'created' : 'read'}`);
    });

    const res = await fetch(server, '/')
      .expect('Set-Cookie', /^sessid=/)
      .expect(200, 'session created');
    const val = sid(res);
    assert.ok(val);
    const res2 = await fetch(server, '/', {
      headers: { Cookie: `sessid=${val}` }
    })
      .expect('Set-Cookie', /^sessid=/)
      .expect(200, 'session created');
    shouldSetCookieToDifferentSessionId(val)(res2);
  });

  it('should not attempt fetch from store', async () => {
    const store = new session.MemoryStore();
    const server = createServer({ store, key: 'sessid' }, (req, res) => {
      const isnew = req.session.active === undefined;
      req.session.active = true;
      res.end(`session ${isnew ? 'created' : 'read'}`);
    });

    const res = await fetch(server, '/')
      .expect('Set-Cookie', /^sessid=/)
      .expect(200, 'session created');
    const val = cookie(res).replace(/...\./, '.');

    await fetch(server, '/', {
      headers: { Cookie: val }
    })
      .expect('Set-Cookie', /^sessid=/)
      .expect(200, 'session created');
  });
});
