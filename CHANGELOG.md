# Changelog

## 0.1.0

First public release.

- Fold and unfold all markdown header sections in a Jupyter notebook at once.
- Fold to heading level 1, 2, or 3, collapsing headers at that depth and below.
- Default keybindings bound to the notebook cell list, so they don't shadow VS Code's
  own code-folding shortcuts while editing a cell.
- Integration test suite covering fold-all, fold-to-level, unfold-all, and idempotence
  against a synthetic notebook and a real-world one.
