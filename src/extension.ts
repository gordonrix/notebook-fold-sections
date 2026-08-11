import * as vscode from 'vscode';

/**
 * Returns the heading level (1-6) of the first ATX header in a markdown
 * cell, or undefined if the cell contains no header.
 */
function headerLevel(cell: vscode.NotebookCell): number | undefined {
    if (cell.kind !== vscode.NotebookCellKind.Markup) {
        return undefined;
    }
    const match = cell.document.getText().match(/^(#{1,6})\s/m);
    return match ? match[1].length : undefined;
}

/**
 * Fold every markdown-header section whose heading level is >= minLevel.
 * minLevel of 1 folds everything; 2 keeps top-level sections open but
 * collapses their subsections; etc.
 *
 * Note: folding a section whose parent also gets folded is harmless, so we
 * simply fold every qualifying header cell. We iterate in reverse document
 * order so that folding a parent section never happens before its children
 * (fold state is tracked per cell index in the view model, and folding
 * bottom-up avoids any index-shift weirdness across VS Code versions).
 */
async function foldToLevel(minLevel: number): Promise<void> {
    const editor = vscode.window.activeNotebookEditor;
    if (!editor) {
        vscode.window.showInformationMessage('No active notebook editor.');
        return;
    }

    const cells = editor.notebook.getCells();
    for (let i = cells.length - 1; i >= 0; i--) {
        const level = headerLevel(cells[i]);
        if (level !== undefined && level >= minLevel) {
            await vscode.commands.executeCommand('notebook.fold', {
                index: i,
                levels: 1,
                direction: 'down'
            });
        }
    }
}

async function unfoldAll(): Promise<void> {
    const editor = vscode.window.activeNotebookEditor;
    if (!editor) {
        vscode.window.showInformationMessage('No active notebook editor.');
        return;
    }

    const cells = editor.notebook.getCells();
    // Unfold top-down so outer sections open before inner ones.
    for (let i = 0; i < cells.length; i++) {
        if (headerLevel(cells[i]) !== undefined) {
            await vscode.commands.executeCommand('notebook.unfold', {
                index: i,
                levels: 1,
                direction: 'down'
            });
        }
    }
}

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('notebookFoldSections.foldAll', () => foldToLevel(1)),
        vscode.commands.registerCommand('notebookFoldSections.foldLevel1', () => foldToLevel(1)),
        vscode.commands.registerCommand('notebookFoldSections.foldLevel2', () => foldToLevel(2)),
        vscode.commands.registerCommand('notebookFoldSections.foldLevel3', () => foldToLevel(3)),
        vscode.commands.registerCommand('notebookFoldSections.unfoldAll', () => unfoldAll())
    );
}

export function deactivate(): void {
    // nothing to clean up
}
