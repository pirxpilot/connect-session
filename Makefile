check: lint test

lint:
	./node_modules/.bin/eslint .
	node ./scripts/lint-readme.js


test: export NODE_TLS_REJECT_UNAUTHORIZED:=0
test:
	mocha --require test/support/env --check-leaks --bail --no-exit --reporter spec test

.PHONY: check lint test
