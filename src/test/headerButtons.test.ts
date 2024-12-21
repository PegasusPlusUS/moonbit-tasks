import * as vscode from 'vscode';
import { activate } from '../extension'; // Adjust the import based on your project structure

const chai = require('chai');
const expect = chai.expect;

describe('Header Buttons in Git Tasks Webview', function () {
    this.timeout(10000); // Set a timeout for async operations

    let webview: vscode.WebviewPanel;

    before(async () => {
        // Create a mock ExtensionContext
        const context: vscode.ExtensionContext = {
            subscriptions: [],
            workspaceState: {} as any,
            globalState: {} as any,
            secrets: {} as any,
            extensionUri: vscode.Uri.parse('http://localhost'),
            extensionPath: '',
            asAbsolutePath: (relativePath: string) => relativePath,
            logUri: vscode.Uri.parse('http://localhost/log'),
            globalStorageUri: vscode.Uri.parse('http://localhost/globalStorage'),
            storageUri: vscode.Uri.parse('http://localhost/storage'),
            environmentVariableCollection: {} as any,
            storagePath: '',
            globalStoragePath: '',
            logPath: '',
            extensionMode: vscode.ExtensionMode.Development,
            extension: {} as any,
            languageModelAccessInformation: {} as any
        };

        await activate(context);

        webview = vscode.window.createWebviewPanel('myGitTasksCustomView', 'Git Tasks', vscode.ViewColumn.One, { enableScripts: true });

        // Set the HTML content for the webview
        webview.webview.html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Git Tasks</title>
                <style>
                    .collapsible-content {
                        display: none; /* Initially hide content */
                    }
                </style>
            </head>
            <body>
                <div id="changesHeader" class="collapsible-header">Changes Header</div>
                <div id="changesContent" class="collapsible-content">
                    <div class="file-actions">
                        <button class="action-button" onclick="console.log('Action 1')">Action 1</button>
                        <button class="action-button" onclick="console.log('Action 2')">Action 2</button>
                    </div>
                </div>
                <div id="stagedHeader" class="collapsible-header">Staged Header</div>
                <div id="stagedContent" class="collapsible-content">
                    <div class="file-actions">
                        <button class="action-button" onclick="console.log('Action 3')">Action 3</button>
                    </div>
                </div>

                <script>
                    document.querySelectorAll('.collapsible-header').forEach(header => {
                        header.addEventListener('click', () => {
                            const content = header.nextElementSibling;
                            content.style.display = content.style.display === 'block' ? 'none' : 'block';
                        });
                    });
                </script>
            </body>
            </html>
        `;
    });

    it('should toggle display of changes content when clicking Changes header', async () => {
        // Simulate click on Changes header
        await webview.webview.postMessage({ command: 'clickChangesHeader' });

        // Check if changes content is displayed
        const changesContentVisible = webview.webview.html.includes('display: block');
        expect(changesContentVisible).to.be.true;

        // Simulate click again to hide
        await webview.webview.postMessage({ command: 'clickChangesHeader' });

        // Check if changes content is hidden
        const changesContentHidden = webview.webview.html.includes('display: none');
        expect(changesContentHidden).to.be.true;
    });

    it('should toggle display of staged content when clicking Staged header', async () => {
        // Simulate click on Staged header
        await webview.webview.postMessage({ command: 'clickStagedHeader' });

        // Check if staged content is displayed
        const stagedContentVisible = webview.webview.html.includes('display: block');
        expect(stagedContentVisible).to.be.true;

        // Simulate click again to hide
        await webview.webview.postMessage({ command: 'clickStagedHeader' });

        // Check if staged content is hidden
        const stagedContentHidden = webview.webview.html.includes('display: none');
        expect(stagedContentHidden).to.be.true;
    });
});
