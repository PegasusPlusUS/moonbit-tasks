import * as lh from './language_handler';

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	lh.initExtension(context);
}

export function deactivate() {}
