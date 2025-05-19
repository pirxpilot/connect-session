const { describe, it } = require('node:test');
const { fetch } = require('supertest-fetch');
const utils = require('../support/utils');
const { cookie } = utils;
const { createServer } = require('node:http');

const cookieParser = require('cookie-parser');
const connect = require('@pirxpilot/connect');

const response = require('../support/response');

const { createSession } = require('../support/server');

const { shouldSetCookie } = require('../support/should');

describe('cookieParser()', function () {
  it('should reject unsigned from req.cookies', async function () {
    const app = connect()
      .use(function (req, res, next) {
        response(res);
        req.headers.cookie = 'foo=bar';
        next();
      })
      .use(cookieParser('keyboard cat'))
      .use(createSession({ key: 'sessid' }))
      .use(function (req, res) {
        req.session.count = req.session.count || 0;
        req.session.count++;
        res.end(req.session.count.toString());
      });

    const server = createServer(app);
    const res = await fetch(server, '/').expect(200, '1');

    shouldSetCookie('sessid')(res);

    const val = 'sessid=' + utils.sid(res);

    await fetch(server, '/', { headers: { Cookie: val } }).expect(200, '1');
  });

  it('should reject invalid signature from req.cookies', async function () {
    const app = connect()
      .use(function (req, res, next) {
        response(res);
        req.headers.cookie = 'foo=bar';
        next();
      })
      .use(cookieParser('keyboard cat'))
      .use(createSession({ key: 'sessid' }))
      .use(function (req, res) {
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

  it('should read from req.signedCookies', async function () {
    const app = connect()
      .use(function (req, res, next) {
        response(res);
        next();
      })
      .use(cookieParser('keyboard cat'))
      .use(createSession())
      .use(function (req, res) {
        req.session.count ??= 0;
        req.session.count++;
        res.end(req.session.count.toString());
      });

    const server = createServer(app);

    const res = await fetch(server, '/').expect(200, '1');

    await fetch(server, '/', { headers: { Cookie: cookie(res) } }).expect(
      200,
      '2'
    );
  });
});
