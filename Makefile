check: lint test

lint:
	./node_modules/.bin/jshint index.js session test

test: export NODE_TLS_REJECT_UNAUTHORIZED:=0
test:
	node --require ./test/support/env --test

test-coverage: export NODE_TLS_REJECT_UNAUTHORIZED:=0
test-coverage:
	node --require ./test/support/env --test --experimental-test-coverage

.PHONY: check lint test
