import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import * as fs from 'fs';

import * as helper from './helper'

let configChangeListener: vscode.Disposable | undefined;
let extensionContext: vscode.ExtensionContext | undefined; // Store context for later use

export function activate(context: vscode.ExtensionContext) {
    extensionContext = context; // Save the context for later use
	
	asyncInitLangDef();
}

const configNameLangDef = "moonbit-tasks.languageHandlerDef";

function startWatchingLangDefChanges() {
    // Check if listener already exists, if so, dispose it
    if (configChangeListener) {
        configChangeListener.dispose();
    }

    // Start watching for configuration changes
    configChangeListener = vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(configNameLangDef)) {
            vscode.window.showInformationMessage("Language handler def has changed, reloading...");
			asyncLoadLangDef();
        }
    });

    // Push the new listener to the context's subscriptions
    extensionContext?.subscriptions.push(configChangeListener);

    fs.unwatchFile(fullFilePathNameLangDef);
	fs.watchFile(fullFilePathNameLangDef, (curr, prev) => {
		if (curr.mtime !== prev.mtime) {
			vscode.window.showInformationMessage('Language definition has changed, reloading...');
			asyncLoadLangDef();
		}
	});
}

export function deactivate() {
    // Stop watching for configuration changes if needed
    stopWatchingLangDefChanges();
}

// Example function to stop watching
function stopWatchingLangDefChanges() {
    configChangeListener?.dispose();
    configChangeListener = undefined; // Clear the reference

	fs.unwatchFile(fullFilePathNameLangDef);
}

/// using macro to build cmd, pwd, actFile, ^ etc
function cmdMacroHandler(cmdStr: string | undefined) : string | undefined {
	return cmdStr;
}

//interface handlerInfo {
export class handlerInfo {
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
		if (!helper.isValidString(macroedCmd)) {
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

	toJSON(): object {
		return {
			signatureFileName : this.signatureFileName,
			projectManagerCmd : helper.isValidString(this.projectManagerCmd) ? this.projectManagerCmd : null,
			//macroHandler : helper.isValidMap(this.macroHandler) ? Object.fromEntries(this.macroHandler) : null
            macroHandler : this.macroHandler && helper.isValidMap(this.macroHandler) ? Object.fromEntries(this.macroHandler) : null
		};
	}

	static fromJSON(json: any): handlerInfo {
		return new handlerInfo(json.signatureFileName, json.projectManagerCmd, json.macroHandler ? new Map(Object.entries(json.macroHandler)) : json.macroHandler);
	}
}

// One signature might have several handler, and there might be multiple signature files in the same dir for several handlerss
//(handler, signatureFileName)
//(handler, command_set)
//command_set is (command, option_set)
//macro_set is (macro, value)
export let languageHandlerMap: Map<string, handlerInfo> = new Map();
async function asyncInitLangDef() {
	// Try load definition, if none, init default
	try {
		await asyncLoadLangDef();
	}
	catch(e) {
		vscode.window.showInformationMessage(`Load language definition failed: ${e}`);
	}

	if (!helper.isValidMap(languageHandlerMap)) {
		const myMap: Map<string, handlerInfo> = new Map([
			['Moonbit', new handlerInfo('moon.mod.json', 'moon', undefined)],
			['Rust', new handlerInfo('Cargo.toml', 'cargo', new Map<string, string>([['run', 'run src/main'],['coverage', 'tarpaulin'],]))],
			['Nim', new handlerInfo('*.nimble', 'nimble', new Map<string, string>([['run', 'run'], ['fmt',"for /r %f in (*.nim) do ( nimpretty --backup:off %f )"],["coverage", "testament --backend:html --show-times --show-progress --compile-time-tools --nim:tests"],]))],
			['Cangjie', new handlerInfo('cjpm.toml', 'cjpm', new Map<string, string>([['run', 'run']]))],
			['Zig', new handlerInfo('build.zig.zon', 'zig', new Map<string, string>([['run', 'run src/main.zig'],['test', 'test src/main.zig'],]))],
			['Gleam', new handlerInfo('gleam.toml', 'gleam', new Map<string, string>([['run', 'run'], ['fmt', 'format']]))],
			['Go', new handlerInfo('go.mod', 'go', undefined)],
			['Wa', new handlerInfo('wa.mod', 'wa', undefined)],
			['Java', new handlerInfo('pom.xml', 'mvn', new Map<string, string>([['build', 'compile'],]))],
			['Npm', new handlerInfo('package.json', 'npm run', new Map<string, string>([['build', 'compile'],]))],
			['TypeScript', new handlerInfo('tsconfig.json', 'tsc', undefined)],
			['Swift', new handlerInfo('Package.swift', 'swift', undefined)]
		]);

		myMap.forEach((value, key) => {
			languageHandlerMap.set(key, value);
		});
		// do not wait here
		asyncSaveLangDef();
	}
}

const fileNameLangDef = 'languageHandler.json';
const fullFilePathNameLangDef = path.join(__dirname, fileNameLangDef);

async function asyncLoadLangDefFromFile(): Promise<string> {
    try {
        const jsonLangDef = await fsPromises.readFile(fullFilePathNameLangDef, 'utf8')
		return jsonLangDef;
    } catch(e) {
		if (!`${e}`.startsWith('Error: ENOENT')) {
	        vscode.window.showInformationMessage(`Load language definition from ${fileNameLangDef} failed: ${e}`);
		}
	}

	return Promise.reject();
}

async function asyncSaveLangDefToFile(jsonLangDef: string) {
	try {
		await fsPromises.writeFile(fullFilePathNameLangDef, jsonLangDef);
	}
	catch(e) {
		vscode.window.showInformationMessage(`Save language definition to ${fullFilePathNameLangDef} failed: ${e}`);
	}
}

const langDefInFileOrSetting = false;

//const userMapFilePath = path.join(context.extensionPath, languageHandlerDefFileName);
async function asyncLoadLangDef() {
	const jsonLangDef = langDefInFileOrSetting
		? await asyncLoadLangDefFromFile()
		: vscode.workspace.getConfiguration(configNameLangDef).get<string>("json");

	languageHandlerMap = deserializeLanguageHandlerMap(`${jsonLangDef}`);
	startWatchingLangDefChanges();
}

async function asyncSaveLangDef() {
	stopWatchingLangDefChanges();
	const jsonLangDef = serializeLanguageHandlerMap(languageHandlerMap);
	langDefInFileOrSetting
		? await asyncSaveLangDefToFile(jsonLangDef)
		: vscode.workspace.getConfiguration(configNameLangDef).update("json", jsonLangDef);
}

function serializeLanguageHandlerMap(map: Map<string, handlerInfo>): string {
    // Convert Map to an object where each key maps to the JSON representation of handlerInfo
    const obj = Object.fromEntries(
        Array.from(map.entries()).map(([key, value]) => [key, value.toJSON()])
    );
    return JSON.stringify(obj);
}

// Deserialize JSON string to languageHandlerMap
function deserializeLanguageHandlerMap(jsonString: string): Map<string, handlerInfo> {
    const obj = JSON.parse(jsonString);
    return new Map(
        Object.entries(obj).map(([key, value]) => [key, handlerInfo.fromJSON(value)])
    );
}
