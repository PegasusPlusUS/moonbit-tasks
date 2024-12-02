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

	registerClickHandler(context);

	registerActiveDocumentTracker(context);
    activeDocumentChanges(vscode.window.activeTextEditor);
}

export function deactivate() {
	langDef.deactivate();
}

function registerClickHandler(context: vscode.ExtensionContext) {
    const clickSmartTasksHandler = vscode.commands.registerCommand(extension_name + onSmartTasksViewItemClickEventName, async (item: string) => {
        try {
            await smartTaskRun(`${item}`);
        } catch(err) {
            vscode.window.showInformationMessage(`Run task error: ${err}`);
        }
    });

    context.subscriptions.push(clickSmartTasksHandler);
}

function registerActiveDocumentTracker(context: vscode.ExtensionContext) {
    // Listen for changes to the active text editor
    vscode.window.onDidChangeActiveTextEditor((editor: any) => {
        activeDocumentChanges(editor);
    });
}

export const myGitTasksCustomViewID = 'myGitTasksCustomView';

export let smartTasksRootTitle = "No active document";
export let smartCommands:string[] = [];

export async function refereshSmartTasksDataProvider(documentDir: string) {
    smartTasksRootTitle = "Detecting " + documentDir;
    smartCommands = [];

    vscode.commands.executeCommand('moonbit-tasks.updateTreeView', []);
    
    let result = await detectProjectForActiveDocument();

    if (result == undefined || result.handler == undefined) {
        smartTasksRootTitle = "Can't find signature of project";
    } else if (undefined == result.handler.commands) {
        smartTasksRootTitle = "No commands found in signature";
    } else {
        smartCommands = Array.from(result.handler.commands.keys());
    }

    vscode.commands.executeCommand('moonbit-tasks.updateTreeView', []);
}

export const onSmartTasksViewItemClickEventName = '.onSmartTasksViewItemClick';

