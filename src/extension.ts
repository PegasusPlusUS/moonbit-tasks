import * as mbTaskExt from './language_handler';
import * as smartTaskExt from './smart_tasks_panel_provider';

import * as vscode from 'vscode';

// Add this interface at the top of your file
interface GitExtension {
    getAPI(version: number): Promise<any>;
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
    // Register the command
    context.subscriptions.push(
        vscode.commands.registerCommand('moonbit-tasks.updateTreeView', (items: Array<{ id: string, label: string, icon?: string }>) => {
            if (gitTasksProvider._webview) {
                gitTasksProvider.updateTreeView(gitTasksProvider._webview, items);
            }
        })
    );
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('myGitTasksCustomView', gitTasksProvider)
    );
    // Register the tree item selected command
    context.subscriptions.push(
        vscode.commands.registerCommand('moonbit-tasks.treeItemSelected', async(itemId: string) => {
            await smartTaskExt.smartTaskRun(itemId);
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
                    if (data.message) {
                        await this.gitPush(data.message, webviewView.webview);
                    }
                    break;
                case 'getChanges':
                    await this.getGitChanges(webviewView.webview);
                    break;
                case 'treeItemSelected':
                    // Execute the command when tree item is selected
                    vscode.commands.executeCommand('moonbit-tasks.treeItemSelected', data.itemId);
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
            }
        });

        this.updateTreeView(webviewView.webview, []);
        webviewView.webview.html = this._getHtmlContent(webviewView.webview);
    }

    private _getHtmlContent(webview: vscode.Webview): string {
        return `
            <!DOCTYPE html>
            <html>
                <head>
                    <style>
                        /* General layout styles */
                        .panel-container {
                            display: flex;
                            flex-direction: column;
                            height: 100vh;
                            gap: 16px;
                        }

                        .git-panel, .tree-panel {
                            flex: 1;
                            overflow-y: auto;
                            border: 1px solid var(--vscode-panel-border);
                            border-radius: 4px;
                            margin: 8px;
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
                            margin-top: 8px;
                        }

                        .button {
                            background-color: var(--vscode-button-background, #0E639C);
                            color: var(--vscode-button-foreground, #ffffff);
                            border: none;
                            padding: 4px 12px;
                            border-radius: 2px;
                            cursor: pointer;
                            font-size: 12px;
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
                    </style>
                </head>
                <body>
                    <div class="panel-container">
                        <!-- Git Source Control Panel -->
                        <div class="git-panel">
                            <div class="section-header">Git</div>
                            
                            <!-- Changes section -->
                            <div class="section-header" style="font-size: 0.9em;">Changes</div>
                            <div id="changesTree" class="file-tree">
                                <!-- Changed files will be populated here -->
                            </div>

                            <!-- Staged section -->
                            <div class="section-header" style="font-size: 0.9em;">Staged Changes</div>
                            <div id="stagedTree" class="file-tree">
                                <!-- Staged files will be populated here -->
                            </div>

                            <!-- Commit Area -->
                            <div class="commit-area">
                                <textarea id="commitMessage" placeholder="Enter commit message..." rows="1"></textarea>
                                <div class="button-container">
                                    <button class="button" id="commitBtn" onclick="gitCommit()" disabled>Commit</button>
                                    <button class="button" id="pushBtn" onclick="gitPush()" disabled>Push</button>
                                </div>
                            </div>

                            <!-- Git Actions -->
                            <div class="button-container" style="padding: 8px;">
                                <button class="button" onclick="gitPull()">Pull</button>
                                <button class="button" onclick="gitFetch()">Fetch</button>
                            </div>
                        </div>

                        <!-- Tree View Panel -->
                        <div class="tree-panel">
                            <div class="section-header">Project Tasks</div>
                            <div id="treeView" class="tree-view">
                                <!-- Tree items will be populated here -->
                            </div>
                        </div>
                    </div>

                    <div id="statusMessage" class="status-message"></div>

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
                                case 'gitChanges':
                                    updateFileTree(message.changes);
                                    updateButtonStates(message.hasStagedChanges, message.hasUnstagedChanges, message.hasUnpushedCommits);
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
                            const stageBtn = document.getElementById('stageBtn');
                            const commitBtn = document.getElementById('commitBtn');
                            const pushBtn = document.getElementById('pushBtn');
                            
                            if (stageBtn) {
                                stageBtn.disabled = !hasUnstagedChanges;
                            }
                            if (commitBtn) {
                                commitBtn.disabled = !hasStagedChanges;
                            }
                            if (pushBtn) {
                                pushBtn.disabled = !hasUnpushedCommits && !hasStagedChanges;
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
                                const fileName = file.path.split(/[\\\\/]/).pop(); // Handle both forward and backslashes
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

                            // Update commit button states
                            const commitBtn = document.getElementById('commitBtn');
                            const pushBtn = document.getElementById('pushBtn');
                            if (commitBtn && pushBtn) {
                                const hasStagedChanges = stagedChanges.length > 0;
                                commitBtn.disabled = !hasStagedChanges;
                                pushBtn.disabled = !hasUnpushedCommits;
                            }
                        }

                        // Add auto-refresh for changes (every 5 seconds)
                        setInterval(() => {
                            vscode.postMessage({ command: 'getChanges' });
                        }, 5000);

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
                            }
                        }

                        function gitPush() {
                            const message = document.getElementById('commitMessage').value;
                            if (message.trim()) {
                                vscode.postMessage({
                                    command: 'push',
                                    message: message
                                });
                                document.getElementById('commitMessage').value = ''; // Clear message after commit
                            }
                        }

                        function getGitChanges() {
                            vscode.postMessage({ command: 'getChanges' });
                        }

                        function updateTreeView(items) {
                            const treeView = document.getElementById('treeView');
                            if (!items || !Array.isArray(items)) {
                                treeView.innerHTML = '';
                                return;
                            }
                            
                            const itemsHtml = items.map(function(item) {
                                return \`
                                    <div class="tree-item" data-id="\${item.id}" onclick="selectTreeItem(this)">
                                        <span class="tree-item-icon">\${item.icon || ''}</span>
                                        <span class="tree-item-label">\${item.label}</span>
                                    </div>
                                \`;
                            }).join('');
                            
                            treeView.innerHTML = itemsHtml;
                        }

                        function selectTreeItem(element) {
                            document.querySelectorAll('.tree-item.selected').forEach(item => {
                                item.classList.remove('selected');
                            });
                            
                            element.classList.add('selected');
                            
                            vscode.postMessage({
                                command: 'treeItemSelected',
                                itemId: element.dataset.id
                            });
                        }

                        // Update message handler to handle tree data
                        window.addEventListener('message', event => {
                            const message = event.data;
                            switch (message.type) {
                                case 'updateTree':
                                    updateTreeView(message.items);
                                    break;
                                // ... existing cases ...
                            }
                        });

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
                    </script>
                </body>
            </html>
        `;
    }

    // Git command implementations
    private async gitPull(webview: vscode.Webview) {
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

    private async gitFetch(webview: vscode.Webview) {
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

    private async gitCommit(message: string, webview: vscode.Webview) {
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

    private async gitPush(message: string, webview: vscode.Webview) {
        const git = await this.getGitAPI(webview);
        if (git && git.repositories.length > 0) {
            const repo = git.repositories[0];
            try {
                await repo.commit(message);
                await repo.push();
                webview.postMessage({ 
                    type: 'info', 
                    message: 'Changes committed and pushed successfully'
                });
                await this.getGitChanges(webview); // Refresh status
            } catch (error: any) {
                webview.postMessage({ 
                    type: 'error', 
                    message: 'Commit and push failed: ' + (error.message || 'Unknown error')
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
                    hasStagedChanges: false,
                    hasUnstagedChanges: false,
                    hasUnpushedCommits: false
                });
                webview.postMessage({ 
                    type: 'error', 
                    message: 'No Git repository found'
                });
                return;
            }

            const repo = git.repositories[0];
            const state = repo.state;
            
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

            // Check for unpushed commits
            const hasUnpushedCommits = state.HEAD?.ahead ? state.HEAD.ahead > 0 : false;

            const allChanges = [...workingChanges, ...stagedChanges];
            
            // Send changes to webview
            webview.postMessage({ 
                type: 'gitChanges', 
                changes: allChanges,
                hasStagedChanges: stagedChanges.length > 0,
                hasUnstagedChanges: workingChanges.length > 0,
                hasUnpushedCommits: hasUnpushedCommits
            });
            
            if (allChanges.length === 0) {
                webview.postMessage({ 
                    type: 'info', 
                    message: 'No changes detected'
                });
            }
        } catch (error: any) {
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

    public updateTreeView(webview: vscode.Webview, items: Array<{ id: string, label: string, icon?: string }>) {
        if (mbTaskExt.smartCommands.length == 0) {
            items = [
                { id: '1', label: mbTaskExt.smartTasksRootTitle, icon: '🔍' },
            ];
        } else {
            items = mbTaskExt.smartCommands.map(str => ({ id: str, label: str, icon: '⚙️'}));
        }
        //     { id: '1', label: 'Build ', icon: '📁' },
        //     { id: '2', label: 'Test ', icon: '🔧' },
        //     { id: '3', label: 'Package', icon: '📄' }
    
        webview.postMessage({
            type: 'updateTree',
            items: items
        });
    }
}
