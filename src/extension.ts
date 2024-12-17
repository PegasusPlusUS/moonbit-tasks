// Suppress Buffer() deprecation warning from C# extension
process.removeAllListeners('warning');
process.on('warning', (warning) => {
    if (!warning.message.includes('Buffer() is deprecated')) {
        console.warn(warning.stack);
    }
});

import * as mbTaskExt from './language_handler';
import * as langDef from './language_def';
import * as smartTaskExt from './smart_tasks_panel_provider';

import * as vscode from 'vscode';
import * as path from 'path';

//import * as child_process from 'child_process';
export function logTimeStamp(): string {
    return new Date().toLocaleString(); // Format: "2024-01-05T09:45:30.123Z"
}

// Add this interface at the top of your file
interface GitExtension {
    getAPI(version: number): Promise<any>;
}

// Map task types to appropriate codicons
const taskIconMap: { [key: string]: string } = {
    'build': 'codicon-package',          // Package/box icon for build
    'test': 'codicon-beaker',            // Lab beaker for testing
    'check': 'codicon-checklist',        // Checklist for verification
    'run': 'codicon-play',               // Play button for run
    'package': 'codicon-archive',        // Archive/box for packaging
    'publish': 'codicon-cloud-upload',   // Cloud upload for publishing
    'npm-publish': 'condicon-cloud-upload', // Npm publish
    'vsce-publish': 'condicon-cloud-upload', // VSCE publish
    'coverage': 'codicon-shield',        // Shield for code coverage
    'gcov': 'codicon-graph',            // Graph for gcov
    'format': 'codicon-symbol-color',    // Color/format symbol
    'clean': 'codicon-trash',            // Trash can for clean
    'lint': 'codicon-lightbulb',        // Lint
    'clippy': 'codicon-lightbulb',      // Clippy for smart tasks
    'benchmark': 'codicon-dashboard',        // Dashboard for benchmark
    'doc': 'codicon-book',              // Book for documentation
    'update': 'codicon-sync',           // Sync for update
    'upgrade': 'codicon-rocket',           // Upgrade for upgrade
    'debug': 'codicon-debug',      // Debug icon
    'rocket': 'codicon-rocket',         // Rocket for launch
    'verified': 'codicon-verified',     // Verified icon
    'tools': 'codicon-tools',           // Tools icon
    'symbol-color': 'codicon-symbol-color', // Symbol color icon
    'symbol-method': 'codicon-symbol-method', // Symbol method icon
    'terminal': 'codicon-terminal',         // Terminal icon
    'output': 'codicon-output',           // Output icon
    'file-code': 'codicon-file-code',     // File code icon
    'account': 'codicon-account',      // Account icon
    'calendar': 'codicon-calendar',     // Calendar icon
    'default': 'codicon-gear'            // Default gear icon
};

// Helper function to get icon for a task
function getTaskIcon(cmd: string): string {
    // Convert task name to lowercase for case-insensitive matching
    const normalizedTask = cmd.toLowerCase();

    // Look for matching keywords in the task name
    for (const [key, icon] of Object.entries(taskIconMap)) {
        if (normalizedTask.includes(key)) {
            return icon;
        }
    }

    // Return default icon if no match found
    return taskIconMap.default;
}

export function activate(context: vscode.ExtensionContext) {
    registerGitTasksWebview(context);
    mbTaskExt.active(context);
}

export function deactivate() {
    mbTaskExt.deactivate();
}

