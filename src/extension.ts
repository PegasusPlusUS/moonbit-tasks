import * as mbTaskExt from './language_handler';
import * as smartTaskExt from './smart_tasks_panel_provider';

import * as vscode from 'vscode';

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
        vscode.commands.registerCommand('moonbit-tasks.smartTasksTreeItemSelected', async(shellcmd: any) => {
            await smartTaskExt.smartTaskRun(shellcmd);
        })
    );
}

class TasksWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'moonbit-tasks.gitView';
    public _webview?: vscode.Webview;  // Made public so command can access it

    constructor(private readonly _extensionUri: vscode.Uri) {}

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
                // View became visible
                mbTaskExt.refereshSmartTasksDataProvider("");
            } else {
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
                    vscode.commands.executeCommand('moonbit-tasks.smartTasksTreeItemSelected', data.itemId);
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
                                await this.getGitChanges(webviewView.webview);
                            } catch (error: any) {
                                webviewView.webview.postMessage({
                                    type: 'error',
                                    message: 'Failed to switch branch: ' + (error.message || 'Unknown error')
                                });
                            }
                        }
                    }
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

        if (mbTaskExt.smartCommandEntries.length == 0) {
            mbTaskExt.refereshSmartTasksDataProvider(data.path);
        }
    }

    private async getCurrentRepositoryPath() {
        let path : string | undefined = undefined;
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

    private _getHtmlContent(webview: vscode.Webview): string {
        let htmlContent = `
            <!DOCTYPE html>
            <html>
                <head>
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
                            padding: 4px 12px;
                            font-weight: bold;
                            color: var(--vscode-foreground);
                            background: var(--vscode-sideBar-background);
                            position: sticky;
                            top: 0;
                            z-index: 1;
                        }

                        .file-tree {
                            margin: 0;
                            padding: 0;
                        }

                        .file-item {
                            display: flex;
                            align-items: center;
                            padding: 4px 12px;
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
                            left: 40%;
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
                            gap: 8px;
                            align-items: center;
                            padding: 4px 0;
                        }

                        .select-control {
                            background: var(--vscode-dropdown-background);
                            color: var(--vscode-dropdown-foreground);
                            border: 1px solid var(--vscode-dropdown-border);
                            padding: 2px 4px;
                            border-radius: 2px;
                            font-size: 12px;
                            min-width: 120px;
                        }

                        /* Add styles for unselected branch state */
                        .select-control.no-branch-selected {
                            border-color: var(--vscode-inputValidation-errorBorder);
                            background-color: var(--vscode-inputValidation-errorBackground);
                        }

                        .select-control:hover {
                            cursor: pointer;
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
                                        </select>
                                        <select id="branchSelect" class="select-control" title="Select Branch">
                                            <!-- Branches will be populated here -->
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <!-- Changes section -->
                            <div id="changesHeader" class="section-header" style="font-size: 0.9em;">Changes</div>
                            <div id="changesTree" class="file-tree">
                                <!-- Changed files will be populated here -->
                            </div>

                            <!-- Staged section -->
                            <div id="stagedHeader" class="section-header" style="font-size: 0.9em;">Staged Changes</div>
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
                            <div class="section-header">Project Tasks</div>
                            <div id="smartTasksTreeView" class="tree-view">
                                <!-- Smart Tasks tree items will be populated here -->
                            </div>
                        <!-- /div -->
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
                                    updateFileTree(message.changes);
                                    updateButtonStates(
                                        message.hasStagedChanges,
                                        message.hasUnstagedChanges,
                                        message.hasUnpushedCommits
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

                        // Initialize by getting changes
                        vscode.postMessage({ command: 'getChanges' });

                        function gitPull() {
                            vscode.postMessage({ command: 'pull' });
                        }

                        function gitFetch() {
                            vscode.postMessage({ command: 'fetch' });
                        }

                        function updateButtonStates(hasStagedChanges, hasUnstagedChanges, hasUnpushedCommits) {
                            console.log('Button states:', { hasStagedChanges, hasUnstagedChanges, hasUnpushedCommits }); // Debug log
                            const commitBtn = document.getElementById('commitBtn');
                            const commitMessage = document.getElementById('commitMessage');
                            const pushBtn = document.getElementById('pushBtn');
                            
                            if (commitMessage) {
                                commitMessage.disabled = !hasStagedChanges;
                            }
                            if (commitBtn) {
                                commitBtn.disabled = !hasStagedChanges && commitMessage && commitMessage.value.trim() === '';
                            }
                            if (pushBtn) {
                                // Enable push button if there are unpushed commits
                                pushBtn.disabled = !hasUnpushedCommits;
                            }
                        }

                        function getFileName(fullpath) {
                            return fullpath.split(/[\\\\/]/).pop();
                        }
                        
                        function doubleEscape(str) {
                            return str.replace(/\\\\/g, '\\\\\\\\');
                        }

                        function updateFileTree(changes) {
                            const changesTree = document.getElementById('changesTree');
                            const stagedTree = document.getElementById('stagedTree');
                            
                            // Separate changes into staged and unstaged
                            const unstagedChanges = changes.filter(file => !file.staged);
                            const stagedChanges = changes.filter(file => file.staged);

                            const changesHeader = document.getElementById('changesHeader');
                            if (changesHeader) {
                                if (unstagedChanges.length > 0) {
                                    changesHeader.visible = true;
                                    changesHeader.textContent = 'Changes (' + unstagedChanges.length + ')';
                                } else {
                                    changesHeader.textContent = 'Changes';
                                    changesHeader.visible = false;
                                }
                            }

                            const stagedHeader = document.getElementById('stagedHeader');
                            if (stagedHeader) {
                                if (stagedChanges.length > 0) {
                                    stagedHeader.visible = true;
                                    stagedHeader.textContent = 'Staged (' + stagedChanges.length + ')';
                                } else {
                                    stagedHeader.textContent = 'Staged';
                                    stagedHeader.visible = false;
                                }
                            }

                            // Render unstaged changes
                            changesTree.innerHTML = unstagedChanges.map(file => {
                                const fileName = getFileName(file.path);
                                return \`
                                    <div class="file-item" data-file="\${file.path}">
                                        <span class="file-name">\${fileName}</span>
                                        <div class="tooltip">\${file.path}</div>
                                        <div class="file-actions">
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
                                    <div class="file-item" data-file="\${file.path}">
                                        <span class="file-name">\${fileName}</span>
                                        <div class="tooltip">\${file.path}</div>
                                        <div class="file-actions">
                                            <button class="action-button" onclick="unstageFile('\${doubleEscape(file.path)}')" title="Unstage Changes">-</button>
                                        </div>
                                    </div>
                                \`;
                            }).join('');
                        }

                        // Move the interval setup outside of any function
                        // and make sure it runs when the page loads
                        (function setupAutoRefresh() {
                            console.log('Setting up auto-refresh interval');
                            setInterval(() => {
                                console.log('Auto-refresh: Getting changes');
                                vscode.postMessage({ command: 'getChanges' });
                            }, 5000);
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

                        function updateSmartTasksTreeView(items) {
                            const treeView = document.getElementById('smartTasksTreeView');
                            if (!items || !Array.isArray(items)) {
                                treeView.innerHTML = '';
                                return;
                            }
                            
                            const itemsHtml = items.map(function(item) {
                                return \`
                                    <div class="tree-item" data-id="\${item.id}" onclick="selectSmartTasksTreeItem(this)">
                                        <span class="tree-item-icon">\${item.icon || ''}</span>
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
                            if (confirm('Are you sure you want to discard changes in this file?')) {
                                vscode.postMessage({ 
                                    command: 'discard',
                                    files: [filePath]
                                });
                            }
                        }

                        function updateRepositoryAndBranchLists(repositories, branches, currentRepo, currentBranch) {
                            const repoSelect = document.getElementById('repoSelect');
                            const branchSelect = document.getElementById('branchSelect');

                            // Update repository list
                            if (repoSelect) {
                                repoSelect.innerHTML = repositories.map(repo => 
                                    '<option value="' + repo.path + '" title="' + repo.path + '" ' + 
                                    (repo.path === currentRepo ? 'selected' : '') + '>' +
                                    repo.name +
                                    '</option>'
                                ).join('');
                            }

                            // Update branch list
                            if (branchSelect) {
                                // First check if current branch exists in the list
                                const branchExists = branches.some(branch => branch.name === currentBranch);
                                
                                branchSelect.innerHTML = '<option value="" disabled ' + (!branchExists ? 'selected' : '') + '>HEAD detached</option>' +
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
                    </script>
                </body>
            </html>
        `;
        console.log('HTML content:', htmlContent);
        return htmlContent;
    }

    // Git command implementations
    public async gitPull(webview: vscode.Webview) {
        const git = await this.getGitAPI(webview);
        if (git && git.repositories.length > 0) {
            const repo = git.repositories[0];
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
        const git = await this.getGitAPI(webview);
        if (git && git.repositories.length > 0) {
            const repo = git.repositories[0];
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
        const git = await this.getGitAPI(webview);
        if (git && git.repositories.length > 0) {
            const repo = git.repositories[0];
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
        const git = await this.getGitAPI(webview);
        if (git && git.repositories.length > 0) {
            const repo = git.repositories[0];
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
        }
    }

    private async gitDiscard(files: string[], webview: vscode.Webview) {
        const git = await this.getGitAPI(webview);
        if (git && git.repositories.length > 0) {
            const repo = git.repositories[0];
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
        }
    }

    public async gitCommit(message: string, webview: vscode.Webview) {
        const git = await this.getGitAPI(webview);
        if (git && git.repositories.length > 0) {
            const repo = git.repositories[0];
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
        const git = await this.getGitAPI(webview);
        if (git && git.repositories.length > 0) {
            const repo = git.repositories[0];
            try {
                await repo.push();
                webview.postMessage({ 
                    type: 'info', 
                    message: 'Push successfully'
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

    private async getGitChanges(webview: vscode.Webview) {
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
                    hasUnpushedCommits: false
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

            // If there's no tasks detected, try detect git path
            if (currentRepoPath && currentRepoPath !== '') {
                if (mbTaskExt.smartCommandEntries.length == 0) {
                    mbTaskExt.refereshSmartTasksDataProvider(currentRepoPath);
                }
            }

            // Use getRefs() instead of accessing state.refs directly
            const refs = await repo.getRefs();
            console.log('Refs:', refs); // Debug log

            const branches = refs
                .filter((ref: any) => {
                    // Include both local and remote branches, excluding HEAD
                    return ref.name && ref.name !== 'HEAD';
                })
                .map((branch: any) => ({
                    name: branch.name || '',
                    remote: branch.remote || false,
                    upstream: branch.upstream?.name || ''
                }));

            console.log('Processed branches:', branches); // Debug log

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

            const allChanges = [...workingChanges, ...stagedChanges];
            
            // Get current branch from repository state
            const currentBranch = repo.state.HEAD?.name || '';
            console.log('Current branch:', currentBranch); // Debug log

            webview.postMessage({ 
                type: 'gitChanges', 
                changes: allChanges,
                repositories: repositories,
                branches: branches,
                currentRepo: repo.rootUri.path,
                currentBranch: currentBranch,  // Use the current branch from repo state
                hasStagedChanges: stagedChanges.length > 0,
                hasUnstagedChanges: workingChanges.length > 0,
                hasUnpushedCommits: hasUnpushedCommits
            });
        } catch (error: any) {
            console.error('Error in getGitChanges:', error);
            webview.postMessage({ 
                type: 'error', 
                message: 'Failed to get Git changes: ' + (error.message || 'Unknown error')
            });
        }
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
                { id: '1', label: mbTaskExt.smartTasksRootTitle, icon: '🔍' },
            ];
        } else {
            treeItems = mbTaskExt.smartCommandEntries.map(entry=> ({ id: entry[1], label: entry[0], icon: '⚙️'}));
        }
        // items = [
        //     { id: '1', label: 'Build ', icon: '📁' },
        //     { id: '2', label: 'Test ', icon: '🔧' },
        //     { id: '3', label: 'Package', icon: '📄' }
        // ];
        webview.postMessage({
            type: 'updateSmartTasksTree',
            items: treeItems
        });
    }
}
