import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import * as fs from 'fs';

import * as helper from './helper'

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
            macroHandler : this.macroHandler ? Object.fromEntries(this.macroHandler) : null
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
export async function initHandlerMap() {
	// Try load definition, if none, init default
	try {
		await loadLanguageDefinition();
	}
	catch(e) {
		vscode.window.showInformationMessage(`Load language definition failed: ${e}`);
	}
	if (languageHandlerMap !== undefined && languageHandlerMap != null && languageHandlerMap.size > 0) {
	}
	else {
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
		saveHandlerMap();
	}
}

const languageHandlerDefFileName = 'languageHandler.json';
const filePathLangDef = path.join(__dirname, languageHandlerDefFileName)
//const userMapFilePath = path.join(context.extensionPath, languageHandlerDefFileName);
async function loadLanguageDefinition() {
    try {
        const json = await fsPromises.readFile(filePathLangDef, 'utf8');
        languageHandlerMap = deserializeLanguageHandlerMap(json);
    } catch(e) {
		if (!`${e}`.startsWith('Error: ENOENT')) {
	        vscode.window.showInformationMessage(`Load language definition from ${languageHandlerDefFileName} failed: ${e}`);
		}
	}

    fs.unwatchFile(filePathLangDef);
	fs.watchFile(filePathLangDef, (curr, prev) => {
		if (curr.mtime !== prev.mtime) {
			vscode.window.showInformationMessage('Language definition has changed, reloading...');
			loadLanguageDefinition();
		}
	});	
}

async function saveHandlerMap() {
	const json = serializeLanguageHandlerMap(languageHandlerMap);
	try {
		await fsPromises.writeFile(filePathLangDef, json);
	}
	catch(e) {
		vscode.window.showInformationMessage(`Save language definition to ${languageHandlerDefFileName} failed: ${e}`);
	}
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
