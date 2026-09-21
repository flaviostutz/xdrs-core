# Bundles plan-research standalone, including its imagine-scenarios dependency, which has no
# bundling Makefile of its own (_core-adr-policy-021).
SHELL := /bin/bash
DEPS := ../imagine-scenarios
BUILD := dist/build
ZIP := plan-research.zip

build: clean
	mkdir -p $(BUILD)
	cp SKILL.md $(BUILD)/
	@for d in $(DEPS); do \
	  name=$$(basename $$d); \
	  mkdir -p $(BUILD)/dist/$$name; \
	  if [ -f $$d/Makefile ]; then \
	    $(MAKE) -C $$d build; \
	    cp -R $$d/dist/build/. $(BUILD)/dist/$$name/; \
	  else \
	    cp $$d/SKILL.md $(BUILD)/dist/$$name/; \
	  fi; \
	  sed -i.bak "s#$$d/SKILL.md#dist/$$name/SKILL.md#g" $(BUILD)/SKILL.md && rm -f $(BUILD)/SKILL.md.bak; \
	done
	cd $(BUILD) && zip -rq ../$(ZIP) .

test: build
	test -f $(BUILD)/SKILL.md
	test -f $(BUILD)/dist/imagine-scenarios/SKILL.md
	test -f dist/$(ZIP)
	@echo "plan-research bundling test passed"

clean:
	rm -rf dist