function registerGitTasksWebview(context: vscode.ExtensionContext) {
    // Register Smart Tasks Webview
    const gitTasksProvider = new TasksWebviewProvider(context.extensionUri);

    // Register the commands for the title bar buttons
    context.subscriptions.push(
        vscode.commands.registerCommand('moonbit-tasks.git.commit', async () => {
            if (gitTasksProvider._webview) {
                // Post a message to webview to get the commit message
                gitTasksProvider._webview.postMessage({ type: 'getCommitMessage' });
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('moonbit-tasks.git.push', async () => {
            if (gitTasksProvider._webview) {
                await gitTasksProvider.gitPush(gitTasksProvider._webview);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('moonbit-tasks.git.pull', async () => {
            if (gitTasksProvider._webview) {
                await gitTasksProvider.gitPull(gitTasksProvider._webview);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('moonbit-tasks.git.fetch', async () => {
            if (gitTasksProvider._webview) {
                await gitTasksProvider.gitFetch(gitTasksProvider._webview);
                await gitTasksProvider.getGitChanges(gitTasksProvider._webview);
            }
        })
    );

    // Register the command
    context.subscriptions.push(
        vscode.commands.registerCommand('moonbit-tasks.updateSmartTasksTreeView', () => {
            if (gitTasksProvider._webview) {
                gitTasksProvider.updateSmartTasksTreeView(gitTasksProvider._webview);
            }
        })
    );
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('myGitTasksCustomView', gitTasksProvider)
    );
    // Register the tree item selected command
    context.subscriptions.push(
        vscode.commands.registerCommand('moonbit-tasks.smartTasksTreeItemSelected', async (encodedShellCmd: string, view: vscode.Webview) => {
            const decodedShellCmd = decodeShellCmd(encodedShellCmd);
            smartTaskExt.asyncSmartTaskRun(decodedShellCmd, view);
        })
    );

    function registerContextMenu(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.commands.registerCommand('moonbit-tasks.prj.testfile', (uri: vscode.Uri) => {
                // based on language id
                const cwd = path.dirname(uri.fsPath);
                const filename = path.basename(uri.fsPath);

                if (gitTasksProvider._webview) {
                    smartTaskExt.asyncSafeRunInTerminal(`cargo t "${filename}"`, cwd, gitTasksProvider._webview);
                }
            })
        );

        // context.subscriptions.push(
        //     vscode.commands.registerCommand('extension.deleteFile', async (uri: vscode.Uri) => {
        //         const confirmed = await vscode.window.showWarningMessage(
        //             `Are you sure you want to delete ${uri.fsPath}?`,
        //             { modal: true },
        //             'Yes'
        //         );
        //         if (confirmed === 'Yes') {
        //             await vscode.workspace.fs.delete(uri);
        //             vscode.window.showInformationMessage(`${uri.fsPath} deleted.`);
        //         }
        //     })
        // );
    }
    registerContextMenu(context);

    context.subscriptions.push(
        vscode.commands.registerCommand('moonbit-tasks.refreshTodoTree', () => {
            //tasksWebviewProvider.updateTodoTree();
            gitTasksProvider.updateTodoTree();
        })
    );
}

class TasksWebviewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;  // Add this line
    public _webview?: vscode.Webview;
    private fileSystemWatcher: vscode.FileSystemWatcher | undefined;
    private watchedDir: string = "";

    constructor(private readonly _extensionUri: vscode.Uri) {
        this.hasHidden = false;
        this.hasVisible = false;
    }

    hasVisible: boolean;
    hasHidden: boolean;

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;  // Add this line
        this._webview = webviewView.webview;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // Listen for visibility changes
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.hasVisible = true;

                // View became visible
                if (this.hasHidden) {
                    this.updateSmartTasksTreeView(webviewView.webview);
                }
            } else {
                this.hasHidden = true;
                // View was hidden
                //this.onViewHidden();
            }
        });

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.command) {
                case 'pull':
                    await this.gitPull(webviewView.webview);
                    break;
                case 'fetch':
                    await this.gitFetch(webviewView.webview);
                    break;
                case 'stage':
                    if (data.files) {
                        await this.gitStage(data.files, webviewView.webview);
                    }
                    break;
                case 'commit':
                    if (data.message) {
                        this.gitCommit(data.message, webviewView.webview).catch((error) => {
                          console.error(`[$logTimeStamp()] `, error);
                        });
                    }
                    break;
                case 'push':
                    await this.gitPush(webviewView.webview);
                    break;
                case 'getChanges':
                    await this.getGitChanges(webviewView.webview);
                    break;
                case 'smartTasksTreeItemSelected':
                    // Execute the command when tree item is selected
                    console.log(`[$logTimeStamp()] `, data);
                    vscode.commands.executeCommand('moonbit-tasks.smartTasksTreeItemSelected', data.shellCmd, this);
                    break;
                case 'unstage':
                    if (data.files) {
                        await this.gitUnstage(data.files, webviewView.webview);
                    }
                    break;
                case 'discard':
                    if (data.files) {
                        await this.gitDiscard(data.files, webviewView.webview);
                    }
                    break;
                case 'switchRepository':
                    if (data.path) {
                        const git = await this.getGitAPI(webviewView.webview);
                        const newRepo = git?.repositories.find((r: any) => r.rootUri.path === data.path);
                        if (newRepo) {
                            // Save the selected repository path
                            await this.saveCurrentRepositoryPath(data);
                            // Switch to the selected repository
                            await this.getGitChanges(webviewView.webview);
                        }
                    }
                    break;
                case 'switchBranch':
                    if (data.branch) {
                        const git = await this.getGitAPI(webviewView.webview);
                        if (git?.repositories.length > 0) {
                            // Get the current repository path and find its index
                            const currentRepoPath = await this.getCurrentRepositoryPath();
                            const repoIndex = git.repositories.findIndex((r: any) => r.rootUri.path === currentRepoPath);
                            const repo = git.repositories[repoIndex !== -1 ? repoIndex : 0];

                            try {
                                await repo.checkout(data.branch);
                                if (mbTaskExt.smartCommandEntries.length === 0) {
                                    mbTaskExt.asyncRefereshSmartTasksDataProvider(data.path);
                                }
                                this.getGitChanges(webviewView.webview);
                            } catch (error: any) {
                                webviewView.webview.postMessage({
                                    type: 'error',
                                    message: 'Failed to switch branch, checking changes? : ' + (error.message || 'Unknown error')
                                });
                            }
                        }
                    }
                    break;
                case 'viewAllChanges':
                    const repo = await this.getCurrentRepository(webviewView.webview);
                    if (repo) {
                        try {
                            const resources = data.files.map((filePath: string) => {
                                const uri = vscode.Uri.file(filePath);
                                if (data.isStaged) {
                                    // For staged files: compare HEAD with INDEX
                                    return {
                                        originalUri: uri.with({
                                            scheme: 'git',
                                            path: `${uri.path}~`,
                                            query: JSON.stringify({ path: uri.fsPath, ref: 'HEAD' })
                                        }),
                                        modifiedUri: uri.with({
                                            scheme: 'git',
                                            query: JSON.stringify({ path: uri.fsPath, ref: 'INDEX' })
                                        })
                                    };
                                } else {
                                    // For unstaged files: compare INDEX with working tree
                                    return {
                                        originalUri: uri.with({
                                            scheme: 'git',
                                            path: `${uri.path}~`,
                                            query: JSON.stringify({ path: uri.fsPath, ref: 'INDEX' })
                                        }),
                                        modifiedUri: uri
                                    };
                                }
                            });

                            const multiDiffSourceUri = vscode.Uri.file(repo.rootUri.path).with({
                                scheme: 'git-changes'
                            });

                            console.log(`[${logTimeStamp()}] Opening multi diff editor for: ${multiDiffSourceUri}, ${resources}`);
                            for (const resource of resources) {
                                console.log(`Resource: ${resource.originalUri}, ${resource.modifiedUri}`);
                            }

                            async function safeAsyncExec() {
                                try {
                                    await vscode.commands.executeCommand('_workbench.openMultiDiffEditor', {
                                        multiDiffSourceUri,
                                        title: 'Git: ' + (data.isStaged ? 'Staged ' : '') + 'Changes',
                                        resources: resources
                                    });
                                } catch (error) {
                                    console.error(`Error while execute '_workbench.openMultiDiffEditor': ${error}`);
                                }
                            }
                            safeAsyncExec();
                        } catch (error: any) {
                            webviewView.webview.postMessage({
                                type: 'error',
                                message: 'Failed to open diffs: ' + (error.message || 'Unknown error')
                            });
                        }
                    }
                    break;
                case 'viewFileChanges':
                    console.log(`[${logTimeStamp()}] Opening diff for: ${data.filePath}, staged: ${data.isStaged}`);
                    //const repo = await this.getCurrentRepository(webviewView.webview);
                    //if (repo) {
                    try {
                        const filePath = data.filePath;
                        const fileUri = vscode.Uri.file(filePath);

                        // For both staged and unstaged files
                        async function safeAsyncOpenChange() {
                            try {
                                await vscode.commands.executeCommand('git.openChange', fileUri);
                            } catch (error) {
                                console.error(`executeCommand 'git.openChange', ${error}`);
                            }
                        }
                        safeAsyncOpenChange();

                        // If it's staged, we need to switch to the staged version
                        if (data.isStaged) {
                            // Try to switch to staged version after a small delay
                            setTimeout(async () => {
                                async function safeAsyncSwitch() {
                                    try {
                                        await vscode.commands.executeCommand('workbench.action.compareEditor.switchToSecondary');
                                    } catch (error) {
                                        console.error(`executing vscode.commands 'workbench.action.compareEditor.switchToSecondary', ${error}`);
                                    }
                                }
                                safeAsyncSwitch();
                            }, 500);
                        }
                    } catch (error: any) {
                        webviewView.webview.postMessage({
                            type: 'error',
                            message: 'Failed to view changes: ' + (error.message || 'Unknown error')
                        });
                    }
                    //}
                    break;
                case 'openMergeEditor':
                    if (data.file) {
                        vscode.commands.executeCommand('merge-conflict.accept.all-current', vscode.Uri.file(data.file));
                    }
                    break;
                case 'openFile':
                    const { filePath, line } = data;
                    const uri = vscode.Uri.file(filePath);
                    async function safeAsyncOpenTextDocument() {
                        try {
                            await vscode.workspace.openTextDocument(uri).then(doc => {
                                vscode.window.showTextDocument(doc).then(editor => {
                                    const position = new vscode.Position(line - 1, 0); // Line numbers are 0-based
                                    editor.selection = new vscode.Selection(position, position);
                                    editor.revealRange(new vscode.Range(position, position));
                                });
                            });
                        } catch (error) {
                            console.error(`openTextDocument ${uri}, ${error}`);
                        }
                    }
                    safeAsyncOpenTextDocument();
                    break;
            }
        });

        webviewView.webview.html = this._getHtmlContent(webviewView.webview);

        this.updateSmartTasksTreeView(webviewView.webview);
        // Initialize by getting changes
        this.getGitChanges(webviewView.webview);
    }

    private currentRepositoryPath: string = '';

    private async saveCurrentRepositoryPath(data: any) {
        try {
            await vscode.workspace.getConfiguration().update('moonbit-tasks.currentRepository', data.path, true);
        } catch (error: any) {
            console.error(`[${logTimeStamp()}] Failed to save current repository path:`, error);
            this.currentRepositoryPath = data.path;
        }
    }

    private async getCurrentRepositoryPath() {
        let path: string | undefined = undefined;
        try {
            path = await vscode.workspace.getConfiguration().get('moonbit-tasks.currentRepository');
        } catch (error: any) {
            console.error(`[${logTimeStamp()}] Failed to get current repository path:`, error);
        }

        if (path === undefined) {
            path = this.currentRepositoryPath;
        }

        return path;
    }

    // In your HTML template, add CSS for status indicators
    private _getHtmlContent(webview: vscode.Webview): string {
        // Get path to codicons.css
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._extensionUri,
            'node_modules',
            '@vscode/codicons',
            'dist',
            'codicon.css'
        ));

        // Get path to your SVG icon
        const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._extensionUri,
            'images',
            'file_type_rust_toolchain.svg'
        ));

        return `
            <!DOCTYPE html>
            <html>
                <head>
                    <link href="\${codiconsUri}" rel="stylesheet" />
                    <style>
                        /* General layout styles */
                        .panel-container {
                            display: flex;
                            flex-direction: column;
                            height: 100vh;
                            gap: 12px;
                        }

                        .git-status {
                            display: inline-block;
                            width: 8px;
                            margin-right: 4px;
                            color: var(--vscode-gitDecoration-modifiedResourceForeground);
                            font-family: monospace;
                            font-weight: bold;
                        }

                        .git-status.Modified { color: var(--vscode-gitDecoration-modifiedResourceForeground); }
                        .git-status.Added { color: var(--vscode-gitDecoration-addedResourceForeground); }
                        .git-status.Deleted { color: var(--vscode-gitDecoration-deletedResourceForeground); }
                        .git-status.Renamed { color: var(--vscode-gitDecoration-modifiedResourceForeground); }
                        .git-status.Untracked { color: var(--vscode-gitDecoration-untrackedResourceForeground); }

                        /*.tree-item {*/
                        /*    display: flex;*/
                        /*    align-items: center;*/
                        /*    padding: 4px 8px;*/
                        /*}*/

                        .tree-children {
                            margin-left: 20px; /* Indent submenu items */
                            border-left: 1px dashed #ccc; /* Optional visual indicator */
                            padding-left: 10px;
                        }

                        .tree-item {
                            display: flex;
                            align-items: center;
                            justify-content: flex-start;
                            padding: 5px;
                            border: 1px solid #ddd;
                            margin: 2px 0;
                        }

                        .toggle-subcommands {
                            background: none;
                            border: none;
                            cursor: pointer;
                            padding: 2px 4px;
                            color: var(--vscode-foreground);
                            opacity: 0.8;
                        }

                        .toggle-subcommands:hover {
                            opacity: 1;
                        }

                        .subcommands {
                            margin-left: 20px;
                            padding-left: 10px;
                            border-left: 1px solid var(--vscode-widget-border);
                            display: block;
                        }

                        .subcommands.hidden {
                            display: none;
                        }

                        .tree-item-label {
                            margin-left: 5px;
                        }

                        .git-panel, .smart-tasks-panel {
                            flex: 1;
                            overflow-y: auto;
                            border: 1px solid var(--vscode-panel-border);
                            border-radius: 4px;
                            margin: 4px;
                        }

                        .section-header {
                            padding: 2px 4px;
                            font-weight: bold;
                            color: var(--vscode-foreground);
                            background: var(--vscode-sideBar-background);
                            position: sticky;
                            top: 0;
                            z-index: 1;
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            cursor: pointer;
                            user-select: none;
                        }

                        .section-header:hover {
                            background: var(--vscode-list-hoverBackground);
                        }

                        .header-content {
                            display: flex;
                            align-items: center;
                            gap: 4px;
                        }

                        .tree-view.hidden {
                            display: none;
                        }

                        .file-tree {
                            margin: 0;
                            padding: 0;
                        }

                        .file-item {
                            display: flex;
                            align-items: center;
                            padding: 4px 8px;
                            cursor: pointer;
                        }

                        .file-name {
                            flex: 1;
                            white-space: nowrap;
                            overflow: hidden;
                            text-overflow: ellipsis;
                        }

                        .file-actions {
                            display: flex;
                            align-items: center;
                            gap: 4px;
                            margin-left: auto;
                        }

                        .git-status {
                            margin-left: 4px;
                            color: var(--vscode-gitDecoration-modifiedResourceForeground);
                        }

                        .action-button {
                            padding: 2px 4px;
                            background: transparent;
                            border: none;
                            color: var(--vscode-foreground);
                            cursor: pointer;
                            font-size: 12px;
                            opacity: 0.8;
                        }

                        .action-button:hover {
                            opacity: 1;
                            background: var(--vscode-button-background);
                        }

                        .tooltip {
                            position: absolute;
                            background: var(--vscode-editor-background);
                            border: 1px solid var(--vscode-widget-border);
                            padding: 4px 8px;
                            border-radius: 2px;
                            font-size: 12px;
                            z-index: 1000;
                            display: none;
                            white-space: nowrap;
                            top: 100%;
                            left: 0;
                        }

                        .file-item:hover .tooltip {
                            display: block;
                        }

                        .status-message {
                            position: fixed;
                            bottom: 20px;
                            left: 50%;
                            transform: translateX(-50%);
                            padding: 8px 16px;
                            border-radius: 4px;
                            font-size: 12px;
                            z-index: 1000;
                            display: none;
                        }

                        .status-message.error {
                            background: var(--vscode-inputValidation-errorBackground);
                            border: 1px solid var(--vscode-inputValidation-errorBorder);
                            color: var(--vscode-inputValidation-errorForeground);
                        }

                        .status-message.info {
                            background: var(--vscode-inputValidation-infoBackground);
                            border: 1px solid var(--vscode-inputValidation-infoBorder);
                            color: var(--vscode-inputValidation-infoForeground);
                        }

                        .button-container {
                            display: flex;
                            gap: 8px;
                            margin: 8px;
                            justify-content: space-between;
                        }

                        .button {
                            background-color: var(--vscode-button-background, #0E639C);
                            color: var(--vscode-button-foreground, #ffffff);
                            border: none;
                            padding: 4px 12px;
                            border-radius: 2px;
                            cursor: pointer;
                            font-size: 12px;
                            min-width: 80px;  /* Set minimum width for all buttons */
                            text-align: center;
                            flex: 1;         /* Make all buttons take equal space */
                            max-width: 100px; /* Set maximum width to prevent too wide buttons */
                        }

                        .button:hover {
                            background-color: var(--vscode-button-hoverBackground, #1177bb);
                        }

                        .button:disabled {
                            opacity: 0.5;
                            cursor: not-allowed;
                        }

                        /* Keep the action buttons (+ - ×) styling separate */
                        .action-button {
                            padding: 2px 4px;
                            background: transparent;
                            border: none;
                            color: var(--vscode-foreground);
                            cursor: pointer;
                            font-size: 12px;
                            opacity: 0.8;
                        }

                        .action-button:hover {
                            opacity: 1;
                            background: var(--vscode-button-background);
                        }

                        .commit-area {
                            margin: 8px;
                        }

                        #commitMessage {
                            width: calc(100% - 16px);  /* Full width minus margins */
                            padding: 4px 8px;
                            margin-bottom: 8px;
                            background: var(--vscode-input-background);
                            color: var(--vscode-input-foreground);
                            border: 1px solid var(--vscode-input-border);
                            border-radius: 2px;
                            font-family: inherit;
                            font-size: 12px;
                            resize: vertical;
                            min-height: 24px;
                        }

                        .button-container {
                            display: flex;
                            gap: 8px;
                            margin: 8px;
                            justify-content: space-between;
                        }

                        .header-icon-fixed {
                            width: 24px;          /* Set explicit width */
                            height: 24px;         /* Set explicit height */
                            margin-right: 8px;    /* Space between icon and text */
                            vertical-align: middle; /* Align with text */
                        }

                        /* Or if you want to make it responsive */
                        .header-icon {
                            width: 1.5em;         /* Relative to font size */
                            height: 1.5em;
                            margin-right: 0.5em;
                        }

                        /* If you need to preserve aspect ratio */
                        .header-icon-adaptive {
                            width: 24px;
                            height: auto;         /* Maintain aspect ratio */
                            max-height: 24px;     /* Prevent too tall */
                        }

                        .header-controls {
                            display: flex;
                            gap: 4px;
                            align-items: center;
                            padding: 2px 0;
                        }

                        .dropdown-container {
                            display: flex;
                            gap: 8px;
                            align-items: center;
                            flex: 1;  /* Take up available space */
                        }

                        .select-control {
                            background: var(--vscode-dropdown-background);
                            color: var(--vscode-dropdown-foreground);
                            border: 1px solid var(--vscode-dropdown-border);
                            padding: 2px 4px;
                            border-radius: 2px;
                            font-size: 12px;
                            min-width: 60px;
                        }

                        /* Add styles for unselected branch state */
                        .select-control.no-branch-selected {
                            border-color: var(--vscode-inputValidation-errorBorder);
                            background-color: var(--vscode-inputValidation-errorBackground);
                        }

                        .select-control:hover {
                            cursor: pointer;
                        }

                        .modal-overlay {
                            display: none;
                            position: fixed;
                            top: 0;
                            left: 0;
                            right: 0;
                            bottom: 0;
                            background-color: rgba(0, 0, 0, 0.5);
                            z-index: 1000;
                        }

                        .modal {
                            position: fixed;
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%);
                            background-color: var(--vscode-editor-background);
                            padding: 16px;
                            border-radius: 4px;
                            border: 1px solid var(--vscode-widget-border);
                            min-width: 300px;
                            z-index: 1001;
                        }

                        .modal-content {
                            margin-bottom: 16px;
                            color: var(--vscode-foreground);
                        }

                        .modal-buttons {
                            display: flex;
                            justify-content: flex-end;
                            gap: 8px;
                        }

                        .modal-button {
                            padding: 4px 12px;
                            border-radius: 2px;
                            border: none;
                            cursor: pointer;
                        }

                        .modal-button-primary {
                            background-color: var(--vscode-button-background);
                            color: var(--vscode-button-foreground);
                        }

                        .modal-button-secondary {
                            background-color: var(--vscode-button-secondaryBackground);
                            color: var(--vscode-button-secondaryForeground);
                        }

                        .file-icon {
                            width: 16px;
                            height: 16px;
                        }

                        .codicon {
                            font-family: codicon;
                            font-size: 16px;
                            line-height: 16px;
                        }

                        .action-button.has-updates {
                            color: var(--vscode-gitDecoration-untrackedResourceForeground);
                            font-weight: bold;
                        }

                        /* Make sure nested subcommands follow the same style */
                        .subcommands .tree-item {
                            margin-left: 0;  /* Reset margin for nested items */
                        }

                        .subcommands .subcommands {
                            margin-left: 20px;  /* Consistent indentation for all levels */
                        }

                        .view-toggle-button {
                            background: none;
                            border: none;
                            cursor: pointer;
                            padding: 4px 8px;
                            color: var(--vscode-titleBar-activeForeground);
                            opacity: 0.7;
                        }
                        
                        .view-toggle-button:hover {
                            opacity: 1;
                        }

                        .view-toggle-button.active {
                            opacity: 1;
                            background-color: var(--vscode-titleBar-activeBackground);
                        }

                        /* Styles for TODO tree view */
                        .todo-tree {
                            margin-top: 10px;
                            padding: 5px;
                        }

                        .todo-item {
                            display: flex;
                            align-items: center;
                            padding: 3px;
                            margin: 2px 0;
                        }

                        .todo-tree.list-view .todo-item {
                            margin-left: 0 !important;
                        }

                        .todo-tree.tree-view .todo-item {
                            margin-left: 20px;
                        }

                        .header-status {
                            display: flex;
                            align-items: center;
                            gap: 8px;
                        }

                        .tasks-status {
                            font-size: 0.9em;
                            opacity: 0.8;
                            color: var(--vscode-descriptionForeground);
                        }

                        .tasks-status.has-running {
                            color: var(--vscode-progressBar-background);
                        }

                        .tasks-status.has-error {
                            color: var(--vscode-errorForeground);
                        }

                        .file-tree.hidden {
                            display: none !important;
                        }
                    </style>
                </head>
                <body>
                    <div class="title-bar">
                        <button id="viewToggleButton" class="view-toggle-button" onclick="toggleViewMode()" title="Toggle Tree/List View">
                            🌳
                        </button>
                        <div class="dropdown-container">
                            <select id="repoSelect" display='none' class="select-control" title="Select Repository">
                                <!-- Repositories will be populated here -->
                            </select><span id="branchIcon" class="codicon codicon-git-branch"></span>
                            <select id="branchSelect" display='none' class="select-control" title="Select Branch">
                                <!-- Branches will be populated here -->
                            </select>
                        </div>
                    </div>

                    <!-- Changes section -->
                    <div id="changesHeader" class="section-header" onclick="toggleChanges()">
                        <div class="header-content">
                            <span>Changes</span>
                        </div>
                        <div class="file-actions">
                            <button class="action-button" onclick="viewAllChanges(false)" title="View All Changes">🔍</button>
                            <button class="action-button" onclick="stageAllFiles()" title="Stage All Changes">+</button>
                            <button class="action-button" onclick="discardAllFiles()" title="Discard All Changes">⨯</button>
                            <button class="toggle-subcommands">></button>
                        </div>
                    </div>
                    <div id="changesTree" class="file-tree">
                        <!-- Changed files will be populated here -->
                    </div>

                    <!-- Staged section -->
                    <div id="stagedHeader" class="section-header" onclick="toggleStaged()">
                        <div class="header-content">
                            <span>Staged Changes</span>
                        </div>
                        <div class="file-actions">
                            <button class="action-button" onclick="viewAllChanges(true)" title="View All Changes">🔍</button>
                            <button class="action-button" onclick="unstageAllFiles()" title="Unstage All Changes">-</button>
                            <button class="toggle-subcommands">></button>
                        </div>
                    </div>
                    <div id="stagedTree" class="file-tree">
                        <!-- Staged files will be populated here -->
                    </div>

                    <!-- Commit Area -->
                    <div class="commit-area" display="none">
                        <textarea id="commitMessage" placeholder="Enter commit message..." rows="1"></textarea>
                    </div>

                    <div id="statusMessage" display='none' class="status-message"></div>

                    <div class="section-header" id="projectTasksHeader" onclick="toggleProjectTasks()">
                        <div class="header-content">
                            <img id="headerIcon" class="header-icon" src="\${iconUri}" alt="Project Tasks"/>
                            <span id="projectNameSpan"></span>
                            <span> Project Tasks</span>
                        </div>
                        <div class="header-status">
                            <span id="tasksStatus" class="tasks-status"></span>
                            <button class="toggle-subcommands">></button>
                        </div>
                    </div>
                    <div id="smartTasksTreeView" class="tree-view">
                        <!-- Smart Tasks tree items will be populated here -->
                    </div>

                    <div id="confirmModal" display='none' class="modal-overlay">
                        <div class="modal">
                            <div id="modalContent" class="modal-content">
                                Are you sure you want to discard changes in this file?
                            </div>
                            <div class="modal-buttons">
                                <button class="modal-button modal-button-secondary" onclick="closeModal()">Cancel</button>
                                <button class="modal-button modal-button-primary" onclick="confirmModal()">Discard</button>
                            </div>
                        </div>
                    </div>

                    <div class="todo-tree tree-view" id="todoTreeView">
                        <div class="section-header">
                            <span>TODO Items</span>
                        </div>
                        <div id="todoItems">
                            <!-- TODO items will be inserted here -->
                        </div>
                    </div>

                    <!-- Merge Conflicts section -->
                    <div id="mergeHeader" class="section-header" onclick="toggleMerge()">
                        <div class="header-content">
                            <span>Merge Conflicts</span>
                        </div>
                        <div class="file-actions">
                            <button class="action-button" onclick="viewAllMergeConflicts()" title="View All Conflicts">🔍</button>
                            <button class="toggle-subcommands">></button>
                        </div>
                    </div>
                    <div id="mergeTree" class="file-tree">
                        <!-- Merge conflict files will be populated here -->
                    </div>

                    <script>
                        const vscode = acquireVsCodeApi();
                        function showError(message) {
                            const statusArea = document.getElementById('statusArea');
                            statusArea.textContent = message;
                            statusArea.className = 'error';
                            // Auto-hide after 5 seconds
                            setTimeout(() => {
                                statusArea.style.display = 'none';
                            }, 5000);
                        }

                        function showInfo(message) {
                            const statusArea = document.getElementById('statusArea');
                            statusArea.textContent = message;
                            statusArea.className = 'info';
                            // Auto-hide after 3 seconds
                            setTimeout(() => {
                                statusArea.style.display = 'none';
                            }, 3000);
                        }

                        function showMessage(message, type = 'info') {
                            const statusMessage = document.getElementById('statusMessage');
                            statusMessage.textContent = message;
                            statusMessage.className = 'status-message ' + type;
                            statusMessage.style.display = 'block';

                            // Auto-hide after a delay
                            setTimeout(() => {
                                statusMessage.style.display = 'none';
                            }, type === 'error' ? 5000 : 3000); // Show errors longer than info messages
                        }

                        let smartTaskTreeUpdated = false;

                        // Update the message handler
                        window.addEventListener('message', event => {
                            const message = event.data;
                            switch (message.type) {
                                case 'getCommitMessage':
                                    gitCommit();
                                    break;
                                case 'updateSmartTasksTree':
                                    smartTaskTreeUpdated = true;
                                    updateSmartTasksTreeView(message.projectName, message.iconUri, message.items);
                                    updateTasksStatus(message.status);
                                    break;
                                case 'gitChanges':
                                    updateGitChangesFileTree(message.changes);
                                    updateGitButtonStates(
                                        message.hasStagedChanges,
                                        message.hasUnstagedChanges,
                                        message.hasUnpushedCommits,
                                        message.hasUnpulledCommits
                                    );
                                    updateRepositoryAndBranchLists(
                                        message.repositories,
                                        message.branches,
                                        message.currentRepo,
                                        message.currentBranch
                                    );
                                    break;
                                case 'error':
                                    showMessage(message.message, 'error');
                                    break;
                                case 'info':
                                    showMessage(message.message, 'info');
                                    break;
                                case 'updateTodoTree':
                                    console.log(\`updateTodoTree, \${message.items}\`);
                                    updateTodoTree(message.items);
                                    break;
                            }
                        });

                        function gitPull() {
                            vscode.postMessage({ command: 'pull' });
                        }

                        function gitFetch() {
                            vscode.postMessage({ command: 'fetch' });
                        }

                        function updateGitButtonStates(hasStagedChanges, hasUnstagedChanges, hasUnpushedCommits) {
                            const commitMessage = document.getElementById('commitMessage');

                            if (commitMessage) {
                                commitMessage.disabled = !hasStagedChanges;
                            }
                        }

                        function getFileName(fullpath) {
                            return fullpath.split(/[\\\\/]/).pop();
                        }

                        function doubleEscape(str) {
                            return str.replace(/\\\\/g, '\\\\\\\\');
                        }

                        function updateGitChangesFileTree(changes) {
                            const changesTree = document.getElementById('changesTree');
                            const stagedTree = document.getElementById('stagedTree');
                            const mergeTree = document.getElementById('mergeTree');
                            const commitArea = document.querySelector('.commit-area');

                            // Remember the current toggle states
                            const changesHidden = changesTree.classList.contains('hidden');
                            const stagedHidden = stagedTree.classList.contains('hidden');
                            const mergeHidden = mergeTree.classList.contains('hidden');

                            // Separate changes into categories
                            const unstagedChanges = changes.filter(file => !file.staged && !file.conflicted);
                            const stagedChanges = changes.filter(file => file.staged && !file.conflicted);
                            const mergeConflicts = changes.filter(file => file.conflicted);

                            // Update Changes section
                            updateSection('changes', unstagedChanges, changesHidden);
                            
                            // Update Staged section
                            updateSection('staged', stagedChanges, stagedHidden);
                            
                            // Update Merge Conflicts section
                            updateSection('merge', mergeConflicts, mergeHidden);

                            // Show/hide commit area based on staged changes
                            if (commitArea) {
                                commitArea.style.display = stagedChanges.length > 0 ? 'block' : 'none';
                            }

                            // Populate the trees with files
                            populateFileTree(changesTree, unstagedChanges, false);
                            populateFileTree(stagedTree, stagedChanges, true);
                            populateFileTree(mergeTree, mergeConflicts, false, true);
                        }

                        function updateSection(type, files, isHidden) {
                            const header = document.getElementById(\`\${type}Header\`);
                            const tree = document.getElementById(\`\${type}Tree\`);
                            
                            if (header && tree) {
                                if (files.length > 0) {
                                    header.style.display = 'flex';
                                    tree.style.display = 'block';
                                    
                                    let actionButtons = '';
                                    switch(type) {
                                        case 'changes':
                                            actionButtons = \`
                                                <button class="action-button" onclick="viewAllChanges(false)" title="View All Changes">🔍</button>
                                                <button class="action-button" onclick="stageAllFiles()" title="Stage All Changes">+</button>
                                                <button class="action-button" onclick="discardAllFiles()" title="Discard All Changes">⨯</button>
                                            \`;
                                            break;
                                        case 'staged':
                                            actionButtons = \`
                                                <button class="action-button" onclick="viewAllChanges(true)" title="View All Changes">🔍</button>
                                                <button class="action-button" onclick="unstageAllFiles()" title="Unstage All Changes">-</button>
                                            \`;
                                            break;
                                        case 'merge':
                                            actionButtons = \`
                                                <button class="action-button" onclick="viewAllMergeConflicts()" title="View All Conflicts">🔍</button>
                                            \`;
                                            break;
                                    }

                                    const headerContent = \`
                                        <div class="header-content">
                                            <span>\${type === 'merge' ? 'Merge Conflicts' : type === 'staged' ? 'Staged Changes' : 'Changes'} (\${files.length})</span>
                                        </div>
                                        <div class="file-actions">
                                            \${actionButtons}
                                            <button class="toggle-subcommands">\${isHidden ? '>' : 'v'}</button>
                                        </div>
                                    \`;
                                    header.innerHTML = headerContent;
                                    
                                    // Restore hidden state if it was hidden
                                    if (isHidden) {
                                        tree.classList.add('hidden');
                                    } else {
                                        tree.classList.remove('hidden');
                                    }
                                } else {
                                    header.style.display = 'none';
                                    tree.style.display = 'none';
                                }
                            }
                        }

                        function populateFileTree(container, files, isStaged, isConflicted = false) {
                            if (!container) return;

                            const fileList = files.map(file => {
                                const actions = isConflicted ? \`
                                    <button class="action-button" onclick="viewFileChanges('\${file.path}', \${isStaged})" title="View Changes">🔍</button>
                                    <button class="action-button" onclick="openMergeEditor('\${file.path}')" title="Resolve Conflict">⚔️</button>
                                \` : isStaged ? \`
                                    <button class="action-button" onclick="viewFileChanges('\${file.path}', true)" title="View Changes">🔍</button>
                                    <button class="action-button" onclick="unstageFile('\${file.path}')" title="Unstage Changes">-</button>
                                \` : \`
                                    <button class="action-button" onclick="viewFileChanges('\${file.path}', false)" title="View Changes">🔍</button>
                                    <button class="action-button" onclick="stageFile('\${file.path}')" title="Stage Changes">+</button>
                                    <button class="action-button" onclick="discardFile('\${file.path}')" title="Discard Changes">⨯</button>
                                \`;

                                return \`
                                    <div class="file-item">
                                        <span class="file-name" title="\${file.path}">\${getFileName(file.path)}</span>
                                        <div class="file-actions">
                                            \${actions}
                                            <span class="git-status \${file.status}" title="\${file.statusIcon.label}">\${file.statusIcon.icon}</span>
                                        </div>
                                    </div>
                                \`;
                            }).join('');

                            container.innerHTML = fileList;
                        }

                        // Move the interval setup outside of any function
                        // and make sure it runs when the page loads
                        (function setupAutoRefresh() {
                            let intervalID;

                            function startInterval(delay) {
                                if (intervalID) {
                                    console.log(\`Clear interval \${intervalID}\`);
                                    clearInterval(intervalID);
                                }

                                console.log(\`Setting up auto-refresh interval \${delay}ms\`);
                                intervalID = setInterval(() => {
                                    // if smartTaskTreeView updated and git branch init OK, reduce interval to 60s
                                    const branchSelect = document.getElementById('branchSelect');
                                    if (smartTaskTreeUpdated && branchSelect && branchSelect.style.display != 'none') {
                                        startInterval(60000);
                                    }

                                    console.log('Auto-refresh: Getting changes');
                                    vscode.postMessage({ command: 'getChanges' });
                                }, delay);
                            }

                            startInterval(1000);
                        })();

                        function gitStage() {
                            const checkedFiles = Array.from(document.querySelectorAll('.file-item input[type="checkbox"]:checked:not([disabled])'))
                                .map(cb => cb.getAttribute('data-file'));
                            if (checkedFiles.length > 0) {
                                vscode.postMessage({
                                    command: 'stage',
                                    files: checkedFiles
                                });
                            }
                        }

                        function gitCommit() {
                            const message = document.getElementById('commitMessage').value;
                            if (message.trim()) {
                                vscode.postMessage({
                                    command: 'commit',
                                    message: message
                                });
                                document.getElementById('commitMessage').value = ''; // Clear message after commit
                            } else {
                                showError('Please enter a commit message');
                            }
                        }

                        function gitPush() {
                            vscode.postMessage({
                                command: 'push',
                                message: ''
                            });
                        }

                        function getGitChanges() {
                            vscode.postMessage({ command: 'getChanges' });
                        }

                        function toggleSubmenu(element) {
                            const childrenContainer = element.querySelector('.tree-children');
                            if (childrenContainer) {
                                childrenContainer.style.display = childrenContainer.style.display === 'none' ? 'block' : 'none';
                            }
                        }

                        // Update rendering logic to attach toggle:
                        function renderTreeItems(items) {
                            if (!items || !Array.isArray(items)) return '';

                            return items.map(function(item) {
                                const hasChildren = item.children && item.children.length > 0;
                                const childrenHtml = hasChildren
                                    ? \`<div class="tree-children">\${renderTreeItems(item.children)}</div>\`
                                    : '';

                                return \`
                                    <div class="tree-item" data-id="\${item.shellCmd}" onclick="\${hasChildren ? 'toggleSubmenu(this)' : 'selectSmartTasksTreeItem(this)'}">
                                        <span class="codicon \${item.icon}"></span>
                                        <span class="tree-item-label">\${item.command}</span>
                                        \${childrenHtml}
                                    </div>
                                \`;
                            }).join('');
                        }

                        // Helper function to recursively render menu items
                        function renderMenuItem(item) {
                            const hasSubcommands = item.subcommands && item.subcommands.length > 0;
                            const hasContent = hasSubcommands || item.shellCmd; // Check if it has subcommands or a command
                            const encodedCmd = encodeShellCmd(item.shellCmd || item.command); // Use command as fallback for root
                            return \`
                                <div class="tree-item" data-id="\${encodedCmd}" \${item.shellCmd ? \`onclick="executeTreeItemCommand(event, '\${encodedCmd}')"\` : ''}>
                                    \${hasSubcommands ? 
                                        \`<button class="toggle-subcommands" onclick="toggleSubcommands(event, '\${encodedCmd}')">></button>\` : 
                                        '<span style="width: 16px;"></span>'}
                                    \${item.shellCmd ? \`<span class="codicon \${item.icon}"></span>\` : ''}
                                    <span class="tree-item-label">\${item.command}</span>
                                    \${hasSubcommands ? \`
                                        <div class="subcommands" id="subcommands-\${encodedCmd}">
                                            \${item.subcommands.map(sub => renderMenuItem(sub)).join('')}
                                        </div>
                                    \` : ''}
                                </div>
                            \`;
                        }

                        function updateSmartTasksTreeView(projectName, projectIconUri, items) {
                            const projectNameSpan = document.getElementById('projectNameSpan');
                            if (projectNameSpan) {
                                projectNameSpan.innerHTML = projectName;
                            }

                            if (projectIconUri) {
                                const headerIcon = document.getElementById('headerIcon');
                                if (headerIcon) {
                                    headerIcon.src = projectIconUri;
                                }
                            }

                            const treeView = document.getElementById('smartTasksTreeView');
                            if (!items || !Array.isArray(items)) {
                                treeView.innerHTML = '';
                                return;
                            }

                            // Use the recursive helper function to render all items
                            const itemsHtml = items.map(item => renderMenuItem(item)).join('');
                            treeView.innerHTML = itemsHtml;
                        }

                        function toggleSubcommands(event, encodedCmd) {
                            event.stopPropagation(); // Prevent the click from bubbling up
                            const button = event.target;
                            const parentItem = button.closest('.tree-item');
                            const subcommandsContainer = parentItem.querySelector('.subcommands');
                            
                            if (subcommandsContainer) {
                                const isHidden = subcommandsContainer.classList.toggle('hidden');
                                button.textContent = isHidden ? '>' : 'v';
                            }
                        }

                        function executeTreeItemCommand(event, encodedCmd) {
                            event.stopPropagation();
                            vscode.postMessage({
                                command: 'smartTasksTreeItemSelected',
                                shellCmd: encodedCmd
                            });
                        }

                        function selectSmartTasksTreeItem(element) {
                            //console.log('selectSmartTasksTreeItem', element);
                            document.querySelectorAll('.tree-item.selected').forEach(item => {
                                item.classList.remove('selected');
                            });

                            element.classList.add('selected');

                            vscode.postMessage({
                                command: 'smartTasksTreeItemSelected',
                                shellCmd: element.dataset.id
                            });
                        }

                        function stageFile(filePath) {
                            vscode.postMessage({
                                command: 'stage',
                                files: [filePath]
                            });
                        }

                        function unstageFile(filePath) {
                            vscode.postMessage({
                                command: 'unstage',
                                files: [filePath]
                            });
                        }

                        function discardFile(filePath) {
                            showModal(
                                () => {
                                    vscode.postMessage({
                                        command: 'discard',
                                        files: [filePath]
                                    });
                                },
                                'Are you sure you want to discard changes in this file?'
                            );
                        }

                        function updateRepositoryAndBranchLists(repositories, branches, currentRepo, currentBranch) {
                            const repoSelect = document.getElementById('repoSelect');
                            const branchSelect = document.getElementById('branchSelect');

                            // Update repository list
                            if (repoSelect) {
                                repoSelect.innerHTML = repositories.map(repo => 
                                    '<option value="' + repo.path + '" title="' + repo.path + ' -> ' + (repo.originUri || 'None') + '" ' + 
                                    (repo.path === currentRepo ? 'selected' : '') + '>' +
                                    repo.name +
                                    '</option>'
                                ).join('');
                            }

                            // Update branch list
                            if (branchSelect) {
                                // First check if current branch exists in the list
                                const branchExists = branches.some(branch => branch.name === currentBranch);
                                
                                branchSelect.innerHTML = '<option value="" disabled ' + (!branchExists ? 'selected' : '') + '>Select Branch</option>' +
                                    branches.map(branch => 
                                        '<option value="' + branch.name + '" ' + 
                                        (branch.name === currentBranch && branchExists ? 'selected' : '') + '>' +
                                        branch.name +
                                        '</option>'
                                    ).join('');

                                // Add or remove the no-branch-selected class based on selection
                                if (!branchExists) {
                                    branchSelect.classList.add('no-branch-selected');
                                } else {
                                    branchSelect.classList.remove('no-branch-selected');
                                }
                            }
                        }

                        // Add repository and branch change handlers
                        document.getElementById('repoSelect')?.addEventListener('change', function(e) {
                            vscode.postMessage({
                                command: 'switchRepository',
                                path: e.target.value
                            });
                        });

                        document.getElementById('branchSelect')?.addEventListener('change', function(e) {
                            vscode.postMessage({
                                command: 'switchBranch',
                                branch: e.target.value
                            });
                        });

                        let pendingAction = null;

                        function showModal(action, message) {
                            pendingAction = action;
                            document.getElementById('modalContent').textContent = message;
                            document.getElementById('confirmModal').style.display = 'block';
                        }

                        function closeModal() {
                            pendingAction = null;
                            document.getElementById('confirmModal').style.display = 'none';
                        }

                        function confirmModal() {
                            if (pendingAction) {
                                pendingAction();
                            }
                            closeModal();
                        }

                        function stageAllFiles() {
                            const changesTree = document.getElementById('changesTree');
                            if (changesTree) {
                                const fileItems = Array.from(changesTree.querySelectorAll('.file-item'));
                                const files = fileItems
                                    .map(item => item.querySelector('.file-name')?.getAttribute('title'))
                                    .filter(path => path); // Filter out any undefined/null values
                                
                                if (files.length > 0) {
                                    vscode.postMessage({
                                        command: 'stage',
                                        files: files
                                    });
                                }
                            }
                        }

                        function unstageAllFiles() {
                            const stagedTree = document.getElementById('stagedTree');
                            if (stagedTree) {
                                const fileItems = Array.from(stagedTree.querySelectorAll('.file-item'));
                                const files = fileItems
                                    .map(item => item.querySelector('.file-name')?.getAttribute('title'))
                                    .filter(path => path); // Filter out any undefined/null values
                                
                                if (files.length > 0) {
                                    vscode.postMessage({
                                        command: 'unstage',
                                        files: files
                                    });
                                }
                            }
                        }

                        function discardAllFiles() {
                            const unstagedFiles = Array.from(document.querySelectorAll('#changesTree .file-item'))
                                .map(item => item.getAttribute('data-file'));
                            if (unstagedFiles.length > 0) {
                                showModal(
                                    () => vscode.postMessage({
                                        command: 'discard',
                                        files: unstagedFiles
                                    }),
                                    'Are you sure you want to discard changes in all files?'
                                );
                            }
                        }

                        function viewAllChanges(isStaged) {
                            const files = Array.from(document.querySelectorAll(isStaged ? '#stagedTree .file-item' : '#changesTree .file-item'))
                                .map(item => item.getAttribute('data-file'));

                            vscode.postMessage({
                                command: 'viewAllChanges',
                                files: files,
                                isStaged: isStaged
                            });
                        }

                        function viewFileChanges(filePath, isStaged) {
                            vscode.postMessage({
                                command: 'viewFileChanges',
                                filePath: filePath,
                                isStaged: isStaged
                            });
                        }

                        // Custom encode function to handle quotes
                        function encodeShellCmd(cmd) {
                            return cmd
                                .replace(/'/g, '%27')  // Single quotes
                                .replace(/"/g, '%22')  // Double quotes
                                .replace(/\\\\/g, '%5C'); // Backslashes
                        }

                        let isTreeView = true;
                        function toggleViewMode() {
                            isTreeView = !isTreeView;
                            const todoTree = document.getElementById('todoTreeView');
                            const button = document.getElementById('viewToggleButton');
                            
                            if (isTreeView) {
                                todoTree.classList.remove('list-view');
                                todoTree.classList.add('tree-view');
                                button.textContent = '🌳';
                            } else {
                                todoTree.classList.remove('tree-view');
                                todoTree.classList.add('list-view');
                                button.textContent = '📝';
                            }
                            
                            // Refresh the current view
                            updateTodoTree(currentTodoItems);
                        }

                        let currentTodoItems = [];
                        function updateTodoTree(items) {
                            currentTodoItems = items;
                            const todoItems = document.getElementById('todoItems');
                            
                            if (isTreeView) {
                                // Render as tree
                                todoItems.innerHTML = renderTodoTree(items);
                            } else {
                                // Render as list
                                todoItems.innerHTML = renderTodoList(items);
                            }
                        }

                        function openTodoFile(filePath, line) {
                            // Send a message to the extension to open the file at the specified line
                            vscode.postMessage({
                                command: 'openFile',
                                filePath: filePath,
                                line: line
                            });
                        }
                            
                        function renderTodoTree(items, level = 0) {
                            return items.map(item => \`
                                <div class="todo-item" style="margin-left: \${level * 20}px">
                                    <span class="todo-icon">📌</span>
                                    <span class="todo-text" title="\${item.file}:\${item.line}">\${item.text}</span>
                                    <button onclick="openTodoFile('\${item.file}', \${item.line})">Open</button>
                                    \${item.children ? renderTodoTree(item.children, level + 1) : ''}
                                </div>
                            \`).join('');
                        }

                        function renderTodoList(items) {
                            return items.map(item => \`
                                <div class="todo-item">
                                    <span class="todo-icon" title="\${item.file}:\${item.line}">📌</span>
                                    <span class="todo-text">\${item.text}</span>
                                    <button onclick="openTodoFile('\${item.file}', \${item.line})">Open</button>
                                </div>
                            \`).join('');
                        }

                        function updateTasksStatus(status) {
                            const statusElement = document.getElementById('tasksStatus');
                            if (statusElement) {
                                let statusText = \`\${status.total} tasks\`;
                                let statusClass = '';
                                
                                if (status.running > 0) {
                                    statusText += \` (\${status.running} running)\`;
                                    statusClass = 'has-running';
                                }
                                if (status.failed > 0) {
                                    statusText += \` (\${status.failed} failed)\`;
                                    statusClass = 'has-error';
                                }
                                
                                statusElement.textContent = statusText;
                                statusElement.className = \`tasks-status \${statusClass}\`;
                            }
                        }

                        function toggleProjectTasks() {
                            const treeView = document.getElementById('smartTasksTreeView');
                            const header = document.getElementById('projectTasksHeader');
                            const toggleButton = header.querySelector('.toggle-subcommands');
                            const isHidden = treeView.classList.toggle('hidden');
                            toggleButton.textContent = isHidden ? '>' : 'v';
                        }

                        function toggleChanges(event) {
                            if (event) {
                                event.stopPropagation();
                            }
                            const treeView = document.getElementById('changesTree');
                            const header = document.getElementById('changesHeader');
                            const toggleButton = header.querySelector('.toggle-subcommands');
                            const isHidden = treeView.classList.toggle('hidden');
                            toggleButton.textContent = isHidden ? '>' : 'v';
                        }

                        function toggleStaged(event) {
                            if (event) {
                                event.stopPropagation();
                            }
                            const treeView = document.getElementById('stagedTree');
                            const header = document.getElementById('stagedHeader');
                            const toggleButton = header.querySelector('.toggle-subcommands');
                            const isHidden = treeView.classList.toggle('hidden');
                            toggleButton.textContent = isHidden ? '>' : 'v';
                        }

                        function toggleMerge(event) {
                            if (event) {
                                event.stopPropagation();
                            }
                            const treeView = document.getElementById('mergeTree');
                            const header = document.getElementById('mergeHeader');
                            const toggleButton = header.querySelector('.toggle-subcommands');
                            const isHidden = treeView.classList.toggle('hidden');
                            toggleButton.textContent = isHidden ? '>' : 'v';
                        }

                        function viewAllMergeConflicts() {
                            const mergeTree = document.getElementById('mergeTree');
                            const files = Array.from(mergeTree.querySelectorAll('.file-item'))
                                .map(item => item.querySelector('.file-name').textContent);
                            
                            vscode.postMessage({
                                command: 'viewAllChanges',
                                files: files,
                                isConflicted: true
                            });
                        }

                        function openMergeEditor(filePath) {
                            vscode.postMessage({
                                command: 'openMergeEditor',
                                file: filePath
                            });
                        }
                        console.log(\`Script loaded\`);
                    </script>
                </body>
            </html>
        `;
    }

    // Git command implementations
    private async getCurrentRepository(webview: vscode.Webview): Promise<any | undefined> {
        const git = await this.getGitAPI(webview);
        if (!git) {
            return undefined;
        }

        const currentRepoPath = await this.getCurrentRepositoryPath();
        const repoIndex = git.repositories.findIndex((r: any) => r.rootUri.path === currentRepoPath);

        // If there's no tasks detected, try to detect git path
        if (currentRepoPath && currentRepoPath !== '') {
            if (mbTaskExt.smartCommandEntries.length === 0) {
                mbTaskExt.asyncRefereshSmartTasksDataProvider(currentRepoPath).catch((error) => {
                    console.error(`[${logTimeStamp()}] Error:`, error);
                });
            }
        }

        return git.repositories[repoIndex !== -1 ? repoIndex : 0];
    }

    public async gitPull(webview: vscode.Webview) {
        const repo = await this.getCurrentRepository(webview);
        if (repo) {
            try {
                await repo.pull();
                webview.postMessage({
                    type: 'info',
                    message: 'Pull successful'
                });
            } catch (error: any) {
                webview.postMessage({
                    type: 'error',
                    message: 'Pull failed: ' + (error.message || 'Unknown error')
                });
            }
        } else {
            webview.postMessage({
                type: 'error',
                message: 'No Git repository found'
            });
        }
    }

    public async gitFetch(webview: vscode.Webview) {
        const repo = await this.getCurrentRepository(webview);
        if (repo) {
            try {
                await repo.fetch();
                webview.postMessage({
                    type: 'info',
                    message: 'Fetch successful'
                });
            } catch (error: any) {
                webview.postMessage({
                    type: 'error',
                    message: 'Fetch failed: ' + (error.message || 'Unknown error')
                });
            }
        } else {
            webview.postMessage({
                type: 'error',
                message: 'No Git repository found'
            });
        }
    }

    private async gitStage(files: string[], webview: vscode.Webview) {
        const repo = await this.getCurrentRepository(webview);
        if (repo) {
            try {
                await repo.add(files);
                webview.postMessage({
                    type: 'info',
                    message: 'Files staged successfully'
                });
                await this.getGitChanges(webview); // Refresh status
            } catch (error: any) {
                webview.postMessage({
                    type: 'error',
                    message: 'Failed to stage files: ' + files[0] + ' ' + (error.message || 'Unknown error')
                });
            }
        } else {
            webview.postMessage({
                type: 'error',
                message: 'No Git repository found'
            });
        }
    }

    private async gitUnstage(files: string[], webview: vscode.Webview) {
        const repo = await this.getCurrentRepository(webview);
        if (repo) {
            try {
                await repo.revert(files);
                webview.postMessage({
                    type: 'info',
                    message: 'Changes unstaged successfully'
                });
                await this.getGitChanges(webview); // Refresh status
            } catch (error: any) {
                webview.postMessage({
                    type: 'error',
                    message: 'Failed to unstage changes: ' + (error.message || 'Unknown error')
                });
            }
        } else {
            webview.postMessage({
                type: 'error',
                message: 'No Git repository found'
            });
        }
    }

    private async gitDiscard(files: string[], webview: vscode.Webview) {
        const repo = await this.getCurrentRepository(webview);
        if (repo) {
            try {
                await repo.clean(files);
                webview.postMessage({
                    type: 'info',
                    message: 'Changes discarded successfully'
                });
                await this.getGitChanges(webview); // Refresh status
            } catch (error: any) {
                webview.postMessage({
                    type: 'error',
                    message: 'Failed to discard changes: ' + (error.message || 'Unknown error')
                });
            }
        } else {
            webview.postMessage({
                type: 'error',
                message: 'No Git repository found'
            });
        }
    }

    public async gitCommit(message: string, webview: vscode.Webview) {
        const repo = await this.getCurrentRepository(webview);
        if (repo) {
            try {
                await repo.commit(message);
                webview.postMessage({
                    type: 'info',
                    message: 'Changes committed successfully'
                });
                await this.getGitChanges(webview); // Refresh status
            } catch (error: any) {
                webview.postMessage({
                    type: 'error',
                    message: 'Commit failed: ' + (error.message || 'Unknown error')
                });
            }
        } else {
            webview.postMessage({
                type: 'error',
                message: 'No Git repository found'
            });
        }
    }

    public async gitPush(webview: vscode.Webview) {
        const repo = await this.getCurrentRepository(webview);
        if (repo) {
            try {
                await repo.push();
                webview.postMessage({
                    type: 'info',
                    message: 'Push successful'
                });
                await this.getGitChanges(webview); // Refresh status
            } catch (error: any) {
                webview.postMessage({
                    type: 'error',
                    message: 'Push failed: ' + (error.message || 'Unknown error')
                });
            }
        } else {
            webview.postMessage({
                type: 'error',
                message: 'No Git repository found'
            });
        }
    }

    hasFetchable: boolean = false;
    private async asyncSafeDetectFetchableUpdates(webview: vscode.Webview): Promise<void> {
        try {
            const repository = await this.getCurrentRepository(webview);

            if (repository) {
                // Check remote refs to see if any updates are available
                const refs = await repository.getRefs();
                const remoteRefs = refs.filter((ref: any) => ref.remote);
                this.hasFetchable = remoteRefs.some((ref: any) => {
                    const localRef = refs.find((local: any) => local.name === ref.name.replace(/^origin\//, ''));
                    return !localRef || (ref.commit && ref.commit !== localRef.commit);
                });
            }
        } catch (error: any) {
            console.error(`[${logTimeStamp()}] Error in hasFetchableUpdates:`, error);
        }
    }

    public async getGitChanges(webview: vscode.Webview) {
        enum GitStatusCode {
            MinCode,

            IndexModified = 0,
            IndexAdded = 1,
            IndexDeleted = 2,
            IndexRenamed = 3,
            IndexCopied = 4,

            Modified = 5,
            Deleted = 6,
            Untracked = 7,
            Ignored,
            IntentToAdd,
            IntentToRename,

            TypeChanged,

            AddedByUs,
            AddedByThem,
            DeletedByUs,
            DeletedByThem,
            BothAdded,
            BothDeleted,
            BothModified,

            MaxCode
        }

        // Add status icon mapping
        const statusIconMap: { [key: string]: { icon: string, label: string } } = {
            'Modified': { icon: 'M', label: 'Modified' },
            'Added': { icon: 'A', label: 'Added' },
            'Deleted': { icon: 'D', label: 'Deleted' },
            'Renamed': { icon: 'R', label: 'Renamed' },
            'Copied': { icon: 'C', label: 'Copied' },
            'Untracked': { icon: 'U', label: 'Untracked' },
            'Ignored': { icon: 'I', label: 'Ignored' },
            'IndexModified': { icon: 'M', label: 'Modified' },
            'IndexAdded': { icon: 'A', label: 'Added' },
            'IndexDeleted': { icon: 'D', label: 'Deleted' },
            'IndexRenamed': { icon: 'R', label: 'Renamed' },
            'IndexCopied': { icon: 'C', label: 'Copied' },
            'Conflicting': { icon: '!', label: 'Conflicting' },
            'Conflict': { icon: '><', label: 'Conflict' },
            'BothModified': { icon: '!Mm', label: 'Both Modified' },
            'BothAdded': { icon: '!Aa', label: 'Both Added' },
            'BothDeleted': { icon: '!Dd', label: 'Both Deleted' },
            'AddedByUs': { icon: 'U+', label: 'Added by Us' },
            'DeletedByUs': { icon: 'U-', label: 'Deleted by Us' },
            'AddedByThem': { icon: 'T+', label: 'Added by Them' },
            'DeletedByThem': { icon: 'T-', label: 'Deleted by Them' }
        };

        try {
            const git = await this.getGitAPI(webview);
            if (!git?.repositories?.length) {
                webview.postMessage({
                    type: 'gitChanges',
                    changes: [],
                    repositories: [],
                    branches: [],
                    currentRepo: '',
                    currentBranch: '',
                    hasStagedChanges: false,
                    hasUnstagedChanges: false,
                    hasUnpushedCommits: false,
                    hasUnpulledCommits: false
                });
                return;
            }

            // Get all repositories
            const repositories = git.repositories.map((r: any) => ({
                name: r.rootUri.path.split('/').pop() || r.rootUri.path,
                path: mbTaskExt.convertGitPathForWindowsPath(r.rootUri.path)
            }));

            // Find the current repository based on the selected path
            const currentRepoPath = await this.getCurrentRepositoryPath();
            const repoIndex = git.repositories.findIndex((r: any) => r.rootUri.path === currentRepoPath);
            const repo = git.repositories[repoIndex !== -1 ? repoIndex : 0];
            const state = repo.state;

            this.asyncSafeDetectFetchableUpdates(webview).catch((error) => {
                console.error(`[${logTimeStamp()}] Error:`, error);
            });

            // Use getRefs() instead of accessing state.refs directly
            const refs = await repo.getRefs();
            //console.log(`[${logTimeStamp()}] Refs:`, refs); // Debug log

            const branches = await Promise.all(
                refs
                    .filter((ref: any) => {
                        // Include only local branches; exclude HEAD and remote branches
                        return ref.type === 0 && ref.name && ref.name !== 'HEAD' && !(ref.name.includes('/') || ref.remote);
                    })
                    .map(async (branch: any) => {
                        //console.log('branch:', branch); // Debug log
                        // Attempt to fetch upstream information
                        const branchName = branch.name ? branch.name : '';
                        let upstream = null;

                        try {
                            // Fetch branch details for upstream info
                            const branchDetails = await repo.getBranch(branchName);
                            //console.log('branch detail:', branchDetails); // Debug log
                            if (branchDetails.upstream) {
                                upstream = branchDetails.upstream.remote + '/' + branchDetails.upstream.name;
                            }
                        } catch (err) {
                            console.warn(`Failed to get upstream for branch ${branchName}:`, err);
                        }

                        //console.log(`banchName: ${branchName}, upstream: ${upstream} `); // Debug log

                        return {
                            name: branchName,
                            tooltip: upstream ? `-> ${upstream}` : 'No upstream branch',
                        };
                    })
            );

            //console.log('Processed branches:', branches); // Debug log
            function getStatusMessage(statusCode: any): string {
                if (typeof statusCode === 'number') {
                    if (GitStatusCode.MinCode <= statusCode && statusCode < GitStatusCode.MaxCode) {
                        return GitStatusCode[statusCode];
                    }
                }
                return `Invalid status: ${typeof statusCode} ${statusCode}`;
            }

            function getStatusIcon(status: string): { icon: string, label: string } {
                return statusIconMap[status]? statusIconMap[status]: { icon:"!", label:"Unknown"};
            }

            interface GitChange {
                uri: vscode.Uri;
                status: GitStatusCode;
                renameUri?: vscode.Uri;
                originalUri?: vscode.Uri;
            }

            interface workingChange {
                path: string,
                //originalUri: vscode.Uri,
                status: string,
                statusIcon: { icon: string, label: string },
                staged: boolean,
                conflicted: boolean
            }

            // Handle working tree changes
            const workingChanges: workingChange[] = state.workingTreeChanges
                .filter((change: GitChange) => change.status !== GitStatusCode.BothModified && 
                                              change.status !== GitStatusCode.BothAdded && 
                                              change.status !== GitStatusCode.BothDeleted)
                .map((change: GitChange) => ({
                    path: change.uri.fsPath,
                    status: getStatusMessage(change.status),
                    statusIcon: getStatusIcon(getStatusMessage(change.status)),
                    staged: false,
                    conflicted: false
                }));

            interface stageChange {
                path: string,
                rename: string,
                status: string,
                statusIcon: { icon: string, label: string },
                staged: boolean,
                conflicted: boolean
            }

            // Handle staged changes
            const stagedChanges: stageChange[] = state.indexChanges
                .filter((change: GitChange) => change.status !== GitStatusCode.BothModified && 
                                              change.status !== GitStatusCode.BothAdded && 
                                              change.status !== GitStatusCode.BothDeleted)
                .map((change: GitChange) => ({
                    path: change.uri.fsPath,
                    rename: change.renameUri ? 'from ' + path.basename(change.originalUri?.fsPath || '') : '',
                    status: getStatusMessage(change.status),
                    statusIcon: getStatusIcon(getStatusMessage(change.status)),
                    staged: true,
                    conflicted: false
                }));

            // Handle merge conflicts
            const mergeConflicts = state.mergeChanges?.map((change: { uri: vscode.Uri; status: GitStatusCode }) => ({
                path: change.uri.fsPath,
                status: 'Conflicting',
                statusIcon: getStatusIcon('Conflicting'),
                staged: false,
                conflicted: true
            })) || [];

            const hasUnpushedCommits = state.HEAD?.ahead ? state.HEAD.ahead > 0 : false;
            const hasUnpulledCommits = state.HEAD?.behind ? state.HEAD.behind > 0 : false;
            const allChanges = [...workingChanges, ...stagedChanges, ...mergeConflicts];

            // Get current branch from repository state
            const currentBranch = repo.state.HEAD?.name || '';

            // Update title bar buttons color
            this.updateTitleBarGitButtons(hasUnpushedCommits, hasUnpulledCommits, stagedChanges);

            // Setup file system watcher when repository is available
            this.watchFileSystemChangeForCurrentRepository(repo, webview);

            this.updateSmartTasksTreeView(webview);
            if (workingChanges.length > 0) {
                console.log(`[${logTimeStamp()}] workingChanges: `);
                workingChanges.forEach(workingChange => {
                    console.log(`:${workingChange.path} ${workingChange.status} ${statusIconMap[workingChange.status]}`);
                });
            }
            if (stagedChanges.length > 0) {
                console.log(`[${logTimeStamp()}] stagedChanges:`);
                stagedChanges.forEach(stagedChange => {
                    console.log(`:${stagedChange.path} ${stagedChange.status} ${statusIconMap[stagedChange.status]} ${stagedChange.rename}`);
                });
            }
            webview.postMessage({
                type: 'gitChanges',
                changes: allChanges,
                repositories: repositories,
                branches: branches,
                currentRepo: repo.rootUri.path,
                currentBranch: currentBranch,
                hasStagedChanges: stagedChanges.length > 0,
                hasUnstagedChanges: workingChanges.length > 0,
                hasMergeConflicts: mergeConflicts.length > 0,
                hasUnpushedCommits: hasUnpushedCommits,
                hasUnpulledCommits: hasUnpulledCommits
            });
        } catch (error: any) {
            console.error('Error in getGitChanges:', error);
            webview.postMessage({
                type: 'error',
                message: 'Failed to get Git changes: ' + (error.message || 'Unknown error')
            });
        }
    }

    // Update highlited state of title bar git buttons
    private updateTitleBarGitButtons(hasUnpushedCommits: boolean, hasUnpulledCommits: boolean, stagedChanges: any) {
        // Instead of trying to access webviewViews, just update the command contexts
        console.log(`[${logTimeStamp()}] Git: unpushed=${hasUnpushedCommits}, unpulled=${hasUnpulledCommits}, staged=${stagedChanges.length > 0}, unfetchable=${this.hasFetchable}`);

        vscode.commands.executeCommand('setContext', 'moonbit-tasks.hasUnpushedChanges', hasUnpushedCommits).then(() => { });
        //.catch((error: unknown) => { console.error(`[${logTimeStamp()}] Error:`, error); });
        vscode.commands.executeCommand('setContext', 'moonbit-tasks.hasUnpulledChanges', hasUnpulledCommits).then(() => { });
        //.catch((error: unknown) => { console.error(`[${logTimeStamp()}] Error:`, error); });
        vscode.commands.executeCommand('setContext', 'moonbit-tasks.hasStagedChanges', stagedChanges.length > 0).then(() => { });
        //.catch((error: unknown) => { console.error(`[${logTimeStamp()}] Error:`, error); });
        vscode.commands.executeCommand('setContext', 'moonbit-tasks.hasFetchable', this.hasFetchable).then(() => { });
        //.catch((error:unknown) => { console.error(`[${logTimeStamp()}] Error:`, error); });
    }

    private async getGitAPI(webview: vscode.Webview) {
        try {
            const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
            if (!extension) {
                webview.postMessage({
                    type: 'error',
                    message: 'Git extension not found'
                });
                return undefined;
            }

            const gitExtension = extension.isActive ? extension.exports : await extension.activate();
            const git = await gitExtension.getAPI(1);
            return git;
        } catch (error) {
            webview.postMessage({
                type: 'error',
                message: 'Failed to load Git extension'
            });
            return undefined;
        }
    }

    public updateSmartTasksTreeView(webview: vscode.Webview) {
        let treeItems;
        let projectName = '';
        let statusInfo = {
            total: 0,
            running: 0,
            failed: 0
        };

        function countTasks(items: Array<langDef.CommandItem> = mbTaskExt.smartCommandEntries): void {
            items.forEach(item => {
                statusInfo.total++;
                if (item.command === 'running') statusInfo.running++;
                if (item.command === 'error') statusInfo.failed++;
                if (item.subcommands) countTasks(item.subcommands);
            });
        }

        if (mbTaskExt.smartCommandEntries.length === 0) {
            treeItems = [];
        } else {
            projectName = path.basename(mbTaskExt.smartTasksDir);
            treeItems = langDefToTaskTreeItems();
            countTasks();
        }

        const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._extensionUri,
            'images',
            mbTaskExt.smartProjectIconUri.length > 0 ? mbTaskExt.smartProjectIconUri : 'file_type_rust_toolchain.svg'
        ));

        console.log(`[${logTimeStamp()}] Post message to webview ${projectName} ${iconUri} ${treeItems.length}`);
        
        if (!webview.postMessage({
            type: 'updateSmartTasksTree',
            projectName: projectName,
            iconUri: `${iconUri}`,
            items: treeItems,
            status: statusInfo
        })) {
            console.error(`[${logTimeStamp()}] post message to webview failed.`);
        }
    }

    hasChangesToDetect: boolean = false;
    private watchFileSystemChangeForCurrentRepository(repo: any, webview: vscode.Webview) {
        if (repo) {
            const watchedDir = mbTaskExt.convertGitPathForWindowsPath(repo.rootUri.path);
            if (watchedDir !== this.watchedDir) {
                // Dispose existing watcher if any
                this.fileSystemWatcher?.dispose();

                // Create new watcher for the repository root
                this.fileSystemWatcher = vscode.workspace.createFileSystemWatcher(
                    new vscode.RelativePattern(watchedDir, '**/*')
                );
                this.watchedDir = watchedDir;

                console.log(`[${logTimeStamp()}] create file system watcher for ${watchedDir}`);

                function setDelayDetect(tp: TasksWebviewProvider) {
                    if (!tp.hasChangesToDetect) {
                        tp.hasChangesToDetect = true;
                        setTimeout(() => {
                            tp.hasChangesToDetect = false;
                            console.log(`[${logTimeStamp()}] start get git changes`);
                            tp.getGitChanges(webview).catch((error) => {
                                console.error(`[${logTimeStamp()}] Error:`, error);
                            });
                        }, 500);
                    }
                }

                // Watch for all file system events
                this.fileSystemWatcher.onDidChange(() => {
                    console.log(`[${logTimeStamp()}] change in ${watchedDir} detect`);
                    setDelayDetect(this); // this.getGitChanges(webview);
                });
                this.fileSystemWatcher.onDidCreate(() => {
                    console.log(`[${logTimeStamp()}] create in ${watchedDir} detect`);
                    setDelayDetect(this); // this.getGitChanges(webview);
                });
                this.fileSystemWatcher.onDidDelete(() => {
                    console.log(`[${logTimeStamp()}] delete in ${watchedDir} detect`);
                    setDelayDetect(this); // this.getGitChanges(webview);
                });
            }
        }
    }

    // Make sure to dispose the watcher when the extension is deactivated
    public dispose() {
        this.fileSystemWatcher?.dispose();
    }

    private async scanTodoItems(): Promise<TodoItem[]> {
        const todos: TodoItem[] = [];
        
        // Get workspace files
        const files = await vscode.workspace.findFiles('**/*.{ts,js,rs,moon,nim,zig,go,swift,java,cpp,c,h,hpp}');
        
        for (const file of files) {
            const document = await vscode.workspace.openTextDocument(file);
            const text = document.getText();
            
            // Simple regex for TODO comments
            const todoRegex = /\/\/\s*TODO:?\s*(.+)$/gm;
            let match;
            
            while ((match = todoRegex.exec(text)) !== null) {
                todos.push({
                    text: match[1].trim(),
                    file: file.fsPath,
                    line: document.positionAt(match.index).line + 1
                });
            }
        }

        return this.organizeTodos(todos);
    }

    private organizeTodos(todos: TodoItem[]): TodoItem[] {
        // Group by file
        const fileGroups = new Map<string, TodoItem[]>();
        
        todos.forEach(todo => {
            const file = todo.file;
            if (!fileGroups.has(file)) {
                fileGroups.set(file, []);
            }
            fileGroups.get(file)?.push(todo);
        });

        // Convert to tree structure
        return Array.from(fileGroups.entries()).map(([file, items]) => ({
            text: path.basename(file),
            file: file,
            line: 0,
            children: items
        }));
    }

    public async updateTodoTree() {
        if (this._view) {
            const todos = await this.scanTodoItems();
            this._view.webview.postMessage({
                type: 'updateTodoTree',
                items: todos
            });
        }
    }

    // Update the existing refresh method to include TODO scanning
    public async refresh() {
        if (this._view?.webview) {
            await this.getGitChanges(this._view.webview);
            await this.updateTodoTree();
        }
    }
}

