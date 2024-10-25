import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fsPromises } from 'fs';

const signatureFileName = 'moon.mod.json';

export function activate(context: vscode.ExtensionContext) {
    registerTaskProvider();

    registerTreeView();

    // Command handler for clicking on a view item
    registerClickHandler();

	function registerClickHandler() {
		const clickHandler = vscode.commands.registerCommand('moonbit-tasks.onViewItemClick', async (item: MyTreeItem) => {
			// Handle the item click
			//vscode.window.showInformationMessage(`You clicked on: ${item} - ${item.label}`);

			// You can also perform more complex actions here,
			// like opening a file or running other commands.
			try {
				await smartTaskRun(`${item}`);
			} catch(err) {
				vscode.window.showInformationMessage(`Run task error: ${err}`);
			}
		});

		context.subscriptions.push(clickHandler);
	}

	function registerTreeView() {
		const treeDataProvider = new MyTreeDataProvider();
		const treeView = vscode.window.registerTreeDataProvider('mySmartTasksCustomView', treeDataProvider);
		context.subscriptions.push(treeView);

		context.subscriptions.push(
			vscode.commands.registerCommand('mySmartTasksCustomView.refresh', () => {
				vscode.window.showInformationMessage(`Need refresh smart tasks custom view`);
				treeDataProvider.refresh();
			})
		);
	}

	function registerTaskProvider() {
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
}

async function getCustomTasks(): Promise<vscode.Task[]> {
    let tasks: vscode.Task[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;
    // Retrieve the user-defined setting
    const config = vscode.workspace.getConfiguration('myExtension');
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

export function deactivate() {}

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
export class MyTreeDataProvider implements vscode.TreeDataProvider<MyTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MyTreeItem | undefined> = new vscode.EventEmitter<MyTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<MyTreeItem | undefined> = this._onDidChangeTreeData.event;

    getTreeItem(element: MyTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MyTreeItem): Thenable<MyTreeItem[]> {
        return Promise.resolve([
			new MyTreeItem('Build', 'moonbit-tasks.onViewItemClick'),
			new MyTreeItem('Test', 'moonbit-tasks.onViewItemClick'),
			new MyTreeItem('Run', 'moonbit-tasks.onViewItemClick'),
			new MyTreeItem('Clean', 'moonbit-tasks.onViewItemClick'),
			new MyTreeItem('Fmt', 'moonbit-tasks.onViewItemClick'),
			new MyTreeItem('Coverage', 'moonbit-tasks.onViewItemClick'),
		]);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}

let myTerminal: vscode.Terminal | undefined;

async function searchForSignatureFile(fileDir: string, backOrForward: boolean): Promise<string> {
	let projectDir = "";
	if (fileDir.length > 0) {
		const targetFilePath = path.join(fileDir, signatureFileName);
		try {
			await fsPromises.access(targetFilePath);
			projectDir = fileDir;
		} catch (_) {
			if (backOrForward) {
				const parentDir = path.dirname(fileDir);
				try {
					projectDir = await searchForSignatureFile(parentDir, true);
				} catch (_) {
				}
			}
			else {
				try {
					// Get the contents of the workspace folder
					const folderUri = vscode.Uri.from({scheme: 'file', path: fileDir})
					const contents = await vscode.workspace.fs.readDirectory(folderUri);
	
					// Iterate through each item and check if it's a directory
					for (const [name, type] of contents) {
						if (type === vscode.FileType.Directory) {
							const subdirPath = path.join(fileDir, name);
							try {
								projectDir = await searchForSignatureFile(subdirPath, false);
								if (projectDir.length > 0) {
									break;
								}
							} catch (_) {
							}
						}
					}
				} catch (_) {
				}	
			}
		}
	}

	return projectDir;
}

async function smartGetProjectPath(fileDir: string): Promise<string> {
	// Get the workspace folders
	const workspaceFolders = vscode.workspace.workspaceFolders;
	let projectDir = "";

	if (workspaceFolders) {
		// Check each workspace folder to see if the file is in it
		const rootDir = workspaceFolders.find(folder => {
			const folderPath = folder.uri.fsPath;
			return fileDir.startsWith(folderPath);  // Check if the file is within this folder
		});

		if (rootDir) {
            try {
				projectDir = await searchForSignatureFile(rootDir.uri.fsPath, false);
            } catch (err) {
                vscode.window.showInformationMessage(`Error while checking project file: ${err}`);
			}
		} else {
			// locate signature file from current to parent
			try {
				projectDir = await searchForSignatureFile(fileDir, true);
			} catch (err) {
                vscode.window.showInformationMessage(`Error while checking project file: ${err}`);
			}
		}
	}

	return projectDir;
}

async function smartTaskRun(cmd: string) {
	// Get the current active file in the Explorer
	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor) {
		const filePath = activeEditor.document.uri.fsPath;
		const fileDir = require('path').dirname(filePath);  // Get the directory of the current file
		try {
			let projectDir = undefined;
			if (signatureFileName == path.basename(activeEditor.document.fileName)) {
				projectDir = fileDir;
			}
			else {
				projectDir = await smartGetProjectPath(fileDir);
			}

			vscode.window.showInformationMessage(`Running task in directory: ${projectDir}`);

			// Example shell command to be executed in the current file's directory
			cmd = cmd.toLowerCase();
			if (cmd == 'run') {
				cmd = 'run src/main'
			}
			else if (cmd == 'coverage') {
				cmd = `test --enable-coverage; moon coverage report`
			}
			const shellCommand = `moon ${cmd}`;

			// Run the shell command in the file's directory
			runCmdInTerminal(shellCommand, projectDir);
		} catch (err) {
			vscode.window.showWarningMessage(`No project file found: ${err}`);
		}
	} else {
		vscode.window.showWarningMessage("No active file found.");
	}
}

function runCmdInTerminal(cmd: string, cwd: string) {
	if (!myTerminal || myTerminal.exitStatus) {
		myTerminal = vscode.window.createTerminal('Moonbit tasks Terminal');
	}

	myTerminal.show();  // Show the terminal

	// Run a shell command in the terminal
	myTerminal.sendText(`cd "${cwd}"`);
	myTerminal.sendText(cmd);
}