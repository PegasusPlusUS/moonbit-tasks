import * as assert from 'assert';
import * as vscode from 'vscode';
import * as myExtension from '../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Activate extension', async () => {
		// Create a more complete mock of the ExtensionContext
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

		await myExtension.activate(context); // Call the activate function

		// Add assertions to verify the expected behavior after activation
		assert.ok(context.subscriptions.length > 0, 'Expected subscriptions to be added');
	});
});
