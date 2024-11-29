import * as vscode from 'vscode';

import * as langDef from './language_def';
import { smartGetProjectPath, smartTaskRun, activeDocumentChanges } from './smart_tasks_panel_provider';

export const extension_name = "moonbit-tasks-local";
export function active(context: vscode.ExtensionContext) {
	langDef.activate(context);

	//contributed task provider not very stable
	//registerContributedTaskProvider(context);
	registerSmartTasksTreeView(context);

	// Command handler for clicking on a view item
	registerClickHandler(context);

	// Track active document
	registerActiveDocumentTracker(context);
}

export function deactivate() {
	langDef.deactivate();
}

async function getCustomTasks(): Promise<vscode.Task[]> {
    let tasks: vscode.Task[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;
    // Retrieve the user-defined setting
    const config = vscode.workspace.getConfiguration(extension_name);
    const scanSubdirectoryForProject = config.get<boolean>('scanSubdirectoryForProject', true);  // Default to 'build.sh' if not set

    if (workspaceFolders) {
        // Iterate over each workspace folder
        for (const folder of workspaceFolders) {
			await asyncGetTasksForFolder(folder.uri, folder.name);
			if (scanSubdirectoryForProject)	{
				try {
					// Get the contents of the workspace folder
					const contents = await vscode.workspace.fs.readDirectory(folder.uri);
	
					// Iterate through each item and check if it's a directory
					for (const [name, type] of contents) {
						if (type === vscode.FileType.Directory) {
							const subdirectoryUri = vscode.Uri.joinPath(folder.uri, name);
							await asyncGetTasksForFolder(subdirectoryUri, name);
						}
					}
				} catch (error) {
					//vscode.window.showErrorMessage(`Error reading directory: ${folder.name}`);
				}	
			}
		}
	}
    return tasks;

	async function asyncGetTasksForFolder(folderUri: vscode.Uri, folderName: string) {
		const signatureFileName = 'moon.mod.json';
		const fileUri = vscode.Uri.joinPath(folderUri, signatureFileName); // Create the URI for the file

		try {
			// Try to get file stats
			await vscode.workspace.fs.stat(fileUri);
			{
				const folderPath = folderUri.fsPath; // Get the absolute path of the folder

				createTask(folderPath, 'build', vscode.TaskGroup.Build);
				createTask(folderPath, 'test', vscode.TaskGroup.Test);
				createTask(folderPath, 'clean', vscode.TaskGroup.Clean);
				createTask(folderPath, 'run src/main', vscode.TaskGroup.Build);
			}
		} catch (error) {
			//vscode.window.showWarningMessage(`File "${signatureFileName}" does not exist in ${folderUri.fsPath}`);
		}

		function createTask(folderPath: string, scriptStr: string, taskGroup: vscode.TaskGroup) {
			const task = new vscode.Task(
				{ type: 'moon', script: scriptStr },
				vscode.TaskScope.Workspace,
				'moon ' + scriptStr + ' ' + folderName,
				'moonbit',
				new vscode.ShellExecution('moon ' + scriptStr, { cwd: folderPath })
			);
			task.group = taskGroup; // Adding task to the Test group
			tasks.push(task);
		}
	}
}

function registerClickHandler(context: vscode.ExtensionContext) {
    const clickHandler = vscode.commands.registerCommand(extension_name + '.onViewItemClick', async (item: MyTreeItem) => {
        try {
            await smartTaskRun(`${item}`);
        } catch(err) {
            vscode.window.showInformationMessage(`Run task error: ${err}`);
        }
    });

    context.subscriptions.push(clickHandler);
}

function registerActiveDocumentTracker(context: vscode.ExtensionContext) {
    // Listen for changes to the active text editor
    vscode.window.onDidChangeActiveTextEditor((editor: any) => {
        activeDocumentChanges(editor);
    });
}

export const mySmartTasksCustomViewID = 'mySmartTasksCustomViewLocal';

function registerSmartTasksTreeView(context: vscode.ExtensionContext) {
    let treeDataProvider = new MyTreeDataProvider();
    const treeView = vscode.window.registerTreeDataProvider(mySmartTasksCustomViewID, treeDataProvider);
    context.subscriptions.push(treeView);

    context.subscriptions.push(
        vscode.commands.registerCommand(mySmartTasksCustomViewID + '.refresh', () => {
            treeDataProvider.refresh();
        })
    );
}

function registerContributedTaskProvider(context: vscode.ExtensionContext) {
    const taskProvider = vscode.tasks.registerTaskProvider('moon', {
        provideTasks: () => {
            return getCustomTasks();
        },
        resolveTask(_task: vscode.Task): vscode.Task | undefined {
            return undefined;
        }
    });
    context.subscriptions.push(taskProvider);
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

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function refereshSmartTasksDataProvider(documentDir: string) {
    smartTasksRootTitle = "Detecting " + documentDir;
    smartCommands = [];
    vscode.commands.executeCommand(mySmartTasksCustomViewID + '.refresh');
    let handlerInfo = await smartGetProjectPath(documentDir);
    if (handlerInfo == undefined) {
        smartTasksRootTitle = "Can't find signature of project";
    } else {
        smartCommands = Array.from(handlerInfo.commands.keys());
    }
    vscode.commands.executeCommand(mySmartTasksCustomViewID + '.refresh');
}

export class MyTreeDataProvider implements vscode.TreeDataProvider<MyTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MyTreeItem | undefined> = new vscode.EventEmitter<MyTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<MyTreeItem | undefined> = this._onDidChangeTreeData.event;

    getTreeItem(element: MyTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MyTreeItem): Thenable<MyTreeItem[]> {
        if (smartCommands.length == 0) {
            return Promise.resolve([new vscode.TreeItem(smartTasksRootTitle)]);
        } else {
            const commandItems: MyTreeItem[] = smartCommands.map(str => new MyTreeItem(str, extension_name + '.onViewItemClick'));

            return Promise.resolve(commandItems);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}
