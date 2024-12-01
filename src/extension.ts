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
    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.command) {
                case 'pull':
                    await this.gitPull();
                    break;
                case 'fetch':
                    await this.gitFetch();
                    break;
                case 'stage':
                    if (data.files) {
                        await this.gitStage(data.files);
                    }
                    break;
                case 'commit':
                    if (data.message) {
                        await this.gitCommit(data.message);
                    }
                    break;
                case 'commitAndPush':
                    if (data.message) {
                        await this.gitCommitAndPush(data.message);
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
                    </style>
                </head>
                <body>
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

                        // Handle messages from extension
                        window.addEventListener('message', event => {
                            const message = event.data;
                            switch (message.type) {
                                case 'gitChanges':
                                    updateFileTree(message.changes);
                                    break;
                            }
                        });

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
    private async gitPull() {
        const git = await this.getGitAPI();
        if (git && git.repositories.length > 0) {
            const repo = git.repositories[0];
            await repo.pull();
        } else {
            vscode.window.showErrorMessage('No Git repository found');
        }
    }

    private async gitFetch() {
        const git = await this.getGitAPI();
        if (git && git.repositories.length > 0) {
            const repo = git.repositories[0];
            await repo.fetch();
        } else {
            vscode.window.showErrorMessage('No Git repository found');
        }
    }

    private async gitStage(files: string[]) {
        const git = await this.getGitAPI();
        if (git && git.repositories.length > 0) {
            const repo = git.repositories[0];
            await repo.add(files);
        } else {
            vscode.window.showErrorMessage('No Git repository found');
        }
    }

    private async gitCommit(message: string) {
        const git = await this.getGitAPI();
        if (git && git.repositories.length > 0) {
            const repo = git.repositories[0];
            await repo.commit(message);
        } else {
            vscode.window.showErrorMessage('No Git repository found');
        }
    }

    private async gitCommitAndPush(message: string) {
        const git = await this.getGitAPI();
        if (git && git.repositories.length > 0) {
            const repo = git.repositories[0];
            await repo.commit(message);
            await repo.push();
        } else {
            vscode.window.showErrorMessage('No Git repository found');
        }
    }

    private async getGitChanges(webview: vscode.Webview) {
        try {
            const git = await this.getGitAPI();
            if (!git?.repositories?.length) {
                webview.postMessage({ type: 'gitChanges', changes: [] });
                vscode.window.showErrorMessage('No Git repository found');
                return;
            }

            const repo = git.repositories[0];
            const state = repo.state;  // Use state instead of getStatus
            const changes = state.workingTreeChanges.map((change: { uri: vscode.Uri; status: string }) => ({
                path: change.uri.fsPath,
                status: change.status
            }));
            webview.postMessage({ type: 'gitChanges', changes });
        } catch (error) {
            webview.postMessage({ type: 'gitChanges', changes: [] });
            vscode.window.showErrorMessage('Failed to get Git changes');
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