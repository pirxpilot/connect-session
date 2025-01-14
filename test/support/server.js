const http = require('node:http');
const session = require('../../');
const response = require('./response');

const cookieParser = require('cookie-parser');

module.exports = {
  createServer,
  createSession,
  createRequestListener,
  mountAt
};

function createServer(options, respond) {
  let fn = respond;
  let opts = options;
  const server = http.createServer();

  // setup, options, respond
  if (typeof arguments[0] === 'function') {
    opts = arguments[1];
    fn = arguments[2];

    server.on('request', arguments[0]);
  }

  return server.on('request', createRequestListener(opts, fn));
}

function createRequestListener(options, fn) {
  const {
    secret = 'keyboard cat',
    ...opts
  } = options ?? {};
  const _session = createSession(opts);
  const respond = fn || end;

  return onRequest;

  function onRequest(req, res) {
    const server = this;
    if (secret) {
      req.secret ??= secret;
    }
    response(res);  // add cookie related methods to res

    const _cookieParser = cookieParser(req.secret);
    _cookieParser(req, res, function (err) {
      if (err) {
        res.statusCode = err.status || 500;
        res.end(err.message);
        return;
      }

      _session(req, res, function (err) {
        if (err && !res._header) {
          res.statusCode = err.status || 500;
          res.end(err.message);
          return;
        }

        if (err) {
          server.emit('error', err);
          return;
        }

        respond(req, res);
      });
    });
  }
}

function createSession(opts) {
  const options = opts || {};
  options.cookie ??= { maxAge: 60 * 1000 };
  return session(options);
}

function end(req, res) {
  res.end();
}

function mountAt(path) {
  return function (req, res) {
    if (req.url.indexOf(path) === 0) {
      req.originalUrl = req.url;
      req.url = req.url.slice(path.length);
    }
  };
}
