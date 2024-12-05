import * as vscode from 'vscode';
import * as path from 'path';
import { access as fsAccess, constants as fsConstants, promises as fsPromises } from 'fs';

import * as helper from './helper';
import * as langDef from './language_def';
import { refereshSmartTasksDataProvider, smartTasksDir } from "./language_handler";

export class projectDef {
	rootPath: string | undefined;
	handler: langDef.handlerInfo | undefined;
	error: string | undefined;

	constructor(root:string | undefined, handler:langDef.handlerInfo | undefined) {
		this.rootPath = root;
		this.handler = handler;
	}
}

let myTerminal: vscode.Terminal | undefined;

// Search project at designated directory
async function searchProjectAtDirectory(fileDir: string): Promise<langDef.handlerInfo | undefined> {
	/// Just search files within a dir, no subdir yet
	/// extensions can be written as '*.nimble' '*.json' '*.csproj'
	async function searchFilesByExtension(folderPath: string, extensionExp: string): Promise<boolean> {
		try {
			let files = await fsPromises.readdir(folderPath);
			for (const file of files) {
				if (file.endsWith(extensionExp)) {
					const fullPath = path.join(folderPath, file);
					const stats = await fsPromises.stat(fullPath); // stat() will follow symbolic link chain
					if (stats.isFile()) {
						return true;
					}
				}
			}
		}
		catch(e) {
			if (!`${e}`.startsWith('Error: ENOENT')) {
				//vscode.window.showWarningMessage(`Search signature files by extension failed: ${e}`);
			}
		}

		return false;
	}

	if (fileDir.length > 0) {
		for (let [languageName, cmdHandler] of langDef.languageHandlerMap) {
			if (langDef.handlerInfo.isValid(cmdHandler) && helper.isValidString(cmdHandler.signatureFilePattern)) {
				let fSigFileFound = false;
				try {
					/// SignatureFilePattern can be written as '*.nimble|*.json|*.csproj'
					// const extensionExp = '*.a|*.b|*.c';
					// const zigExp = 'build.zig|build.zig.zon';
					const signatures = cmdHandler.signatureFilePattern.split('|').map(item => item.trim());
					for(const signature of signatures) {
						if (signature.length > 0) {
							if (signature[0] !== '*') {
								const targetFilePath = path.join(fileDir, signature);
								try {
									await fsPromises.access(targetFilePath);
									fSigFileFound = true;
								}
								catch (e) {
									if (!`${e}`.startsWith('Error: ENOENT')) {
										//vscode.window.showWarningMessage(`Search for project signature file failed: ${e}`);
									}
								}
							}
							else {
								fSigFileFound = await searchFilesByExtension(fileDir, signature);
							}
						}
					}
				}
				catch (e) {
					if (!`${e}`.startsWith('Error: ENOENT')) {
						//vscode.window.showWarningMessage(`Search for project signature file failed: ${e}`);
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

// check if the active document is a signature of a project,
// otherwise search project from the document dir and up within
// workspace
export async function asyncDetectProjectForActiveDocument() : Promise<projectDef|undefined> {
	let projectFound : projectDef | undefined;

	// Get the current active file in the Explorer
	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor) {
		const filePath = activeEditor.document.uri.fsPath;
		const fileDir = path.dirname(filePath);  // Get the directory of the current file
		try {
			projectFound = checkSignature(filePath);

			if (projectFound == undefined || langDef.handlerInfo.notValid(projectFound.handler)) {
				projectFound = await searchSignatureAtDirectoryAndUpWithinWorkspace(fileDir);
			}

			// if (projectFound == undefined || langDef.handlerInfo.notValid(projectFound.handler)) {
			// 	// The root path that contain current document
			// 	// Get the workspace folders
			// 	projectFound = await searchSignatureFromWorkSpace(fileDir);
			// }
			return projectFound;
		} catch (err) {
			//vscode.window.showWarningMessage(`Error occurred while searching project signature file: ${err}`);
		}
	} else {
		//vscode.window.showWarningMessage("No active file found.");
	}
}

// async function searchSignatureFromWorkSpace(fileDir: string) : Promise<projectDef|undefined> {
// 	let projectDir : string | undefined;
// 	let handler : langDef.handlerInfo | undefined;

// 	const workspaceFolders = vscode.workspace.workspaceFolders;
// 	if (workspaceFolders !== undefined && workspaceFolders !== null) {
// 		// Check each workspace folder to see if the file is in it and keep the folder that has maximum length
// 		let rootDir: vscode.WorkspaceFolder | undefined;
// 		let maxPathLength = 0;
// 		workspaceFolders.forEach(folder => {
// 			const pathLength = folder.uri.fsPath.length;
// 			if (fileDir.startsWith(folder.uri.fsPath) && pathLength > maxPathLength) {
// 				maxPathLength = pathLength;
// 				rootDir = folder;
// 			}
// 		});
// 		if (rootDir != undefined && rootDir.uri.fsPath.length > 0) {
// 			handler = await searchProjectAtDirectory(rootDir.uri.fsPath);
// 			if (langDef.handlerInfo.isValid(handler)) {
// 				projectDir = rootDir.uri.fsPath;
// 			}
// 			else {
// 				for (let folder of workspaceFolders) {
// 					handler = await searchProjectAtDirectory(folder.uri.fsPath);
// 					if (langDef.handlerInfo.isValid(handler)) {
// 						projectDir = folder.uri.fsPath;
// 						break;
// 					}
// 				}
// 			}
// 		}
// 	}
// 	return  new projectDef(projectDir, handler);
// }

async function searchSignatureAtDirectoryAndUpWithinWorkspace(fileDir: string) : Promise<projectDef> {
	let handler: langDef.handlerInfo | undefined;
	let projectDir: string | undefined;
	let currentFolder = fileDir;
	while (true) {
		handler = await searchProjectAtDirectory(currentFolder);
		if (langDef.handlerInfo.isValid(handler)) {
			projectDir = currentFolder;
		}
		else {
			const parentFolder = path.dirname(currentFolder);
			if (parentFolder.length < currentFolder.length) {
				const workspaceFolders = vscode.workspace.workspaceFolders;
				if (workspaceFolders !== undefined && workspaceFolders !== null) {
					const firstFoundRootDir = workspaceFolders.find(folder => {
						return parentFolder.startsWith(folder.uri.fsPath); // Check if the file is within this folder
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
	return new projectDef(projectDir, handler);
}

// check if a target file is signature of a project
function checkSignature(filePath: string) : projectDef | undefined {	
	let found = false;
	let basename = path.basename(filePath);
	for (let [_languageName, cmdHandler] of langDef.languageHandlerMap) {
		// *.nimble
		if (langDef.handlerInfo.isValid(cmdHandler) && helper.isValidString(cmdHandler.signatureFilePattern)) {
			const extensions = cmdHandler.signatureFilePattern.split('|');
			for (let ext of extensions) {
				found = (ext.length > 0) &&
					((ext[0] != '*') ? cmdHandler.signatureFilePattern == basename
					 : basename.endsWith(ext.slice(1))
				);

				if (found) {
					return new projectDef(path.dirname(filePath), cmdHandler);
				}
			}
		}
	}

	return undefined;
}

/// If current file is a signature, or a signature in current dir or current project root dir or any project root dir, do the task
export async function asyncSmartTaskRun(cmd: string, view:vscode.Webview) {
	if (helper.isValidString(smartTasksDir)) {
		asyncRunCmdInTerminal(cmd, smartTasksDir, view);
	}
}

async function asyncRunCmdInTerminal(cmd: string, cwd: string, view:vscode.Webview) {
	if (!myTerminal || myTerminal.exitStatus) {
		myTerminal = vscode.window.createTerminal({
			name:'Moonbit-tasks extension Terminal',
			shellPath: await helper.asyncGetShellPath(),
			iconPath:new vscode.ThemeIcon('tools')
		});
	}

	myTerminal.show();  // Show the terminal

	// Run a shell command in the terminal
	if (helper.isValidString(cwd)) {
		// Need check if diectory exists?
		cwd = cwd.replace(/\\/g, "\\\\");
		myTerminal.sendText(`cd "${cwd}"`);
	}
	else {
		view.postMessage({ 
			type: 'error', 
			message: 'Invalid CWD for command'
		});
	}

	if (helper.isValidString(cmd)) {
		myTerminal.sendText(cmd?cmd:"");
	}
	else {
		view.postMessage({ 
			type: 'error', 
			message: 'Invalid CMD for task'
		});
	}
}

let lastActiveDocumentDir : string = "";

export async function activeDocumentChanges(editor:any) {
	if (editor) {
		let documentDir = path.dirname(editor.document.uri.fsPath);
		let refresh = lastActiveDocumentDir != documentDir;

		// If path changes, rescan for project type
		if (refresh) {
			lastActiveDocumentDir = documentDir;
			refereshSmartTasksDataProvider(documentDir);
		}
	} else {
		// console.log("No active editor.");
	}
	return;
}