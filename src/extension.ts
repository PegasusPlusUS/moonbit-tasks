import * as mbTaskExt from './language_handler';

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	mbTaskExt.initExtension(context);
}

export function deactivate() {}
