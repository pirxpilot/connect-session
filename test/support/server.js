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

function createServer(setup, options, respond) {
  const server = http.createServer();

  if (typeof setup === 'function') {
    // setup, options, respond
    server.on('request', setup);
  } else {
    // options, respond
    respond = options;
    options = setup;
  }

  return server.on('request', createRequestListener(options, respond));
}

function createRequestListener(options, respond = end) {
  const { secret = 'keyboard cat', ...opts } = options ?? {};
  const _session = createSession(opts);

  return onRequest;

  function onRequest(req, res) {
    if (secret) {
      req.secret ??= secret;
    }
    response(res); // add cookie related methods to res

    const _cookieParser = cookieParser(req.secret);
    _cookieParser(req, res, err => {
      if (err) {
        res.statusCode = err.status || 500;
        res.end(err.message);
        return;
      }

      _session(req, res, err => {
        if (err && !res._header) {
          res.statusCode = err.status || 500;
          res.end(err.message);
          return;
        }

        if (err) {
          this.emit('error', err);
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

function end(_req, res) {
  res.end();
}

function mountAt(path) {
  return (req, _res) => {
    if (req.url.indexOf(path) === 0) {
      req.originalUrl = req.url;
      req.url = req.url.slice(path.length);
    }
  };
}
