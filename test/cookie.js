const { describe, it } = require('node:test');
const assert = require('node:assert');
const Cookie = require('../session/cookie');

describe('new Cookie()', () => {
  it('should create a new cookie object', () => {
    assert.strictEqual(typeof new Cookie(), 'object');
  });

  it('should default expires to null', () => {
    const cookie = new Cookie();
    assert.strictEqual(cookie.expires, null);
  });

  it('should default httpOnly to true', () => {
    const cookie = new Cookie();
    assert.strictEqual(cookie.httpOnly, true);
  });

  it('should default path to "/"', () => {
    const cookie = new Cookie();
    assert.strictEqual(cookie.path, '/');
  });

  it('should default maxAge to null', () => {
    const cookie = new Cookie();
    assert.strictEqual(cookie.maxAge, null);
  });

  describe('with options', () => {
    it('should create a new cookie object', () => {
      assert.strictEqual(typeof new Cookie({}), 'object');
    });

    it('should reject non-objects', () => {
      assert.throws(() => {
        new Cookie(42);
      }, /argument options/);
      assert.throws(() => {
        new Cookie('foo');
      }, /argument options/);
      assert.throws(() => {
        new Cookie(true);
      }, /argument options/);
      assert.throws(() => {
        new Cookie(() => {});
      }, /argument options/);
    });

    it('should ignore "data" option', () => {
      const cookie = new Cookie({ data: { foo: 'bar' }, path: '/foo' });

      assert.strictEqual(typeof cookie, 'object');
      assert.strictEqual(typeof cookie.data, 'object');
      assert.strictEqual(cookie.data.path, '/foo');
      assert.notStrictEqual(cookie.data.foo, 'bar');
    });

    describe('expires', () => {
      it('should set expires', () => {
        const expires = new Date(Date.now() + 60000);
        const cookie = new Cookie({ expires });

        assert.strictEqual(cookie.expires, expires);
      });

      it('should set maxAge', () => {
        const expires = new Date(Date.now() + 60000);
        const cookie = new Cookie({ expires });

        assert.ok(expires.getTime() - Date.now() - 1000 <= cookie.maxAge);
        assert.ok(expires.getTime() - Date.now() + 1000 >= cookie.maxAge);
      });
    });

    describe('httpOnly', () => {
      it('should set httpOnly', () => {
        const cookie = new Cookie({ httpOnly: false });

        assert.strictEqual(cookie.httpOnly, false);
      });
    });

    describe('maxAge', () => {
      it('should set expires', () => {
        const maxAge = 60000;
        const cookie = new Cookie({ maxAge });

        assert.ok(cookie.expires.getTime() - Date.now() - 1000 <= maxAge);
        assert.ok(cookie.expires.getTime() - Date.now() + 1000 >= maxAge);
      });

      it('should set maxAge', () => {
        const maxAge = 60000;
        const cookie = new Cookie({ maxAge });

        assert.strictEqual(typeof cookie.maxAge, 'number');
        assert.ok(cookie.maxAge - 1000 <= maxAge);
        assert.ok(cookie.maxAge + 1000 >= maxAge);
      });

      it('should accept Date object', () => {
        const maxAge = new Date(Date.now() + 60000);
        const cookie = new Cookie({ maxAge });

        assert.strictEqual(cookie.expires.getTime(), maxAge.getTime());
        assert.ok(maxAge.getTime() - Date.now() - 1000 <= cookie.maxAge);
        assert.ok(maxAge.getTime() - Date.now() + 1000 >= cookie.maxAge);
      });

      it('should reject invalid types', () => {
        assert.throws(() => {
          new Cookie({ maxAge: '42' });
        }, /maxAge/);
        assert.throws(() => {
          new Cookie({ maxAge: true });
        }, /maxAge/);
        assert.throws(() => {
          new Cookie({ maxAge() {} });
        }, /maxAge/);
      });
    });

    describe('partitioned', () => {
      it('should set partitioned', () => {
        const cookie = new Cookie({ partitioned: true });

        assert.strictEqual(cookie.partitioned, true);
      });
    });

    describe('path', () => {
      it('should set path', () => {
        const cookie = new Cookie({ path: '/foo' });

        assert.strictEqual(cookie.path, '/foo');
      });
    });

    describe('priority', () => {
      it('should set priority', () => {
        const cookie = new Cookie({ priority: 'high' });

        assert.strictEqual(cookie.priority, 'high');
      });
    });
  });
});
