-include .env
export

VERSION := $(shell node -p "require('./package.json').version")
NAME    := $(shell node -p "require('./package.json').name")
VSIX    := $(NAME)-$(VERSION).vsix

.PHONY: build package publish claim clean

build:
	npm run build

package: build
	npx vsce package
	@echo "Packaged: $(VSIX)"

publish: package
	@if [ -z "$(OVSX_TOKEN)" ]; then echo "Error: OVSX_TOKEN not set in .env"; exit 1; fi
	npx ovsx publish $(VSIX) -p $(OVSX_TOKEN)
	@echo "Published to Open VSX: $(VSIX)"

claim:
	@if [ -z "$(OVSX_TOKEN)" ]; then echo "Error: OVSX_TOKEN not set in .env"; exit 1; fi
	npx ovsx namespace claim lokio -p $(OVSX_TOKEN)

clean:
	rm -f *.vsix
