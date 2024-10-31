import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fsPromises } from 'fs';

import * as helper from './helper'
import * as langDef from './language_def'

let myTerminal: vscode.Terminal | undefined;

async function smartGetProjectPath(fileDir: string): Promise<langDef.handlerInfo | undefined> {
	if (fileDir.length > 0) {
		for (let [languageName, cmdHandler] of langDef.languageHandlerMap) {
			if (langDef.handlerInfo.isValid(cmdHandler) && helper.isValidString(cmdHandler.signatureFileName)) {
				let fSigFileFound = false;
				try {
					if (cmdHandler.signatureFileName[0] != '*') {
						const targetFilePath = path.join(fileDir, cmdHandler.signatureFileName);
						await fsPromises.access(targetFilePath);
						fSigFileFound = true;
					}
					else {
						fSigFileFound = await searchFilesByExtension(fileDir, cmdHandler.signatureFileName);
					}
				}
				catch (e) {
					//const fsErr = e as fs.FileError
					if (!`${e}`.startsWith('Error: ENOENT')) {
						vscode.window.showWarningMessage(`Search for project signature file failed: ${e}`);
					}
				}

				if (fSigFileFound) {
					return cmdHandler;
				}
			}
		}
	}

	return undefined;
}

/// Just search files within a dir, no subdir yet
/// extensions can be written as '*.nimble|*.json|*.csproj'
async function searchFilesByExtension(folderPath: string, extensionExp: string): Promise<boolean> {
	// const extensionExp = '*.a|*.b|*.c';
	const extensions = extensionExp.split('|').map(item => item.slice(1));
	
	try {
		let files = await fsPromises.readdir(folderPath);
		for (const file of files) {
			const fullPath = path.join(folderPath, file);
			const stats = await fsPromises.stat(fullPath);
			if (stats.isDirectory()) {
				// Recursive search if needed
			}
			else {
				for (let ext of extensions) {
					if (file.endsWith(ext))
						return true;
				}				
			}
		}
	}
	catch(e) {
		if (!`${e}`.startsWith('Error: ENOENT')) {
			vscode.window.showWarningMessage(`Search signature files by extension failed: ${e}`);
		}
	}

	return false;
}

/// If current file is a signature, or a signature in current dir or current project root dir or any project root dir, do the task 
async function smartTaskRun(cmd: string) {
	let projectDir :string|undefined;
	let handler :langDef.handlerInfo|undefined;
	//let languageName :string|undefined;

	// Get the current active file in the Explorer
	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor) {
		const filePath = activeEditor.document.uri.fsPath;
		const fileDir = path.dirname(filePath);  // Get the directory of the current file
		try {
			for (let [_languageName, cmdHandler] of langDef.languageHandlerMap) {
				// *.nimble
				if (langDef.handlerInfo.isValid(cmdHandler) && helper.isValidString(cmdHandler.signatureFileName)) {
					let fSigFileFound = false;
					if (cmdHandler.signatureFileName[0] !== '*') {
						fSigFileFound = cmdHandler.signatureFileName == path.basename(activeEditor.document.fileName);
					}
					else {
						const extensions = cmdHandler.signatureFileName.split('|').map(item => item.slice(1));
						for (let ext of extensions) {
							if (path.basename(activeEditor.document.fileName).endsWith(ext)) {
								fSigFileFound = true;
								break;
							}
						}

						// extension search will be done at stage 2. First stage just check current active file
						//fSigFileFound = await searchFilesByExtension(fileDir, cmdHandler.signatureFileName);
					}

					if (fSigFileFound) {
						projectDir = fileDir;
						handler = cmdHandler;
						break;
					}
				}
			}

			if (langDef.handlerInfo.notValid(handler)) {
				let currentFolder = fileDir;
				while(true) {
					handler = await smartGetProjectPath(currentFolder);
					if (langDef.handlerInfo.isValid(handler)) {
						projectDir = currentFolder;
					}
					else {
						const parentFolder = path.dirname(currentFolder);
						if (parentFolder.length < currentFolder.length) {
							const workspaceFolders = vscode.workspace.workspaceFolders;
							if (workspaceFolders !== undefined && workspaceFolders !== null) {
								const firstFoundRootDir = workspaceFolders.find(folder => {
									return parentFolder.startsWith(folder.uri.fsPath);  // Check if the file is within this folder
								});
								if (firstFoundRootDir !== undefined) {
									currentFolder = parentFolder;
									continue;
								}
							}
						}
					}
					break;
				}
			}

			if (langDef.handlerInfo.notValid(handler)) {
				// The root path that contain current document
				// Get the workspace folders
				const workspaceFolders = vscode.workspace.workspaceFolders;
				if (workspaceFolders !== undefined && workspaceFolders !== null) {
					// Check each workspace folder to see if the file is in it and keep the folder that has maximum length
					let rootDir: vscode.WorkspaceFolder | undefined = undefined;
					const firstFoundRootDir = workspaceFolders.find(folder => {
						return false;
						//const folderPath = folder.uri.fsPath;
						//return fileDir.startsWith(folderPath);  // Check if the file is within this folder
					});
					rootDir = firstFoundRootDir;
					let maxPathLength = 0;
					//let maxPathRoot: vscode.WorkspaceFolder | undefined = undefined;
					workspaceFolders.forEach(folder => {
						const pathLength = folder.uri.fsPath.length;
						if (fileDir.startsWith(folder.uri.fsPath) && pathLength > maxPathLength) {
							//maxPathRoot = folder;
							maxPathLength = pathLength;
							//rootDir = maxPathRoot;
							rootDir = folder;
						}
					});
					// if (maxPathRoot !== undefined && maxPathRoot !== null) {
					// 	rootDir = firstFoundRootDir;
					// 	//rootDir = maxPathRoot; // ? maxPathRoot : undefined;
					// }
					if (rootDir !== undefined && rootDir !== null && rootDir.uri.fsPath.length > 0) {
						handler = await smartGetProjectPath(rootDir.uri.fsPath);
						if (langDef.handlerInfo.isValid(handler)) {
							projectDir = rootDir.uri.fsPath;
						}
						else {
							for (let folder of workspaceFolders) {
								handler = await smartGetProjectPath(folder.uri.fsPath);
								if (langDef.handlerInfo.isValid(handler)) {
									projectDir = folder.uri.fsPath;
									break;
								}
							}
						}
					}
				}
			}
		} catch (err) {
			vscode.window.showWarningMessage(`Error occurred while searching project signature file: ${err}`);
		}
	} else {
		vscode.window.showWarningMessage("No active file found.");
	}

	if (helper.isValidString(projectDir) && langDef.handlerInfo.isValid(handler)) {
		vscode.window.showInformationMessage(`Running ${handler?.projectManagerCmd} in: ${projectDir}`);

		// Example shell command to be executed in the current file's directory
		const shellCommand = handler?.getFullCmd(cmd);

		// Run the shell command in the file's directory
		runCmdInTerminal(shellCommand, projectDir);
	}
	else {
		vscode.window.showWarningMessage(`Can't find any project signature file.`);
	}
}


