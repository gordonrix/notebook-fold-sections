import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Integration checks for notebook-fold-sections.
 *
 * Oracle: `NotebookEditor.visibleRanges` reports *model* cell indices for the
 * cells currently rendered. VS Code builds it by walking view indices and
 * mapping each back to a model index, splitting the result into several ranges
 * whenever the two drift apart -- which is exactly what folding causes, since a
 * folded-away cell is dropped from the view model. A cell absent from
 * visibleRanges while its neighbours are present is therefore folded away.
 *
 * visibleRanges only covers the scroll viewport, so every assertion scrolls
 * through the notebook and unions what it sees rather than trusting one screen.
 */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function rangesOf(editor: vscode.NotebookEditor): vscode.NotebookRange[] {
    return [...editor.visibleRanges].sort((a, b) => a.start - b.start);
}

function describeRanges(ranges: readonly vscode.NotebookRange[]): string {
    return ranges.map((r) => `[${r.start},${r.end})`).join(' ') || '<none>';
}

function indicesOf(ranges: readonly vscode.NotebookRange[]): number[] {
    const out: number[] = [];
    for (const r of ranges) {
        for (let i = r.start; i < r.end; i++) {
            out.push(i);
        }
    }
    return out;
}

/** Wait until visibleRanges stops changing, so we never read mid-relayout. */
async function settle(editor: vscode.NotebookEditor): Promise<void> {
    let previous = describeRanges(rangesOf(editor));
    for (let attempt = 0; attempt < 80; attempt++) {
        await sleep(150);
        const current = describeRanges(rangesOf(editor));
        if (current === previous) {
            return;
        }
        previous = current;
    }
}

/**
 * Wait for the notebook to render at all before trusting visibleRanges. A fixed
 * sleep is not enough on a slow CI runner, and settle() alone would happily
 * conclude that "no cells rendered" is a stable state.
 */
async function waitForRender(editor: vscode.NotebookEditor): Promise<void> {
    for (let attempt = 0; attempt < 200 && rangesOf(editor).length === 0; attempt++) {
        await sleep(150);
    }
    await settle(editor);
}

/**
 * Scroll from the top of the notebook to the bottom, unioning everything
 * rendered along the way, to get the cells visible anywhere in the notebook
 * rather than just in one viewport. Each step scrolls just past the last cell
 * already seen, so no cell can slip between two scroll positions; a target that
 * is folded away cannot be revealed, so the walk steps over it by one.
 */
async function scanVisible(editor: vscode.NotebookEditor): Promise<number[]> {
    const total = editor.notebook.cellCount;
    const seen = new Set<number>();
    let target = 0;

    while (target < total) {
        editor.revealRange(new vscode.NotebookRange(target, target + 1));
        await settle(editor);
        const rendered = indicesOf(rangesOf(editor));
        for (const i of rendered) {
            seen.add(i);
        }
        const furthest = rendered.length ? Math.max(...rendered) : -1;
        target = Math.max(target + 1, furthest);
    }

    editor.revealRange(new vscode.NotebookRange(0, 1));
    await settle(editor);
    return [...seen].sort((a, b) => a - b);
}

const failures: string[] = [];
const notes: string[] = [];

function check(condition: boolean, message: string): void {
    notes.push(`  ${condition ? 'PASS' : 'FAIL'}  ${message}`);
    if (!condition) {
        failures.push(message);
    }
}

/** Assert exactly which cells survive folding, across the whole notebook. */
async function checkFolding(
    label: string,
    editor: vscode.NotebookEditor,
    expectedVisible: number[]
): Promise<void> {
    const visible = await scanVisible(editor);
    const total = editor.notebook.cellCount;
    const hidden = [];
    for (let i = 0; i < total; i++) {
        if (!visible.includes(i)) {
            hidden.push(i);
        }
    }
    const expectedHidden = [];
    for (let i = 0; i < total; i++) {
        if (!expectedVisible.includes(i)) {
            expectedHidden.push(i);
        }
    }
    const same =
        visible.length === expectedVisible.length &&
        visible.every((v, i) => v === expectedVisible[i]);

    check(
        same,
        `${label}: hidden cells ${JSON.stringify(hidden)} ${same ? '==' : '!='} expected ${JSON.stringify(expectedHidden)}` +
            (same ? '' : ` (visible was ${JSON.stringify(visible)})`)
    );
}

