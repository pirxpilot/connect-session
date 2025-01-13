const { describe, it } = require('node:test');
const request = require('supertest');
const utils = require('../support/utils');
const { cookie } = utils;

const cookieParser = require('cookie-parser');
const express = require('express');

const {
  createSession
} = require('../support/server');

describe('cookieParser()', function () {
  it('should read from req.cookies', function (_, done) {
    const app = express()
      .use(cookieParser())
      .use(function (req, res, next) {
        req.headers.cookie = 'foo=bar';
        next();
      })
      .use(createSession())
      .use(function (req, res, next) {
        req.session.count = req.session.count || 0;
        req.session.count++;
        res.end(req.session.count.toString());
      });

    request(app)
      .get('/')
      .expect(200, '1', function (err, res) {
        if (err) return done(err);
        request(app).get('/').set('Cookie', cookie(res)).expect(200, '2', done);
      });
  });

  it('should reject unsigned from req.cookies', function (_, done) {
    const app = express()
      .use(cookieParser())
      .use(function (req, res, next) {
        req.headers.cookie = 'foo=bar';
        next();
      })
      .use(createSession({ key: 'sessid' }))
      .use(function (req, res, next) {
        req.session.count = req.session.count || 0;
        req.session.count++;
        res.end(req.session.count.toString());
      });

    request(app)
      .get('/')
      .expect(200, '1', function (err, res) {
        if (err) return done(err);
        request(app)
          .get('/')
          .set('Cookie', 'sessid=' + utils.sid(res))
          .expect(200, '1', done);
      });
  });

  it('should reject invalid signature from req.cookies', function (_, done) {
    const app = express()
      .use(cookieParser())
      .use(function (req, res, next) {
        req.headers.cookie = 'foo=bar';
        next();
      })
      .use(createSession({ key: 'sessid' }))
      .use(function (req, res, next) {
        req.session.count = req.session.count || 0;
        req.session.count++;
        res.end(req.session.count.toString());
      });

    request(app)
      .get('/')
      .expect(200, '1', function (err, res) {
        if (err) return done(err);
        const val = cookie(res).replace(/...\./, '.');
        request(app).get('/').set('Cookie', val).expect(200, '1', done);
      });
  });

  it('should read from req.signedCookies', function (_, done) {
    const app = express()
      .use(cookieParser('keyboard cat'))
      .use(function (req, res, next) {
        delete req.headers.cookie;
        next();
      })
      .use(createSession())
      .use(function (req, res, next) {
        req.session.count = req.session.count || 0;
        req.session.count++;
        res.end(req.session.count.toString());
      });

    request(app)
      .get('/')
      .expect(200, '1', function (err, res) {
        if (err) return done(err);
        request(app).get('/').set('Cookie', cookie(res)).expect(200, '2', done);
      });
  });
});
