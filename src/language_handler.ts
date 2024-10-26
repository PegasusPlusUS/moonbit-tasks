
import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fsPromises } from 'fs';

function isValidString(str: string | undefined | null): boolean {
    return str !== undefined && str !== null && str.trim().length > 0;
}

function isValidMap<K, V>(map: Map<K, V> | undefined | null): boolean {
    return map !== undefined && map !== null && map.size > 0;
}

function cmdMacroHandler(cmdStr: string | undefined) : string | undefined {
	return cmdStr;
}

//interface handlerInfo {
class handlerInfo {
	signatureFileName : string;
	projectManagerCmd ?: string;
	macroHandler ?: Map<string, string>;
	constructor(sigFileName: string, projectManager: string | undefined, cmdHandler: Map<string, string> | undefined) {
		this.signatureFileName = sigFileName;
		this.projectManagerCmd = projectManager;
		this.macroHandler = cmdHandler;
	}

	getFullCmd(cmdType: string) : string | undefined {
		cmdType = cmdType.toLowerCase();
		let macroedCmd = cmdMacroHandler(this.macroHandler?.get(cmdType));
		if (!isValidString(macroedCmd)) {
            if (cmdType == 'run') {
                cmdType = 'run src/main'
            }
            else if (cmdType == 'coverage') {
                cmdType = `test --enable-coverage; moon coverage report`
            }
            return this.projectManagerCmd + " " + cmdType;
		}
		else {
			return this.projectManagerCmd + " " + macroedCmd;
		}
	}

	static isValid(h: handlerInfo | undefined) : boolean {
		return h !== undefined && h !== null;
	}

	static notValid(h: handlerInfo | undefined) : boolean {
		return !this.isValid(h);
	}
}

// One signature might have several handler, and there might be multiple signature files in the same dir for several handlerss
//(handler, signatureFileName)
//(handler, command_set)
//command_set is (command, option_set)
//macro_set is (macro, value)
let languageHandlerMap: Map<string, handlerInfo> = new Map();
function initHandlerMap() {
	// ToDo: read from setting
	const myMap: Map<string, handlerInfo> = new Map([
		['Moonbit', new handlerInfo('moon.mod.json', 'moon', undefined)],
		['Rust', new handlerInfo('Cargo.toml', 'cargo', undefined)],
		['Nim', new handlerInfo('*.nimble', 'nimble', undefined)],
		['Cangjie', new handlerInfo('cjpm.toml', 'cjpm', undefined)],
		['Zig', new handlerInfo('build.zig.zon', 'zig', new Map<string, string>([['run', 'run src/main.zig'],['test', 'test src/main.zig'],]))],
		['Gleam', new handlerInfo('gleam.toml', 'gleam', undefined)],
		['Go', new handlerInfo('go.mod', 'go', undefined)],
		['Wa', new handlerInfo('wa.mod', 'wa', undefined)],
		['Java', new handlerInfo('pom.xml', 'mvn', new Map<string, string>([['build', 'compile'],]))],
		['Npm', new handlerInfo('package.json', 'npm run', new Map<string, string>([['build', 'compile'],]))],
		['TypeScript', new handlerInfo('tsconfig.json', 'tsc', undefined)],
	]);	
	myMap.forEach((value, key) => {
		languageHandlerMap.set(key, value);
	});
}


let myTerminal: vscode.Terminal | undefined;

async function searchForSignatureFile(fileDir: string, backOrForward: boolean, sigFileName: string): Promise<string> {
	let projectDir = "";
	if (fileDir.length > 0) {
		const targetFilePath = path.join(fileDir, sigFileName);
		try {
			await fsPromises.access(targetFilePath);
			projectDir = fileDir;
		} catch (_) {
			if (backOrForward) {
				const parentDir = path.dirname(fileDir);
				try {
					projectDir = await searchForSignatureFile(parentDir, true, sigFileName);
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
								projectDir = await searchForSignatureFile(subdirPath, false, sigFileName);
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

async function smartSearchProjectRoot(fileDir: string, sigFileName: string): Promise<string> {
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
				projectDir = await searchForSignatureFile(rootDir.uri.fsPath, false, sigFileName);
            } catch (err) {
                vscode.window.showInformationMessage(`Error while checking project file: ${err}`);
			}
		} else {
			// locate signature file from current to parent
			try {
				projectDir = await searchForSignatureFile(fileDir, true, sigFileName);
			} catch (err) {
                vscode.window.showInformationMessage(`Error while checking project file: ${err}`);
			}
		}
	}

	return projectDir;
}

async function smartGetProjectPath(fileDir: string): Promise<handlerInfo | undefined> {
	if (fileDir.length > 0) {
		for (let [languageName, cmdHandler] of languageHandlerMap) {
			if (handlerInfo.isValid(cmdHandler)) {
				const targetFilePath = path.join(fileDir, cmdHandler.signatureFileName);
				try {
					await fsPromises.access(targetFilePath);
					return cmdHandler;
				} catch (_) {
				}
			}
		}
	}

	return undefined;
}

/// If current file is a signature, or a signature in current dir or current project root dir or any project root dir, do the task 
async function smartTaskRun(cmd: string) {
	let projectDir :string|undefined;
	let handler :handlerInfo|undefined;
	//let languageName :string|undefined;

	// Get the current active file in the Explorer
	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor) {
		const filePath = activeEditor.document.uri.fsPath;
		const fileDir = require('path').dirname(filePath);  // Get the directory of the current file
		try {
			for (let [_languageName, cmdHandler] of languageHandlerMap) {
				if (handlerInfo.isValid(cmdHandler) && cmdHandler.signatureFileName == path.basename(activeEditor.document.fileName)) {
					projectDir = fileDir;
					handler = cmdHandler;
					break;
				}
			}

			if (handlerInfo.notValid(handler)) {
				handler = await smartGetProjectPath(fileDir);
                if (handlerInfo.isValid(handler)) {
    				projectDir = fileDir;
                }
			}

			if (handlerInfo.notValid(handler)) {
				// The root path that contain current document
				// Get the workspace folders
				const workspaceFolders = vscode.workspace.workspaceFolders;
				if (workspaceFolders) {
					// Check each workspace folder to see if the file is in it
					const rootDir = workspaceFolders.find(folder => {
						const folderPath = folder.uri.fsPath;
						return fileDir.startsWith(folderPath);  // Check if the file is within this folder
					});

					if (rootDir && rootDir.uri.fsPath.length > 0) {
						handler = await smartGetProjectPath(rootDir.uri.fsPath);
						if (handlerInfo.isValid(handler)) {
							projectDir = rootDir.uri.fsPath;
						}
						else {
							for (let folder of workspaceFolders) {
								handler = await smartGetProjectPath(folder.uri.fsPath);
								if (handlerInfo.isValid(handler)) {
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

	if (isValidString(projectDir) && handlerInfo.isValid(handler)) {
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
	if (!myTerminal || myTerminal.exitStatus) {
		myTerminal = vscode.window.createTerminal('Moonbit tasks Terminal');
	}

	myTerminal.show();  // Show the terminal

	// Run a shell command in the terminal
	if (isValidString(cwd)) {
		// Need check if diectory exists?
		myTerminal.sendText(`cd "${cwd}"`);
	}
	else {
		vscode.window.showErrorMessage("Invalid CWD for command");
	}

	if (isValidString(cmd)) {
		myTerminal.sendText(cmd?cmd:"");
	}
	else {
		vscode.window.showErrorMessage("Invalid CMD for task");
	}
}

export function initExtension(context: vscode.ExtensionContext) {
	initHandlerMap();
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
