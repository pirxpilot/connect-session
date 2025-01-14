[![NPM version][npm-image]][npm-url]
[![Build Status][build-image]][build-url]
[![Dependency Status][deps-image]][deps-url]

# @pirxpilot/connect-session

This is a fork of the [express-session] with the following changes:
- modernized for node >= 20
- relaxed dependencies
- cookies parser midlleware (such as [cookie-parser] and `res.cookie` implementation compatible with what [Express][express] provides is required to use this module

## License

[MIT](LICENSE)

[cookie-parser]: https://npmjs.org/package/cookie-parser
[express]: https://npmjs.org/package/express
[express-session]: https://npmjs.org/package/express-session

[npm-image]: https://img.shields.io/npm/v/@pirxpilot/connect-session
[npm-url]: https://npmjs.org/package/@pirxpilot/connect-session

[build-url]: https://github.com/pirxpilot/connect-session/actions/workflows/check.yaml
[build-image]: https://img.shields.io/github/actions/workflow/status/pirxpilot/connect-session/check.yaml?branch=main

[deps-image]: https://img.shields.io/librariesio/release/npm/@pirxpilot/connect-session
[deps-url]: https://libraries.io/npm/@pirxpilot%2Fconnect-session
