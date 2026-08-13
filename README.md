# Notebook Fold Sections

[![CI](https://github.com/gordonrix/notebook-fold-sections/actions/workflows/ci.yml/badge.svg)](https://github.com/gordonrix/notebook-fold-sections/actions/workflows/ci.yml)

Fold or unfold **every** markdown header section in a Jupyter notebook at once.

VS Code can only collapse one notebook section at a time, via the chevron next to a
markdown header — there is no fold-all for notebooks
([microsoft/vscode#195126](https://github.com/microsoft/vscode/issues/195126)). This
extension adds it, plus fold-to-a-given-heading-level so you can collapse a long
notebook down to an outline and navigate it.

## Usage

Click into the notebook and press <kbd>Esc</kbd> first, so focus is on the cell list
(command mode) rather than inside a cell's text editor. The keybindings deliberately
do not fire while you are editing a cell, so that they don't shadow VS Code's own
code-folding shortcuts.

| Command | Windows/Linux | macOS |
|---|---|---|
| Notebook: Fold All Markdown Sections | <kbd>Ctrl+K Ctrl+0</kbd> | <kbd>Cmd+K Cmd+0</kbd> |
| Notebook: Fold Markdown Sections to Level 1 | <kbd>Ctrl+K Ctrl+1</kbd> | <kbd>Cmd+K Cmd+1</kbd> |
| Notebook: Fold Markdown Sections to Level 2 | <kbd>Ctrl+K Ctrl+2</kbd> | <kbd>Cmd+K Cmd+2</kbd> |
| Notebook: Fold Markdown Sections to Level 3 | <kbd>Ctrl+K Ctrl+3</kbd> | <kbd>Cmd+K Cmd+3</kbd> |
| Notebook: Unfold All Markdown Sections | <kbd>Ctrl+K Ctrl+J</kbd> | <kbd>Cmd+K Cmd+J</kbd> |

All five are also available from the Command Palette.

**What "level" means.** Fold-to-level-N collapses every header at depth N or deeper and
leaves shallower ones open. `Cmd+K Cmd+2` keeps your `#` sections expanded while
collapsing each `##` and everything nested beneath it. In a notebook whose headers are
all the same depth, every fold level does the same thing.

Folding is view state, not document content — nothing is written to the `.ipynb`, and
reopening a notebook gives you everything expanded again.

## How it works

On each command the extension walks the active notebook's cells, finds the markup cells
whose text contains an ATX header (`/^(#{1,6})\s/m`), and invokes VS Code's built-in
`notebook.fold` / `notebook.unfold` for each qualifying cell. Folding runs in reverse
document order and unfolding forward, so a parent section is never collapsed before its
children.

`notebook.fold` accepts an `{ index, levels, direction }` argument that is internal and
undocumented. It is verified against the shipped VS Code build and covered by the
integration tests below; if a future VS Code release changes it, the tests are what will
tell you.

## Development

```bash
npm install
npm run compile
npm test
```

`npm test` downloads its own VS Code build into `.vscode-test/` (a few hundred MB) and
runs the suite in an isolated profile, so it never touches your real VS Code settings or
extensions.

The tests assert folding behaviour through `NotebookEditor.visibleRanges`, which reports
model cell indices for rendered cells and develops gaps exactly where folding removes
cells from the view model. Each check scrolls the whole notebook and unions what it sees,
so the result isn't limited to one viewport. Two fixtures are used: a notebook mixing
`#`/`##`/`###` headers to pin down fold-to-level, and a taller one with same-depth
headers that doesn't fit on a single screen.

To install a local build:

```bash
npm run package
code --install-extension notebook-fold-sections-<version>.vsix
```

## License

MIT
