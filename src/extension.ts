import * as mbTaskExt from './language_handler';

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
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('myGitTasksCustomView', gitTasksProvider)
    );
}

class TasksWebviewProvider implements vscode.WebviewViewProvider {
    private _webview?: vscode.Webview;

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
                case 'commitAndPush':
                    if (data.message) {
                        await this.gitCommitAndPush(data.message, webviewView.webview);
                    }
                    break;
                case 'getChanges':
                    await this.getGitChanges(webviewView.webview);
                    break;
            }
        });

        webviewView.webview.html = this._getHtmlContent(webviewView.webview);
    }

    private _getHtmlContent(webview: vscode.Webview): string {
        return `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Git Tasks</title>
                    <style>
                        body { 
                            padding: 10px; 
                            box-sizing: border-box;
                        }
                        * {
                            box-sizing: border-box;
                        }
                        .button-container { 
                            display: flex; 
                            gap: 5px; 
                            margin: 10px 0;
                            flex-wrap: wrap; /* Allow buttons to wrap on narrow panels */
                        }
                        .button { 
                            padding: 4px 8px;
                            background: var(--vscode-button-background);
                            color: var(--vscode-button-foreground);
                            border: none;
                            border-radius: 2px;
                            cursor: pointer;
                            flex-grow: 1; /* Allow buttons to grow */
                            min-width: 60px; /* Minimum button width */
                        }
                        .button:hover { background: var(--vscode-button-hoverBackground); }
                        #commitMessage {
                            width: 100%;
                            margin: 10px 0;
                            padding: 5px;
                            background: var(--vscode-input-background);
                            color: var(--vscode-input-foreground);
                            border: 1px solid var(--vscode-input-border);
                            resize: vertical; /* Only allow vertical resizing */
                            min-height: 60px;
                            max-height: 200px;
                        }
                        .file-tree {
                            margin: 10px 0;
                            max-height: 200px;
                            overflow-y: auto;
                            width: 100%;
                        }
                        .file-item {
                            display: flex;
                            align-items: center;
                            padding: 2px 0;
                            width: 100%;
                            overflow-x: hidden;
                        }
                        .file-item input[type="checkbox"] {
                            margin-right: 5px;
                            flex-shrink: 0;
                        }
                        .file-item span {
                            overflow: hidden;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                        }
                        
                        #statusArea {
                            margin: 10px 0;
                            padding: 8px;
                            border-radius: 3px;
                            display: none;  /* Hidden by default */
                        }

                        #statusArea.error {
                            display: block;
                            background: var(--vscode-inputValidation-errorBackground);
                            border: 1px solid var(--vscode-inputValidation-errorBorder);
                            color: var(--vscode-inputValidation-errorForeground);
                        }

                        #statusArea.info {
                            display: block;
                            background: var(--vscode-inputValidation-infoBackground);
                            border: 1px solid var(--vscode-inputValidation-infoBorder);
                            color: var(--vscode-inputValidation-infoForeground);
                        }
                    </style>
                </head>
                <body>
                    <div id="statusArea"></div>

                    <div class="button-container">
                        <button class="button" onclick="gitPull()">Pull</button>
                        <button class="button" onclick="gitFetch()">Fetch</button>
                    </div>
                    
                    <textarea id="commitMessage" placeholder="Enter commit message..." rows="3"></textarea>
                    
                    <div id="fileTree" class="file-tree">
                        <!-- Git changes will be populated here -->
                    </div>

                    <div class="button-container">
                        <button class="button" onclick="gitStage()">Stage</button>
                        <button class="button" onclick="gitCommit()">Commit</button>
                        <button class="button" onclick="gitCommitAndPush()">Commit & Push</button>
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

                        // Update the message handler
                        window.addEventListener('message', event => {
                            const message = event.data;
                            switch (message.type) {
                                case 'gitChanges':
                                    updateFileTree(message.changes);
                                    break;
                                case 'error':
                                    showError(message.message);
                                    break;
                                case 'info':
                                    showInfo(message.message);
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

                        function gitStage() {
                            const checkedFiles = Array.from(document.querySelectorAll('.file-item input[type="checkbox"]:checked'))
                                .map(cb => cb.getAttribute('data-file'));
                            vscode.postMessage({ 
                                command: 'stage',
                                files: checkedFiles
                            });
                        }

                        function gitCommit() {
                            const message = document.getElementById('commitMessage').value;
                            vscode.postMessage({ 
                                command: 'commit',
                                message: message
                            });
                        }

                        function gitCommitAndPush() {
                            const message = document.getElementById('commitMessage').value;
                            vscode.postMessage({ 
                                command: 'commitAndPush',
                                message: message
                            });
                        }

                        function updateFileTree(changes) {
                            const fileTree = document.getElementById('fileTree');
                            fileTree.innerHTML = changes.map(file => \`
                                <div class="file-item">
                                    <input type="checkbox" data-file="\${file.path}">
                                    <span>\${file.path} (\${file.status})</span>
                                </div>
                            \`).join('');
                        }
                    </script>
                </body>
            </html>
        `;
    }

    // Git command implementations
    private async gitPull(webview: vscode.Webview) {
        const git = await this.getGitAPI();
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
        const git = await this.getGitAPI();
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
        const git = await this.getGitAPI();
        if (git && git.repositories.length > 0) {
            const repo = git.repositories[0];
            try {
                await repo.add(files);
                webview.postMessage({ 
                    type: 'info', 
                    message: 'Files staged successfully'
                });
            } catch (error: any) {
                webview.postMessage({ 
                    type: 'error', 
                    message: 'Failed to stage files: ' + (error.message || 'Unknown error')
                });
            }
        } else {
            webview.postMessage({ 
                type: 'error', 
                message: 'No Git repository found'
            });
        }
    }

    private async gitCommit(message: string, webview: vscode.Webview) {
        const git = await this.getGitAPI();
        if (git && git.repositories.length > 0) {
            const repo = git.repositories[0];
            try {
                await repo.commit(message);
                webview.postMessage({ 
                    type: 'info', 
                    message: 'Changes committed successfully'
                });
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

    private async gitCommitAndPush(message: string, webview: vscode.Webview) {
        const git = await this.getGitAPI();
        if (git && git.repositories.length > 0) {
            const repo = git.repositories[0];
            try {
                await repo.commit(message);
                await repo.push();
                webview.postMessage({ 
                    type: 'info', 
                    message: 'Changes committed and pushed successfully'
                });
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
            const git = await this.getGitAPI();
            if (!git?.repositories?.length) {
                webview.postMessage({ type: 'gitChanges', changes: [] });
                webview.postMessage({ 
                    type: 'error', 
                    message: 'No Git repository found'
                });
                return;
            }

            const repo = git.repositories[0];
            const state = repo.state;
            const changes = state.workingTreeChanges.map((change: { uri: vscode.Uri; status: string }) => ({
                path: change.uri.fsPath,
                status: change.status
            }));
            webview.postMessage({ type: 'gitChanges', changes });
            
            if (changes.length === 0) {
                webview.postMessage({ 
                    type: 'info', 
                    message: 'No changes detected'
                });
            }
        } catch (error: any) {
            webview.postMessage({ type: 'gitChanges', changes: [] });
            webview.postMessage({ 
                type: 'error', 
                message: 'Failed to get Git changes: ' + (error.message || 'Unknown error')
            });
        }
    }

    private async getGitAPI() {
        try {
            const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
            if (!extension) {
                vscode.window.showErrorMessage('Git extension not found');
                return undefined;
            }

            const gitExtension = extension.isActive ? extension.exports : await extension.activate();
            const git = await gitExtension.getAPI(1);
            return git;
        } catch (error) {
            vscode.window.showErrorMessage('Failed to load Git extension');
            return undefined;
        }
    }
}