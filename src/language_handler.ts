import * as vscode from 'vscode';

import * as langDef from './language_def';
import {
    asyncActiveDocumentChangesHandler,
    asyncDetectProjectForDocumentOrDirectory,
} from './smart_tasks_panel_provider';

export const extension_name = "moonbit-tasks";
export function active(context: vscode.ExtensionContext) {
	langDef.activate(context);

	registerActiveDocumentTracker(context);
    asyncActiveDocumentChangesHandler(vscode.window.activeTextEditor);
}

export function deactivate() {
	langDef.deactivate();
}

function registerActiveDocumentTracker(context: vscode.ExtensionContext) {
    // Listen for changes to the active text editor
    vscode.window.onDidChangeActiveTextEditor((editor: any) => {
        asyncActiveDocumentChangesHandler(editor);
    });
}

export let smartTasksRootTitle = "No active document";
export let smartCommandEntries:Array<[command:string, shellcmd:string]> = [];
export let smartTasksDir:string = "";
export async function asyncRefereshSmartTasksDataProvider(documentPathOrDir: string) {
    smartTasksRootTitle = "Detecting " + documentPathOrDir;
    smartCommandEntries = [];

    vscode.commands.executeCommand('moonbit-tasks.updateSmartTasksTreeView', []);
    
    let result = await asyncDetectProjectForDocumentOrDirectory(documentPathOrDir);

    if (result == undefined || result.handler == undefined) {
        smartTasksRootTitle = "Can't find signature of project";
    } else if (undefined == result.handler.commands) {
        smartTasksRootTitle = "No commands found in signature";
    } else {
        smartCommandEntries = Array.from(result.handler.commands.entries());//.map(([command, shellcmd]) => ({command, shellcmd})));
        smartTasksDir = result.rootPath ? result.rootPath : "";
    }

    vscode.commands.executeCommand('moonbit-tasks.updateSmartTasksTreeView', []);
}

