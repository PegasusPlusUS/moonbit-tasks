import * as vscode from 'vscode';

import * as langDef from './language_def';
import {
    activeDocumentChanges,
    detectProjectForActiveDocument,
    gitTaskRun,
    smartTaskRun,
} from './smart_tasks_panel_provider';
import {gitDef} from "./language_def";

export const extension_name = "moonbit-tasks";
export function active(context: vscode.ExtensionContext) {
	langDef.activate(context);

    registerGitTasksTreeView(context);
	registerSmartTasksTreeView(context);
	registerClickHandler(context);

	registerActiveDocumentTracker(context);
}

export function deactivate() {
	langDef.deactivate();
}

function registerClickHandler(context: vscode.ExtensionContext) {
    const clickSmartTasksHandler = vscode.commands.registerCommand(extension_name + onSmartTasksViewItemClickEventName, async (item: MyTreeItem) => {
        try {
            await smartTaskRun(`${item}`);
        } catch(err) {
            vscode.window.showInformationMessage(`Run task error: ${err}`);
        }
    });

    const clickGitTasksHandler = vscode.commands.registerCommand(extension_name + onGitTasksViewItemClickEventName, async (item: MyTreeItem) => {
        try {
            await gitTaskRun(`${item}`);
        } catch(err) {
            vscode.window.showInformationMessage(`Run task error: ${err}`);
        }
    });

    context.subscriptions.push(clickSmartTasksHandler);
    context.subscriptions.push(clickGitTasksHandler);
}

function registerActiveDocumentTracker(context: vscode.ExtensionContext) {
    // Listen for changes to the active text editor
    vscode.window.onDidChangeActiveTextEditor((editor: any) => {
        activeDocumentChanges(editor);
    });
}

export const myGitTasksCustomViewID = 'myGitTasksCustomView';

function registerGitTasksTreeView(context: vscode.ExtensionContext) {
    let treeDataProvider = new MyGitTasksTreeDataProvider();
    const treeView = vscode.window.registerTreeDataProvider(myGitTasksCustomViewID, treeDataProvider);
    context.subscriptions.push(treeView);
}

export const mySmartTasksCustomViewID = 'mySmartTasksCustomView';

function registerSmartTasksTreeView(context: vscode.ExtensionContext) {
    let treeDataProvider = new MySmartTasksTreeDataProvider();
    const treeView = vscode.window.registerTreeDataProvider(mySmartTasksCustomViewID, treeDataProvider);
    context.subscriptions.push(treeView);

    context.subscriptions.push(
        vscode.commands.registerCommand(mySmartTasksCustomViewID + '.refresh', () => {
            treeDataProvider.refresh();
        })
    );
}

export class MyStubTreeItem extends vscode.TreeItem {
    constructor(label: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
    }
}

export class MyTreeItem extends vscode.TreeItem {
    constructor(label: string, commandId: string) {
        super(label, vscode.TreeItemCollapsibleState.None);

        // Define the command to execute when this item is clicked
        this.command = {
            command: commandId,  // Command ID
            title: 'View Item Clicked',
            arguments: [label]    // Pass the item as an argument
        };
    }
}

let smartTasksRootTitle = "No active document";
let smartCommands:string[] = [];

export async function refereshSmartTasksDataProvider(documentDir: string) {
    smartTasksRootTitle = "Detecting " + documentDir;
    smartCommands = [];
    vscode.commands.executeCommand(mySmartTasksCustomViewID + '.refresh');
    let result = await detectProjectForActiveDocument();

    if (result == undefined || result.handler == undefined) {
        smartTasksRootTitle = "Can't find signature of project";
    } else {
        smartCommands = Array.from(result.handler.commands.keys());
    }
    vscode.commands.executeCommand(mySmartTasksCustomViewID + '.refresh');
}

const onGitTasksViewItemClickEventName = '.onGitTasksViewItemClick';
export class MyGitTasksTreeDataProvider implements vscode.TreeDataProvider<MyTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MyTreeItem | undefined> = new vscode.EventEmitter<MyTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<MyTreeItem | undefined> = this._onDidChangeTreeData.event;

    getTreeItem(element: MyTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MyTreeItem): Thenable<MyTreeItem[]> {
        const commandItems: MyTreeItem[] = Array.from(gitDef.keys()).map(str => new MyTreeItem(str, extension_name + onGitTasksViewItemClickEventName));

        return Promise.resolve(commandItems);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}

const onSmartTasksViewItemClickEventName = '.onSmartTasksViewItemClick';
export class MySmartTasksTreeDataProvider implements vscode.TreeDataProvider<MyTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MyTreeItem | undefined> = new vscode.EventEmitter<MyTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<MyTreeItem | undefined> = this._onDidChangeTreeData.event;

    getTreeItem(element: MyTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MyTreeItem): Thenable<MyTreeItem[]> {
        if (smartCommands.length == 0) {
            return Promise.resolve([new vscode.TreeItem(smartTasksRootTitle)]);
        } else {
            const commandItems: MyTreeItem[] = smartCommands.map(str => new MyTreeItem(str, extension_name + onSmartTasksViewItemClickEventName));

            return Promise.resolve(commandItems);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}
