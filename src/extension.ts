// Suppress Buffer() deprecation warning from C# extension
process.removeAllListeners('warning');
process.on('warning', (warning) => {
    if (!warning.message.includes('Buffer() is deprecated')) {
        console.log(warning.stack);
    }
});

import * as mbTaskExt from './language_handler';
import * as smartTaskExt from './smart_tasks_panel_provider';

import * as vscode from 'vscode';
import * as child_process from 'child_process';

// Add this interface at the top of your file
interface GitExtension {
    getAPI(version: number): Promise<any>;
}

interface GitRepository {
    rootUri: { path: string };
    // ... other properties
}

interface GitRef {
    type: number;
    name: string;
    remote: boolean;
    upstream?: { name: string };
    // ... other properties
}

// Map task types to appropriate codicons
const taskIconMap: { [key: string]: string } = {
    'build': 'codicon-package',          // Package/box icon for build
    'test': 'codicon-beaker',            // Lab beaker for testing
    'check': 'codicon-checklist',        // Checklist for verification
    'run': 'codicon-play',               // Play button for run
    'package': 'codicon-archive',        // Archive/box for packaging
    'publish': 'codicon-cloud-upload',   // Cloud upload for publishing
    'coverage': 'codicon-shield',        // Shield for code coverage
    'gcov': 'codicon-graph',            // Graph for gcov
    'format': 'codicon-symbol-color',    // Color/format symbol
    'clean': 'codicon-trash',            // Trash can for clean
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
function getTaskIcon(taskName: string): string {
    // Convert task name to lowercase for case-insensitive matching
    const normalizedTask = taskName.toLowerCase();

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
        vscode.commands.registerCommand('moonbit-tasks.commit', async () => {
            if (gitTasksProvider._webview) {
                // Post a message to webview to get the commit message
                gitTasksProvider._webview.postMessage({ type: 'getCommitMessage' });
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('moonbit-tasks.push', async () => {
            if (gitTasksProvider._webview) {
                await gitTasksProvider.gitPush(gitTasksProvider._webview);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('moonbit-tasks.pull', async () => {
            if (gitTasksProvider._webview) {
                await gitTasksProvider.gitPull(gitTasksProvider._webview);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('moonbit-tasks.fetch', async () => {
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
        vscode.commands.registerCommand('moonbit-tasks.smartTasksTreeItemSelected', async (shellcmd: any, view: vscode.Webview) => {
            smartTaskExt.asyncSmartTaskRun(shellcmd, view);
        })
    );
}

class TasksWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'moonbit-tasks.gitView';
    public _webview?: vscode.Webview;  // Made public so command can access it
    private fileSystemWatcher: vscode.FileSystemWatcher | undefined;

    constructor(private readonly _extensionUri: vscode.Uri) {
        this.hasHidden = false;
        this.hasVisible = false;
    }

    hasVisible: boolean;
    hasHidden: boolean;

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
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
                        await this.gitCommit(data.message, webviewView.webview);
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
                    vscode.commands.executeCommand('moonbit-tasks.smartTasksTreeItemSelected', data.itemId, this);
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
                                // To do: track git root, refresh on change
                                if (mbTaskExt.smartCommandEntries.length == 0) {
                                    console.log("asyncRefresh " + data.path);
                                    mbTaskExt.asyncRefereshSmartTasksDataProvider(data.path);
                                }
                                this.getGitChanges(webviewView.webview);
                            } catch (error: any) {
                                webviewView.webview.postMessage({
                                    type: 'error',
                                    message: 'Failed to switch branch: ' + (error.message || 'Unknown error')
                                });
                            }
                        }
                    }
                    break;
                case 'viewAllChanges':
                    console.log(`Opening all diffs for staged: ${data.isStaged}`);
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

                            function toGitUri(uri: vscode.Uri, ref: string): vscode.Uri {
                                const params = {
                                    path: uri.fsPath,
                                    ref
                                };
                                return uri.with({
                                    scheme: 'git',
                                    query: JSON.stringify(params)
                                });
                            }

                            const multiDiffSourceUri = vscode.Uri.file(repo.rootUri.path).with({
                                scheme: 'git-changes'
                            });

                            console.log(`Opening multi diff editor for: ${multiDiffSourceUri}, ${resources}`);
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
                                    console.log(`Error while execute '_workbench.openMultiDiffEditor': ${error}`);
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
                    console.log(`Opening diff for: ${data.filePath}, staged: ${data.isStaged}`);
                    //const repo = await this.getCurrentRepository(webviewView.webview);
                    //if (repo) {
                    try {
                        const filePath = data.filePath;
                        const fileUri = vscode.Uri.file(filePath);

                        // For both staged and unstaged files
                        async function safeAsyncOpenChange() {
                            try {
                                await  vscode.commands.executeCommand('git.openChange', fileUri);
                            } catch (error) {
                                console.log(`Error while executeCommand 'git.openChange', ${error}`);
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
                                        console.log(`Error while executing vscode.commands 'workbench.action.compareEditor.switchToSecondary', ${error}`);
                                    }
                                }
                                safeAsyncSwitch();
                            }, 500);``
                        }
                    } catch (error: any) {
                        webviewView.webview.postMessage({
                            type: 'error',
                            message: 'Failed to view changes: ' + (error.message || 'Unknown error')
                        });
                    }
                    //}
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
            console.error('Failed to save current repository path:', error);
            this.currentRepositoryPath = data.path;
        }
    }

    private async getCurrentRepositoryPath() {
        let path: string | undefined = undefined;
        try {
            path = await vscode.workspace.getConfiguration().get('moonbit-tasks.currentRepository');
        } catch (error: any) {
            console.error('Failed to get current repository path:', error);
        }

        if (path === undefined) {
            path = this.currentRepositoryPath;
        }

        return path;
    }

    private getFileIcon(extension: string): vscode.ThemeIcon {
        // Map file extensions to ThemeIcon IDs
        const iconMap: { [key: string]: string } = {
            '.rs': 'rust',
            '.ts': 'typescript',
            '.js': 'javascript',
            '.py': 'python',
            '.go': 'go',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c': 'c',
            // Add more mappings as needed
        };

        const iconId = iconMap[extension] || 'file';
        return new vscode.ThemeIcon(iconId);
    }

    private _getHtmlContent(webview: vscode.Webview): string {
        // Get path to codicons.css
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._extensionUri,
            'node_modules',
            '@vscode/codicons',
            'dist',
            'codicon.css'
        ));

        return `
            <!DOCTYPE html>
            <html>
                <head>
                    <link href="${codiconsUri}" rel="stylesheet" />
                    <style>
                        /* General layout styles */
                        .panel-container {
                            display: flex;
                            flex-direction: column;
                            height: 100vh;
                            gap: 12px;
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
                            gap: 2px;
                        }

                        .section-header .file-actions {
                            display: flex;
                            gap: 2px;
                            visibility: hidden;
                        }

                        .section-header:hover .file-actions {
                            visibility: visible;
                        }

                        .file-tree {
                            margin: 0;
                            padding: 0;
                        }

                        .file-item {
                            display: flex;
                            align-items: center;
                            padding: 2px 6px;
                            position: relative;
                            cursor: default;
                            user-select: none;
                        }

                        .file-item:hover {
                            background: var(--vscode-list-hoverBackground);
                        }

                        .file-name {
                            flex-grow: 1;
                            overflow: hidden;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                        }

                        .file-actions {
                            display: none;
                            position: absolute;
                            right: 8px;
                            top: 50%;
                            transform: translateY(-50%);
                        }

                        .file-item:hover .file-actions {
                            display: flex;
                            gap: 4px;
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
                    </style>
                </head>
                <body>
                    <div class="panel-container">
                        <!-- Git Source Control Panel -->
                        <!-- div class="git-panel" -->
                            <div class="section-header">
                                <div class="header-controls">
                                    <div class="dropdown-container">
                                        <select id="repoSelect" class="select-control" title="Select Repository">
                                            <!-- Repositories will be populated here -->
                                        </select><span id="branchIcon" class="codicon codicon-git-branch"></span>
                                        <select id="branchSelect" class="select-control" title="Select Branch">
                                            <!-- Branches will be populated here -->
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <!-- Changes section -->
                            <div id="changesHeader" class="section-header">
                                <span>Changes</span>
                                <div class="file-actions">
                                    <button class="action-button" onclick="stageAllFiles()" title="Stage All Changes">+</button>
                                    <button class="action-button" onclick="discardAllFiles()" title="Discard All Changes">⨯</button>
                                </div>
                            </div>
                            <div id="changesTree" class="file-tree">
                                <!-- Changed files will be populated here -->
                            </div>

                            <!-- Staged section -->
                            <div id="stagedHeader" class="section-header">
                                <span>Staged Changes</span>
                                <div class="file-actions">
                                    <button class="action-button" onclick="unstageAllFiles()" title="Unstage All Changes">-</button>
                                </div>
                            </div>
                            <div id="stagedTree" class="file-tree">
                                <!-- Staged files will be populated here -->
                            </div>

                            <!-- Commit Area -->
                            <div class="commit-area">
                                <textarea id="commitMessage" placeholder="Enter commit message..." rows="1"></textarea>
                            </div>
                        <!-- /div -->

                        <div id="statusMessage" class="status-message"></div>

                        <!-- Project Smart Tasks Tree View Panel -->
                        <!-- div class="smart-tasks-panel" -->
                            <div class="section-header">
                                <span class="codicon codicon-tools"></span>
                                <span>Project Tasks</span>
                            </div>
                            <div id="smartTasksTreeView" class="tree-view">
                                <!-- Smart Tasks tree items will be populated here -->
                            </div>
                        <!-- /div -->
                    </div>

                    <div id="confirmModal" class="modal-overlay">
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

                        // Update the message handler
                        window.addEventListener('message', event => {
                            const message = event.data;
                            switch (message.type) {
                                case 'getCommitMessage':
                                    gitCommit();
                                    break;
                                case 'updateSmartTasksTree':
                                    updateSmartTasksTreeView(message.items);
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
                            const commitArea = document.querySelector('.commit-area');
                            
                            // Separate changes into staged and unstaged
                            const unstagedChanges = changes.filter(file => !file.staged);
                            const stagedChanges = changes.filter(file => file.staged);

                            // Handle Changes section visibility
                            const changesHeader = document.getElementById('changesHeader');
                            if (changesHeader) {
                                if (unstagedChanges.length > 0) {
                                    changesHeader.style.display = 'block';
                                    changesTree.style.display = 'block';
                                    changesHeader.innerHTML = \`
                                        <span>Changes (\${unstagedChanges.length})</span>
                                        <div class="file-actions">
                                            <button class="action-button" onclick="viewAllChanges(false)" title="View All Changes">🔍</button>
                                            <button class="action-button" onclick="stageAllFiles()" title="Stage All Changes">+</button>
                                            <button class="action-button" onclick="discardAllFiles()" title="Discard All Changes">⨯</button>
                                        </div>
                                    \`;
                                } else {
                                    changesHeader.style.display = 'none';
                                    changesTree.style.display = 'none';
                                }
                            }

                            // Handle Staged section visibility
                            const stagedHeader = document.getElementById('stagedHeader');
                            if (stagedHeader) {
                                if (stagedChanges.length > 0) {
                                    stagedHeader.style.display = 'block';
                                    stagedTree.style.display = 'block';
                                    commitArea.style.display = 'block';
                                    stagedHeader.innerHTML = \`
                                        <span>Staged Changes (\${stagedChanges.length})</span>
                                        <div class="file-actions">
                                            <button class="action-button" onclick="viewAllChanges(true)" title="View All Changes">🔍</button>
                                            <button class="action-button" onclick="unstageAllFiles()" title="Unstage All Changes">-</button>
                                        </div>
                                    \`;
                                } else {
                                    stagedHeader.style.display = 'none';
                                    stagedTree.style.display = 'none';
                                    commitArea.style.display = 'none';
                                }
                            }
                                
                            // Render unstaged changes
                            changesTree.innerHTML = unstagedChanges.map(file => {
                                const fileName = getFileName(file.path);
                                return \`
                                    <div class="file-item" data-file="\${file.path}" onclick="viewFileChanges('\${doubleEscape(file.path)}', false)">
                                        <span class="file-name">\${fileName}</span>
                                        <div class="tooltip">\${file.path}</div>
                                        <div class="file-actions">
                                            <button class="action-button" onclick="viewFileChanges('\${doubleEscape(file.path)}', false)" title="View Changes">🔍</button>
                                            <button class="action-button" onclick="stageFile('\${doubleEscape(file.path)}')" title="Stage Changes">+</button>
                                            <button class="action-button" onclick="discardFile('\${doubleEscape(file.path)}')" title="Discard Changes">⨯</button>
                                        </div>
                                    </div>
                                \`;
                            }).join('');

                            // Render staged changes
                            stagedTree.innerHTML = stagedChanges.map(file => {
                                const fileName = getFileName(file.path);
                                return \`
                                    <div class="file-item" data-file="\${file.path}" onclick="viewFileChanges('\${doubleEscape(file.path)}', true)">
                                        <span class="file-name">\${fileName}</span>
                                        <div class="tooltip">\${file.path}</div>
                                        <div class="file-actions">
                                            <button class="action-button" onclick="viewFileChanges('\${doubleEscape(file.path)}', true)" title="View Changes">🔍</button>
                                            <button class="action-button" onclick="unstageFile('\${doubleEscape(file.path)}')" title="Unstage Changes">-</button>
                                        </div>
                                    </div>
                                \`;
                            }).join('');
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
                                    // if git branch init OK, reduce interval to 60s
                                    const branchSelect = document.getElementById('branchSelect');
                                    if (branchSelect && branchSelect.style.display != 'none') {
                                        startInterval(60000);
                                    }

                                    console.log('Auto-refresh: Getting changes');
                                    vscode.postMessage({ command: 'getChanges' });
                                }, delay);
                            }
                            
                            startInterval(1000);
                        })();

                        // Initialize by getting changes
                        vscode.postMessage({ command: 'getChanges' });

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

                        function updateSmartTasksTreeView(items) {
                            const treeView = document.getElementById('smartTasksTreeView');
                            if (!items || !Array.isArray(items)) {
                                treeView.innerHTML = '';
                                return;
                            }
                            
                            const itemsHtml = items.map(function(item) {
                                return \`
                                    <div class="tree-item" data-id="\${item.id}" onclick="selectSmartTasksTreeItem(this)">
                                        <span class="codicon \${item.icon}"></span>
                                        <span class="tree-item-label">\${item.label}</span>
                                    </div>
                                \`;
                            }).join('');
                            
                            treeView.innerHTML = itemsHtml;
                        }

                        function selectSmartTasksTreeItem(element) {
                            document.querySelectorAll('.tree-item.selected').forEach(item => {
                                item.classList.remove('selected');
                            });
                            
                            element.classList.add('selected');
                            
                            vscode.postMessage({
                                command: 'smartTasksTreeItemSelected',
                                itemId: element.dataset.id
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
                            console.log('Discard file called for:', filePath);
                            showModal(
                                () => {
                                    console.log('Executing discard for:', filePath);
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
                            const branchIcon = document.getElementById('branchIcon');

                            // Update repository list visibility
                            if (repoSelect) {
                                if (repositories.length <= 1) {
                                    repoSelect.style.display = 'none';
                                } else {
                                    repoSelect.style.display = 'block';
                                    repoSelect.innerHTML = repositories.map(repo => 
                                        '<option value="' + repo.path + '" title="' + repo.path + '" ' + 
                                        (repo.path === currentRepo ? 'selected' : '') + '>' +
                                        repo.name +
                                        '</option>'
                                    ).join('');
                                }
                            }

                            // Update branch list
                            if (branchSelect && branchIcon) {
                                if (repositories.length < 1) {
                                    branchSelect.style.display = 'none';
                                    branchIcon.style.display = 'none';
                                } else {
                                    branchSelect.style.display = 'block';
                                    branchIcon.style.display = 'block';
                                    // First check if current branch exists in the list
                                    const branchExists = branches.some(branch => branch.name === currentBranch);
                                    
                                    branchSelect.innerHTML = '<option value="" disabled ' + (!branchExists ? 'selected' : '') + '>HEAD detached</option>' +
                                        branches.map(branch => 
                                            '<option value="' + branch.name + '" title="' + branch.tooltip + '"' + 
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
                            const unstagedFiles = Array.from(document.querySelectorAll('#changesTree .file-item'))
                                .map(item => item.getAttribute('data-file'));
                            if (unstagedFiles.length > 0) {
                                vscode.postMessage({ 
                                    command: 'stage',
                                    files: unstagedFiles
                                });
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

                        function unstageAllFiles() {
                            const stagedFiles = Array.from(document.querySelectorAll('#stagedTree .file-item'))
                                .map(item => item.getAttribute('data-file'));
                            if (stagedFiles.length > 0) {
                                vscode.postMessage({ 
                                    command: 'unstage',
                                    files: stagedFiles
                                });
                            }
                        }

                        function viewAllChanges(isStaged) {
                            console.log(\`Sending viewAllChanges message for staged: \${isStaged}\`);
                            const files = Array.from(document.querySelectorAll(isStaged ? '#stagedTree .file-item' : '#changesTree .file-item'))
                                .map(item => item.getAttribute('data-file'));
                            
                            vscode.postMessage({
                                command: 'viewAllChanges',
                                files: files,
                                isStaged: isStaged
                            });
                        }

                        function viewFileChanges(filePath, isStaged) {
                            console.log(\`Sending viewFileChanges message for: \${filePath}, staged: \${isStaged}\`);
                            vscode.postMessage({
                                command: 'viewFileChanges',
                                filePath: filePath,
                                isStaged: isStaged
                            });
                        }
                    </script>
                </body>
            </html>
        `;
        // console.log('Begine HTML content:');
        // let lines = htmlContent.split('\n');
        // for (let i = 0; i < lines.length; i++) {
        //     console.log(lines[i]);
        // }
        // console.log('End HTML content:');
        // return htmlContent;
    }

    // Git command implementations
    private async getCurrentRepository(webview: vscode.Webview): Promise<any | undefined> {
        const git = await this.getGitAPI(webview);
        if (!git) {
            return undefined;
        }

        const currentRepoPath = await this.getCurrentRepositoryPath();
        const repoIndex = git.repositories.findIndex((r: any) => r.rootUri.path === currentRepoPath);

        // If there's no tasks detected, try detect git path
        if (currentRepoPath && currentRepoPath !== '') {
            if (mbTaskExt.smartCommandEntries.length == 0) {
                mbTaskExt.asyncRefereshSmartTasksDataProvider(currentRepoPath);
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
    private async hasFetchableUpdates(webview: vscode.Webview): Promise<void> {
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
            console.error('Error in hasFetchableUpdates:', error);
        }
    }

    public async getGitChanges(webview: vscode.Webview) {
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
                path: r.rootUri.path
            }));

            // Find the current repository based on the selected path
            const currentRepoPath = await this.getCurrentRepositoryPath();
            const repoIndex = git.repositories.findIndex((r: any) => r.rootUri.path === currentRepoPath);
            const repo = git.repositories[repoIndex !== -1 ? repoIndex : 0];
            const state = repo.state;

            this.hasFetchableUpdates(webview);

            // Use getRefs() instead of accessing state.refs directly
            const refs = await repo.getRefs();
            //console.log('Refs:', refs); // Debug log

            const branches = refs
                .filter((ref: any) => {
                    // Include only local branches, excluding HEAD
                    return ref.name && ref.name !== 'HEAD' && !ref.name.includes('/');
                })
                .map((branch: any) => ({
                    name: branch.name || '',
                    tooltip: branch.upstream ? `->${branch.upstream.name}` : 'No upstream branch'
                }));

            //console.log('Processed branches:', branches); // Debug log

            const workingChanges = state.workingTreeChanges.map((change: { uri: vscode.Uri; status: string }) => ({
                path: change.uri.fsPath,
                status: change.status,
                staged: false
            }));

            const stagedChanges = state.indexChanges.map((change: { uri: vscode.Uri; status: string }) => ({
                path: change.uri.fsPath,
                status: change.status,
                staged: true
            }));

            const hasUnpushedCommits = state.HEAD?.ahead ? state.HEAD.ahead > 0 : false;
            const hasUnpulledCommits = state.HEAD?.behind ? state.HEAD.behind > 0 : false;
            const allChanges = [...workingChanges, ...stagedChanges];

            // Get current branch from repository state
            const currentBranch = repo.state.HEAD?.name || '';
            //console.log('Current branch:', currentBranch); // Debug log

            // Update title bar buttons color
            this.updateTitleBarGitButtons(hasUnpushedCommits, hasUnpulledCommits, stagedChanges);

            // Setup file system watcher when repository is available
            this.watchFileSystemChangeForCurrentRepository(webview);

            webview.postMessage({
                type: 'gitChanges',
                changes: allChanges,
                repositories: repositories,
                branches: branches,
                currentRepo: repo.rootUri.path,
                currentBranch: currentBranch,  // Use the current branch from repo state
                hasStagedChanges: stagedChanges.length > 0,
                hasUnstagedChanges: workingChanges.length > 0,
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
        const timestamp = new Date().toISOString(); // Format: "2024-01-05T09:45:30.123Z"
        console.log(`[${timestamp}] Git: unpushed=${hasUnpushedCommits}, unpulled=${hasUnpulledCommits}, staged=${stagedChanges.length > 0}, unfetchable=${this.hasFetchable}`);

        vscode.commands.executeCommand('setContext', 'moonbit-tasks.hasUnpushedChanges', hasUnpushedCommits);
        vscode.commands.executeCommand('setContext', 'moonbit-tasks.hasUnpulledChanges', hasUnpulledCommits);
        vscode.commands.executeCommand('setContext', 'moonbit-tasks.hasStagedChanges', stagedChanges.length > 0);
        vscode.commands.executeCommand('setContext', 'moonbit-tasks.hasFetchable', this.hasFetchable);
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
        if (mbTaskExt.smartCommandEntries.length == 0) {
            treeItems = [
                { id: '1', label: mbTaskExt.smartTasksRootTitle, icon: 'codicon-tools' }
            ];
        } else {
            treeItems = mbTaskExt.smartCommandEntries.map(entry => ({
                id: entry[1],
                label: entry[0],
                icon: getTaskIcon(entry[0])
            }));
        }

        //{ '🔍''⚙️''📁''🔧''📄' }
        webview.postMessage({
            type: 'updateSmartTasksTree',
            items: treeItems
        });
    }

    private async watchFileSystemChangeForCurrentRepository(webview: vscode.Webview) {
        const repo = await this.getCurrentRepository(webview);
        if (repo && repo.rootUri) {
            // Dispose existing watcher if any
            this.fileSystemWatcher?.dispose();

            // Create new watcher for the repository root
            this.fileSystemWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(mbTaskExt.convertGitPathForWindowsPath(repo.rootUri.path), '**/*')
            );

            // Watch for all file system events
            this.fileSystemWatcher.onDidChange(() => {
                this.getGitChanges(webview);
            });
            this.fileSystemWatcher.onDidCreate(() => {
                this.getGitChanges(webview);
            });
            this.fileSystemWatcher.onDidDelete(() => {
                this.getGitChanges(webview);
            });
        }
    }

    // Make sure to dispose the watcher when the extension is deactivated
    public dispose() {
        this.fileSystemWatcher?.dispose();
    }
}