// Add custom decode function in TypeScript side
function decodeShellCmd(encodedCmd: string): string {
    return encodedCmd
        .replace(/%27/g, "'")  // Single quotes
        .replace(/%22/g, '"')  // Double quotes
        .replace(/%5C/g, '\\'); // Backslashes
}

interface TodoItem {
    text: string;
    file: string;
    line: number;
    children?: TodoItem[];
}

function langDefToTaskTreeItems(items: Array<langDef.CommandItem> = mbTaskExt.smartCommandEntries): any[] {
    return items.map(item => {
        let treeItem = {
            command: item.command,
            shellCmd: item.shellCmd || '',
            icon: item.command === 'running' ? 'codicon-sync~spin' : 
                  item.command === 'error' ? 'codicon-error' : 
                  getCommandIcon(item.command),
            subcommands: item.subcommands ? langDefToTaskTreeItems(item.subcommands) : undefined
        };
        return treeItem;
    });
}

function getCommandIcon(command: string): string {
    switch (command.toLowerCase()) {
        case 'build':
            return 'codicon-package';
        case 'run':
            return 'codicon-play';
        case 'test':
            return 'codicon-beaker';
        case 'clean':
            return 'codicon-trash';
        case 'debug':
            return 'codicon-debug';
        case 'install':
            return 'codicon-desktop-download';
        case 'update':
            return 'codicon-sync';
        case 'deploy':
            return 'codicon-rocket';
        case 'start':
            return 'codicon-play-circle';
        case 'stop':
            return 'codicon-stop-circle';
        case 'restart':
            return 'codicon-refresh';
        case 'lint':
            return 'codicon-checklist';
        case 'format':
            return 'codicon-symbol-color';
        case 'watch':
            return 'codicon-eye';
        case 'serve':
            return 'codicon-server';
        case 'generate':
            return 'codicon-file-code';
        case 'publish':
            return 'codicon-cloud-upload';
        default:
            return getTaskIcon(command);
            return 'codicon-terminal';
    }
}