function runCmdInTerminal(cmd: string | undefined, cwd: string|undefined) {
	function getShellPath(): string {
		const os = require("os");
		if (os.platform() === 'win32') {
			return 'cmd.exe';
		} else if (os.platform() === 'darwin') {
			return '/bin/zsh';
		} else {
			return '/bin/bash';
		}
	}

	if (!myTerminal || myTerminal.exitStatus) {
		myTerminal = vscode.window.createTerminal({
			name:'Moonbit-tasks extention Terminal',
			shellPath:getShellPath(),
			iconPath:new vscode.ThemeIcon('tools')
		});
	}

	myTerminal.show();  // Show the terminal

	// Run a shell command in the terminal
	if (helper.isValidString(cwd)) {
		// Need check if diectory exists?
		myTerminal.sendText(`cd "${cwd}"`);
	}
	else {
		vscode.window.showErrorMessage("Invalid CWD for command");
	}

	if (helper.isValidString(cmd)) {
		myTerminal.sendText(cmd?cmd:"");
	}
	else {
		vscode.window.showErrorMessage("Invalid CMD for task");
	}
}

export function initExtension(context: vscode.ExtensionContext) {
	langDef.initHandlerMap();
	registerTaskProvider(context);
	registerTreeView(context);

	// Command handler for clicking on a view item
	registerClickHandler(context);
}

async function getCustomTasks(): Promise<vscode.Task[]> {
    let tasks: vscode.Task[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;
    // Retrieve the user-defined setting
    const config = vscode.workspace.getConfiguration('moonbit-tasks');
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

function registerTreeView(context: vscode.ExtensionContext) {
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

function registerTaskProvider(context: vscode.ExtensionContext) {
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
export class MyTreeDataProvider implements vscode.TreeDataProvider<MyTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MyTreeItem | undefined> = new vscode.EventEmitter<MyTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<MyTreeItem | undefined> = this._onDidChangeTreeData.event;

    getTreeItem(element: MyTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MyTreeItem): Thenable<MyTreeItem[]> {
        return Promise.resolve([
			new MyTreeItem('Build', 'moonbit-tasks.onViewItemClick'),
			new MyTreeItem('Check', 'moonbit-tasks.onViewItemClick'),
			new MyTreeItem('Test', 'moonbit-tasks.onViewItemClick'),
			new MyTreeItem('Coverage', 'moonbit-tasks.onViewItemClick'),
			new MyTreeItem('Run', 'moonbit-tasks.onViewItemClick'),
			new MyTreeItem('Clean', 'moonbit-tasks.onViewItemClick'),
			new MyTreeItem('Fmt', 'moonbit-tasks.onViewItemClick'),
			new MyTreeItem('Update', 'moonbit-tasks.onViewItemClick'),
		]);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}
