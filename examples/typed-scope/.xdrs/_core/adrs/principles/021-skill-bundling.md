---
name: _core-adr-policy-021-skill-bundling
description: Defines how a skill package MAY be bundled into a self-contained standalone distributable via a per-skill Makefile, including dist/ staging, recursive dependency delegation, and selective copying. Use when packaging a skill for standalone distribution outside the full xdrs-core package.
apply-to: Skill packages that need standalone distribution outside the full xdrs-core package
valid-from: 2026-09-19
---

# _core-adr-policy-021: Skill bundling

## Context and Problem Statement

Skills sometimes need to be shared or distributed as standalone artifacts outside the full `xdrs-core` package — for example, published separately or handed to a team that does not consume the whole repository. A skill that references shared `.assets/` modules (see `_core-adr-policy-003`) or embeds another skill as a dependency cannot simply be copied as a single `SKILL.md` file without breaking those references. No automated bundling utility exists yet, so each skill's own build process must resolve its dependencies; this means the same short recursive-copy pattern is duplicated across every bundling-enabled skill's `Makefile`, an accepted tradeoff until a shared build utility exists.

Question: How should a skill package that depends on shared assets or other skills be packaged into a self-contained standalone distributable?

## Decision Outcome

**Optional per-skill `Makefile` that stages a self-contained `dist/` output, recursively delegating to each dependency's own bundling `Makefile`**

A skill MAY add its own `Makefile` to become bundling-enabled. Running `make build` inside the skill's folder stages a self-contained copy of the skill and everything it needs in a local, gitignored `dist/` folder. When the skill embeds another skill as a dependency and that dependency is itself bundling-enabled, `build` delegates to the dependency's own `make build` and copies its output wholesale, so the mechanism nests recursively without a central build utility. This is independent of the repository-level `.filedist-package.yml` distribution flow used to publish whole XDRS packages; it operates entirely within a single skill's own folder.

### Details

#### 01-bundling-is-optional
A skill MAY opt into standalone bundling by adding its own `Makefile` with `build`, `test`, and `clean` targets inside its own package folder (`skills/[skill-name]/Makefile`). Skills that are always consumed as part of the full `xdrs-core` package are not required to add one.

#### 02-dist-output-location
When present, the bundling `Makefile` MUST stage its output in a `dist/` folder relative to the root of the skill's own package (`skills/[skill-name]/dist/`). `dist/` MUST NOT be committed: a `.gitignore` entry covering `dist` (a bare `dist` or `**/dist` line) MUST exist in either the repository root `.gitignore` or a `.gitignore` local to the skill package. If the root `.gitignore` already covers it, no additional local entry is needed.

#### 03-works-without-bundling
A skill's `SKILL.md` MUST remain fully functional when consumed directly from its normal in-repo location, without ever running `make build`. The `dist/` output is an additional, optional artifact for standalone distribution; `SKILL.md` MUST NOT hard-depend on `dist/` existing.

#### 04-selective-copy
`make build` MUST copy only the files strictly necessary for the skill to run: its own `SKILL.md`, whichever of `scripts/`, `references/`, or `.assets/` it actually uses, and the specific shared modules or dependency skills it references. Tests, fixtures, or unrelated repository resources MUST NOT be copied into `dist/`.

#### 05-preserve-relative-paths
Files that belong to the skill's own package (`scripts/`, `references/`, its own `.assets/`) MUST be copied preserving their path relative to `SKILL.md` unchanged, since `SKILL.md` and its own files move into `dist/` together as a unit and their relative relationship to each other does not change. Links to a bundled dependency (a shared `.assets/` module elsewhere or another skill) MUST instead be rewritten inside the copied `SKILL.md` (and any other copied file that references it) to the new flattened path produced by rule `06-recursive-delegation`, using a mechanical text substitution (for example `sed`) as part of `build`. An unrewritten external link MUST NOT be left in place — `dist/` sits one directory level below the original `SKILL.md`, so the original relative path no longer resolves to the right location once the target has been copied.

#### 06-recursive-delegation
When a skill's `build` target embeds another skill as a dependency, `build` MUST stage that dependency under `dist/<dependency-name>/` in both cases: if the dependency has its own bundling `Makefile`, run `$(MAKE) -C <dependency-path> build` first and copy its already-built `dist/` output wholesale into `dist/<dependency-name>/`; if it does not, create `dist/<dependency-name>/` and copy only its bare `SKILL.md` into it. Using the same `dist/<dependency-name>/` shape in both cases keeps the bundle consistent regardless of whether the dependency is itself bundling-enabled. After staging, `build` MUST rewrite the original cross-package reference inside the copied `SKILL.md` (per rule `05-preserve-relative-paths`) to point at `<dependency-name>/SKILL.md`. A minimal illustrative pattern:

```makefile
DEPS := ../shared-skill ../another-skill

build:
	mkdir -p dist
	cp SKILL.md dist/
	@for d in $(DEPS); do \
	  name=$$(basename $$d); \
	  mkdir -p dist/$$name; \
	  if [ -f $$d/Makefile ]; then \
	    $(MAKE) -C $$d build; \
	    cp -R $$d/dist/. dist/$$name/; \
	  else \
	    cp $$d/SKILL.md dist/$$name/; \
	  fi; \
	  sed -i.bak "s#$$d/SKILL.md#$$name/SKILL.md#g" dist/SKILL.md && rm -f dist/SKILL.md.bak; \
	done

test: build
clean:
	rm -rf dist
```

#### 07-dependency-must-have-own-makefile
A skill that is itself listed as another skill's bundling dependency, and that has cross-skill references of its own, MUST have its own bundling `Makefile`. Without one, only its bare `SKILL.md` can be copied and its own references cannot be resolved automatically. This is not mechanically lint-enforceable; authors MUST self-check it when wiring a dependency into another skill's `Makefile`, and a `make test` run that exercises every resolved reference is the practical backstop for catching a violation.

#### 08-no-cycle-detection
The recursive delegation described in rule `06-recursive-delegation` has no cycle detection. Authors MUST NOT introduce circular bundling dependencies between skills, since that would cause unbounded recursive `make build` invocations.

#### 09-standard-targets
The bundling `Makefile` MUST expose `build`, `test`, and `clean` targets, mirroring the repository root `Makefile` convention. `clean` MUST remove only its own `dist/` and MUST NOT cascade into dependency skills' own `dist/` folders. `test` SHOULD cascade into each bundling-enabled dependency's own `test` target and SHOULD verify the skill still works from its bundled `dist/` output.

#### 10-zip-artifact
`make build` SHOULD also produce a single zip archive of the final `dist/` contents as the distributable artifact, alongside the uncompressed `dist/` folder.

## References

- [_core-adr-policy-001 - XDRS standards](001-xdrs-standards.md)
- [_core-adr-policy-003 - Skill standards](003-skill-standards.md)
- [_core-adr-policy-008 - Policy structured standards](008-policy-structured-standards.md)
