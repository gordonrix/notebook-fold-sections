import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // Isolated profile so the test run never touches the user's real
    // VS Code settings, extensions or window state.
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nbfold-test-'));

    await runTests({
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs: [
            '--user-data-dir', path.join(profile, 'user-data'),
            '--extensions-dir', path.join(profile, 'extensions'),
            '--skip-welcome',
            '--skip-release-notes',
            '--disable-workspace-trust'
        ]
    });
}

main().catch((err) => {
    console.error('Test run failed:', err);
    process.exit(1);
});
