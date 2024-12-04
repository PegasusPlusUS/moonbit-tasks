import * as vscode from 'vscode';

import * as langDef from './language_def';
import {
    activeDocumentChanges,
    detectProjectForActiveDocument,
    smartTaskRun,
} from './smart_tasks_panel_provider';
import {gitDef} from "./language_def";

export const extension_name = "moonbit-tasks";
export function active(context: vscode.ExtensionContext) {
	langDef.activate(context);

	registerActiveDocumentTracker(context);
    activeDocumentChanges(vscode.window.activeTextEditor);
}

export function deactivate() {
	langDef.deactivate();
}

function registerActiveDocumentTracker(context: vscode.ExtensionContext) {
    // Listen for changes to the active text editor
    vscode.window.onDidChangeActiveTextEditor((editor: any) => {
        activeDocumentChanges(editor);
    });
}

export const myGitTasksCustomViewID = 'myGitTasksCustomView';

export let smartTasksRootTitle = "No active document";
export let smartCommandEntries:Array<[command:string, shellcmd:string]> = [];
export let smartTasksDir:string = "";
export async function refereshSmartTasksDataProvider(documentDir: string) {
    smartTasksRootTitle = "Detecting " + documentDir;
    smartCommandEntries = [];

    vscode.commands.executeCommand('moonbit-tasks.updateSmartTasksTreeView', []);
    
    let result = await detectProjectForActiveDocument();

    if (result == undefined || result.handler == undefined) {
        smartTasksRootTitle = "Can't find signature of project";
    } else if (undefined == result.handler.commands) {
        smartTasksRootTitle = "No commands found in signature";
    } else {
        smartCommandEntries = Array.from(result.handler.commands.entries());//.map(([command, shellcmd]) => ({command, shellcmd})));
        smartTasksDir = documentDir;
    }

    vscode.commands.executeCommand('moonbit-tasks.updateSmartTasksTreeView', []);
}

