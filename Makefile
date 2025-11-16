check: lint test

lint:
	./node_modules/.bin/biome ci

format:
	./node_modules/.bin/biome check --write

test:
	node --test --test-timeout=3000 $(TEST_OPTS) test/*.js test/session/*.js

test-cov: TEST_OPTS := --experimental-test-coverage
test-cov: test

.PHONY: check lint format test test-cov
