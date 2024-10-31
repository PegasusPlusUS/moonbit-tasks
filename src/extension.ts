import * as mbTaskExt from './language_handler';

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	mbTaskExt.active(context);
}

export function deactivate() {
	mbTaskExt.deactivate();
}
