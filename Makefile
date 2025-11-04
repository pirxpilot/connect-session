check: lint test

lint:
	./node_modules/.bin/biome ci

format:
	./node_modules/.bin/biome check --write

test:
	node --require ./test/support/env.js --test $(TEST_OPTS) test/*.js test/session/*.js

test-cov: TEST_OPTS := --experimental-test-coverage
test-cov: test

.PHONY: check lint format test test-cov
