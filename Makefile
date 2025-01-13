check: lint test

lint:
	./node_modules/.bin/jshint index.js session test

test: export NODE_TLS_REJECT_UNAUTHORIZED:=0
test:
	node --require ./test/support/env --test $(EXTRA_TEST_OPTIONS) test/*.js test/session/*.js

test-coverage: export EXTRA_TEST_OPTIONS:=--experimental-test-coverage
test-coverage: test

.PHONY: check lint test test-coverage
