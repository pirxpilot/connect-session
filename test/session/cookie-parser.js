import { createServer } from 'node:http';
import { describe, it } from 'node:test';
import connect from '@pirxpilot/connect';
import cookieParser from 'cookie-parser';
import { fetch } from 'supertest-fetch';
import response from '../support/response.js';
import { createSession } from '../support/server.js';
import { shouldSetCookie } from '../support/should.js';
import { cookie, sid } from '../support/utils.js';

describe('cookieParser()', () => {
  it('should reject unsigned from req.cookies', async () => {
    const app = connect()
      .use((req, res, next) => {
        response(res);
        req.headers.cookie = 'foo=bar';
        next();
      })
      .use(cookieParser('keyboard cat'))
      .use(createSession({ key: 'sessid' }))
      .use((req, res) => {
        req.session.count = req.session.count || 0;
        req.session.count++;
        res.end(req.session.count.toString());
      });

    const server = createServer(app);
    const res = await fetch(server, '/').expect(200, '1');

    shouldSetCookie('sessid')(res);

    const val = `sessid=${sid(res)}`;

    await fetch(server, '/', { headers: { Cookie: val } }).expect(200, '1');
  });

  it('should reject invalid signature from req.cookies', async () => {
    const app = connect()
      .use((req, res, next) => {
        response(res);
        req.headers.cookie = 'foo=bar';
        next();
      })
      .use(cookieParser('keyboard cat'))
      .use(createSession({ key: 'sessid' }))
      .use((req, res) => {
        req.session.count = req.session.count || 0;
        req.session.count++;
        res.end(req.session.count.toString());
      });

    const server = createServer(app);

    const res = await fetch(server, '/').expect(200, '1');
    shouldSetCookie('sessid')(res);

    const val = cookie(res).replace(/...\./, '.');

    await fetch(server, '/', { headers: { Cookie: val } }).expect(200, '1');
  });

  it('should read from req.signedCookies', async () => {
    const app = connect()
      .use((_req, res, next) => {
        response(res);
        next();
      })
      .use(cookieParser('keyboard cat'))
      .use(createSession())
      .use((req, res) => {
        req.session.count ??= 0;
        req.session.count++;
        res.end(req.session.count.toString());
      });

    const server = createServer(app);

    const res = await fetch(server, '/').expect(200, '1');

    await fetch(server, '/', { headers: { Cookie: cookie(res) } }).expect(200, '2');
  });
});