async function openFixture(file: string): Promise<vscode.NotebookEditor> {
    const uri = vscode.Uri.file(path.resolve(__dirname, '../../../fixtures', file));
    const doc = await vscode.workspace.openNotebookDocument(uri);
    const editor = await vscode.window.showNotebookDocument(doc);
    await waitForRender(editor);
    return editor;
}

async function exec(command: string): Promise<void> {
    await vscode.commands.executeCommand(command);
}

export function run(): Promise<void> {
    return main();
}

async function main(): Promise<void> {
    // Found by name rather than by publisher-qualified id, so renaming the
    // publisher doesn't break the suite.
    const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'notebook-fold-sections');
    if (!ext) {
        throw new Error('extension notebook-fold-sections not found in the test instance');
    }
    await ext.activate();

    const commands = await vscode.commands.getCommands(true);
    for (const id of [
        'notebookFoldSections.foldAll',
        'notebookFoldSections.foldLevel1',
        'notebookFoldSections.foldLevel2',
        'notebookFoldSections.foldLevel3',
        'notebookFoldSections.unfoldAll'
    ]) {
        check(commands.includes(id), `command ${id} is registered`);
    }

    // ---------------------------------------------------------------- fixture 1
    // 0  # Level 1 - Alpha        7  code
    // 1  code                     8  # Level 1 - Beta
    // 2  ## Level 2 - Alpha.1     9  code
    // 3  code                    10  markdown, no header
    // 4  ### Level 3 - Alpha.1.a 11  ## Level 2 - Beta.1
    // 5  code                    12  code
    // 6  ## Level 2 - Alpha.2
    const editor = await openFixture('fold_level_test.ipynb');
    check(editor.notebook.cellCount === 13, `synthetic fixture has 13 cells (got ${editor.notebook.cellCount})`);

    const all = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    await checkFolding('baseline, nothing folded', editor, all);

    await exec('notebookFoldSections.foldAll');
    // Folding both level-1 headers hides everything except the two headers.
    await checkFolding('fold all', editor, [0, 8]);

    await exec('notebookFoldSections.foldAll');
    await checkFolding('fold all twice is idempotent', editor, [0, 8]);

    await exec('notebookFoldSections.unfoldAll');
    await checkFolding('unfold all restores every cell', editor, all);

    await exec('notebookFoldSections.foldLevel2');
    // '#' sections stay open; each '##' collapses, taking its '###' child with it.
    await checkFolding('fold to level 2 keeps # open, collapses ##', editor, [0, 1, 2, 6, 8, 9, 10, 11]);

    await exec('notebookFoldSections.unfoldAll');
    await checkFolding('unfold all after fold-to-level-2', editor, all);

    await exec('notebookFoldSections.foldLevel3');
    // Only the single '###' section collapses, hiding cell 5.
    await checkFolding('fold to level 3 collapses only ###', editor, [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12]);

    await exec('notebookFoldSections.unfoldAll');
    await checkFolding('unfold all after fold-to-level-3', editor, all);

    // ---------------------------------------------------------------- fixture 2
    // Same-depth headers only: a '###' at every even index 0..12, a trailing
    // header-less markdown cell, and code cells tall enough that the notebook
    // cannot fit on one screen -- so this also exercises the scrolling scan.
    const many = await openFixture('many_sections.ipynb');
    check(many.notebook.cellCount === 15, `many-sections fixture has 15 cells (got ${many.notebook.cellCount})`);

    const manyAll = Array.from({ length: 15 }, (_, i) => i);
    const manyHeaders = Array.from({ length: 7 }, (_, i) => i * 2);

    await checkFolding('many-sections baseline', many, manyAll);

    await exec('notebookFoldSections.foldAll');
    await checkFolding('many-sections: fold all leaves the 7 headers', many, manyHeaders);

    await exec('notebookFoldSections.unfoldAll');
    await checkFolding('many-sections: unfold all restores every cell', many, manyAll);

    console.log('\n===== notebook-fold-sections results =====');
    for (const n of notes) {
        console.log(n);
    }
    console.log('==========================================\n');

    if (failures.length) {
        throw new Error(`${failures.length} check(s) failed:\n - ${failures.join('\n - ')}`);
    }
}
