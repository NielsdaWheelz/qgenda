# Engineering Rules Subtree

The shared engineering standards in `docs/rules/` are imported from the
`docs/` directory of `../engineering-docs` using Git subtree.

The upstream repository root contains files outside its `docs/` directory, so
this repository tracks a subtree split of upstream `docs/` rather than the
upstream repository root.

## Source

- Local upstream: `../engineering-docs`
- Upstream branch: `main`
- Local prefix: `docs/rules`

## Update

From this repository root:

```sh
ENGINEERING_DOCS_SPLIT="$(
  git -C ../engineering-docs subtree split --prefix docs main
)"

git subtree pull \
  --prefix docs/rules \
  ../engineering-docs \
  "$ENGINEERING_DOCS_SPLIT" \
  --squash
```

## Boundary

- `docs/rules/` is owned by the upstream engineering-docs subtree.
- Local product docs stay outside `docs/rules/`.
- Do not add QGenda-specific rules inside `docs/rules/`.
