import * as vscode from 'vscode';
import * as path from 'path';
import { access as fsAccess, constants as fsConstants, promises as fsPromises } from 'fs';

import * as helper from './helper';
import * as langDef from './language_def';
import { asyncRefereshSmartTasksDataProvider, smartTasksDir } from "./language_handler";
import { logTimeStamp } from './extension';

export class projectDef {
	rootPath: string | undefined;
	langID: string | undefined;
	handler: langDef.handlerInfo | undefined;
	error: string | undefined;

	constructor(root:string | undefined, langID: string | undefined, handler:langDef.handlerInfo | undefined) {
		this.langID = langID;
		this.rootPath = root;
		this.handler = handler;
	}
}

// Search project at designated directory
async function asyncSearchProjectAtDirectory(fileDir: string): Promise<projectDef | undefined> {
	/// Just search files within a dir, no subdir yet
	/// extensions can be written as '*.nimble' '*.json' '*.csproj'
	async function asyncSearchFilesByExtension(folderPath: string, extensionExp: string): Promise<boolean> {
		try {
			if (extensionExp.length > 0) {
				if ('*' === extensionExp[0]) {
					extensionExp = extensionExp.slice(1);
				}
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
								fSigFileFound = await asyncSearchFilesByExtension(fileDir, signature);
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
					return new projectDef(fileDir, languageName, cmdHandler);
				}
			}
		}
	}

	return undefined;
}

// check if the active document is a signature of a project,
// otherwise search project from the document dir and up within
// workspace
export async function asyncDetectProjectForDocumentOrDirectory(documentPathOrDir: string) : Promise<projectDef|undefined> {
	// check if a target file is signature of a project
	function checkSignature(filePath: string) : projectDef | undefined {	
		let found = false;
		let basename = path.basename(filePath);
		for (let [languageName, cmdHandler] of langDef.languageHandlerMap) {
			// *.nimble
			if (langDef.handlerInfo.isValid(cmdHandler) && helper.isValidString(cmdHandler.signatureFilePattern)) {
				const extensions = cmdHandler.signatureFilePattern.split('|');
				for (let ext of extensions) {
					found = (ext.length > 0) &&
						((ext[0] !== '*') ? cmdHandler.signatureFilePattern === basename
						: basename.endsWith(ext.slice(1))
					);

					if (found) {
						return new projectDef(path.dirname(filePath), languageName, cmdHandler);
					}
				}
			}
		}

		return undefined;
	}

	let projectFound : projectDef | undefined;
	try {
		const stats = await fsPromises.stat(documentPathOrDir);
		if (stats.isFile()) {
			projectFound = checkSignature(documentPathOrDir);
		}

		if (projectFound === undefined || langDef.handlerInfo.notValid(projectFound.handler)) {
			const fileDir = stats.isFile() ? path.dirname(documentPathOrDir) : documentPathOrDir;  // Get the directory of the current file
			projectFound = await asyncSearchSignatureAtDirectoryAndUpWithinWorkspace(fileDir);
		}
	} catch (err) {
		console.log(`[${logTimeStamp()}] Error occurred while searching project signature file: ${err}`);
	}
	return projectFound;
}

async function asyncSearchSignatureAtDirectoryAndUpWithinWorkspace(fileDir: string) : Promise<projectDef | undefined> {
	let projectDef: projectDef | undefined;
	let currentFolder = fileDir;
	while (true) {
		try {
			projectDef = await asyncSearchProjectAtDirectory(currentFolder);
		} catch (err) {
			console.error(`in search project at ${currentFolder}, ${err}`);
		}

		if (projectDef && langDef.handlerInfo.isValid(projectDef.handler)) {
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
	return projectDef;
}

/// If current file is a signature, or a signature in current dir or current project root dir or any project root dir, do the task
export async function asyncSmartTaskRun(cmd: string, view:vscode.Webview) {
	if (helper.isValidString(smartTasksDir)) {
		asyncSafeRunInTerminal(cmd, smartTasksDir, view);
	}
}

export async function asyncSafeRunInTerminal(cmd: string, cwd: string, view:vscode.Webview) {
	try {
		if (cmd && cwd) {
			await asyncRunCmdInTerminal(cmd, cwd, view);
		}
	} catch (error) {
		console.error(`cmd: ${cmd}, error: ${error}`);
	}
}

const MB_TERMINAL_NAME : string = 'Moonbit-tasks extension Terminal';
let myTerminal: vscode.Terminal | undefined;

async function asyncRunCmdInTerminal(cmd: string, cwd: string, view:vscode.Webview) {
	if (!myTerminal || myTerminal.exitStatus) {
		// Try find by name for ext reenable/reinstall
		myTerminal = vscode.window.terminals.find((t) => t.name === MB_TERMINAL_NAME);
	}
	
	if (!myTerminal || myTerminal.exitStatus) {
		myTerminal = vscode.window.createTerminal({
			name: MB_TERMINAL_NAME,
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

export async function asyncActiveDocumentChangesHandler(editor:any) {
	if (editor) {
		let documentPath = editor.document.uri.fsPath;
		let documentDir = path.dirname(documentPath);
		let refresh = lastActiveDocumentDir !== documentDir;

		// If path changes, rescan for project type
		if (refresh) {
			lastActiveDocumentDir = documentDir;
			asyncRefereshSmartTasksDataProvider(documentPath);
		}
	} else {
		// console.log("No active editor.");
	}
	return;
}