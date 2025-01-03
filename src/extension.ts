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
import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs';

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

//    const webview = vscode.window.createWebviewPanel('myGitTasksCustomView', 'Git Tasks', vscode.ViewColumn.One, { enableScripts: true });

    if (gitTasksProvider._webview) {
        // Set the HTML content for the webview
        gitTasksProvider._webview.html = getWebviewContent();

        // Handle messages from the webview
        gitTasksProvider._webview.onDidReceiveMessage(async (message: { command: string; branch: string }) => {
            if (message.command === 'cherryPick') {
                const { branch } = message;
                await gitTasksProvider.cherryPickToBranch(branch);
            }
        });
    }

    context.subscriptions.push(gitTasksProvider);

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
        const codiconsUri = webview.asWebviewUri(joinPath(
            this._extensionUri,
            'node_modules',
            '@vscode/codicons',
            'dist',
            'codicon.css'
        ));

        // Get path to your SVG icon
        const iconUri = webview.asWebviewUri(joinPath(
            this._extensionUri,
            'images',
            'file_type_rust_toolchain.svg'
        ));

        const htmlFilePath = path.join(this._extensionUri.fsPath, 'smartTasksWebview.html');
        const htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
    
        // Replace placeholders with actual URIs
        //const codiconsUri = webview.asWebviewUri(vscode.Uri.file(path.join(this._extensionUri.fsPath, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')));
    
        return htmlContent.replace(/\${codiconsUri}/g, codiconsUri.toString());
    }

    public async cherryPickToBranch(branch: string) {
        const git = simpleGit();
        const commitMessage = 'Your commit message'; // You can prompt the user for this
        const currentBranch = await git.branch().then(branches => branches.current); // Get the current branch

        try {
            // Commit staged files
            await git.add('./*'); // Add all staged files
            await git.commit(commitMessage); // Commit the staged files
            vscode.window.showInformationMessage('Staged files committed successfully.');

            // Switch to the target branch
            await git.checkout(branch); // Switch to the target branch
            await git.pull(); // Update the branch with the latest changes

            // Logic to copy the committed files (e.g., cherry-pick the last commit)
            await git.raw(['cherry-pick', 'HEAD']); // Cherry-pick the last commit
            vscode.window.showInformationMessage(`Committed files copied to branch: ${branch}`);

            // Restore the original branch
            await git.checkout(currentBranch); // Switch back to the original branch
            vscode.window.showInformationMessage(`Switched back to branch: ${currentBranch}`);
        } catch (error) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Failed to CherryPick: ${error.message}`);
            } else {
                vscode.window.showErrorMessage('Failed to CherryPick: Unknown error occurred.');
            }
        }
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

        const iconUri = webview.asWebviewUri(joinPath(
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

function getWebviewContent() {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Git Tasks</title>
        </head>
        <body>
            <div id="changesHeader" class="collapsible-header">Changes Header</div>
            <div id="changesContent" class="collapsible-content">
                <div class="file-actions">
                    <button class="action-button" id="cherryPickButton">CherryPick to Another Branch</button>
                </div>
            </div>
            <div id="stagedHeader" class="collapsible-header">Staged Header</div>
            <div id="stagedContent" class="collapsible-content">
                <div class="file-actions">
                    <button class="action-button" id="commitAllStagedButton">Commit All Staged Files</button>
                </div>
            </div>
            <script>
                document.getElementById('cherryPickButton').addEventListener('click', () => {
                    // Logic to show branch selection dialog
                });

                document.getElementById('commitAllStagedButton').addEventListener('click', () => {
                    // Logic to show branch selection dialog
                });
            </script>
        </body>
        </html>
    `;
}

/**
 * Joins a base URI with one or more path segments.
 * @param base The base URI.
 * @param segments The path segments to join.
 * @returns A new URI that is the result of joining the base URI with the segments.
 */
function joinPath(base: vscode.Uri, ...segments: string[]): vscode.Uri {
    // Use the path property of the base URI and concatenate the segments
    const newPath = [base.path, ...segments].join('/').replace(/\/+/g, '/'); // Normalize slashes
    return base.with({ path: newPath });
}

// Example usage
const baseUri = vscode.Uri.parse('file:///home/user/project');
const newUri = joinPath(baseUri, 'src', 'extension.ts');
console.log(newUri.toString()); // Outputs: file:///home/user/project/src/extension.ts
