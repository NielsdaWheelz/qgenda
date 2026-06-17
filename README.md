# Engineering Docs

Language-agnostic engineering documentation and project standards.

## Status

The core docs are written as reusable engineering standards. Some module-owned
docs may still capture repository-local systems; treat those as extraction
source material until their portable rules have been pulled into the shared
standards.

## Entry Point

Start with [`docs/index.md`](docs/index.md).

## Consumption

The docs are plain Markdown and intentionally do not require a language runtime.
Use Git subtree as the default import mechanism. It keeps the consuming
repository normal: `docs/` is just files, fresh clones need no submodule setup,
and updates are explicit.

To replace an existing `docs/` directory in a consuming repository:

```sh
git pull --ff-only
git rm -r docs
git commit -m "Remove local engineering docs"

git subtree add \
  --prefix docs \
  git@github.com:codaptai/engineering-docs.git \
  main \
  --squash

git push
```

To update the imported docs later:

```sh
git subtree pull \
  --prefix docs \
  git@github.com:codaptai/engineering-docs.git \
  main \
  --squash

git push
```

Other valid consumption patterns:

- Package plus sync script: useful when most consuming repositories already
  share a package manager. The sync script copies the package's `docs/` into the
  repo-local `docs/`.
- Vendored copy with an upstream note: simplest and most portable. Copy `docs/`
  into the consuming repo and record this repository URL plus source commit in a
  local note.
- Git submodule: use only when the consuming repo should store a live pointer to
  this repo. Submodules are precise but add clone/update ergonomics that most
  docs consumers do not need.

Consumer repositories should keep local product, module, and architecture docs
separate from these shared standards.

## Boundary

Shared docs should define reusable engineering rules. Repository-local docs
should stay in the repository that owns the product, module, deployment, or
runtime behavior.
