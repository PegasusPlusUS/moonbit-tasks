import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import * as fs from 'fs';

import * as helper from './helper'
import { extension_name } from './language_handler'

let configChangeListener: vscode.Disposable | undefined;
let extensionContext: vscode.ExtensionContext | undefined; // Store context for later use

export function activate(context: vscode.ExtensionContext) {
    extensionContext = context; // Save the context for later use
	
	asyncInitLangDef();
}

const configNameGitDef = extension_name + '.gitDef';
const configNameLangDef = extension_name + '.languageHandlerDef';

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

export let gitDef: Map<string, string> = new Map([
	['pull', 'git pull'],
	['fetch', 'git fetch'],
	['stage', 'git stage'],
	['commit', 'git add .; git commit -m "${param}"'],
	['commit|push', 'git add .; git commit -m "${param}"; git push'],
]);

/// Build-> Debug
///         Release
///                Fast
///                Small
///
/// Test-> Lib
///        Bin
///        Doc
///		   Coverage
///
/// Run-> Debug
///            Bin1
///            Bin2
///       Release
///          Bin1
///          Bin2
///
/// Coverage-> Tarpaulin
///        GCov
///
//interface handlerInfo {
export class handlerInfo {
	signatureFilePattern : string;
	commands: Map<string, string>;
	constructor(sigFileName: string, commands: Map<string, string>) {
		this.signatureFilePattern = sigFileName;
		this.commands = commands;
	}

	static isValid(h: handlerInfo | undefined) : boolean {
		return h !== undefined && h !== null;
	}

	static notValid(h: handlerInfo | undefined) : boolean {
		return !this.isValid(h);
	}

	toJSON(): object {
		return {
			signatureFileName : this.signatureFilePattern,
			commands : this.commands,
		};
	}

	static fromJSON(json: any): handlerInfo {
		return new handlerInfo(json.signatureFileName, json.commands);
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
			['Moonbit', new handlerInfo('moon.mod.json', new Map([
				['Build', 'moon build'],
				['Test', 'moon test']
			]))],
			['Rust', new handlerInfo('Cargo.toml', new Map([
				['Build', 'cargo b'],
				['Test','cargo t'],
				['Format', 'cargo fmt'],
				['Coverage','cargo tarpaulin']
			]))],
			['Nim', new handlerInfo('*.nimble', new Map([
				['run', 'nimble run'],
				['fmt',"for /r %f in (*.nim) do ( nimpretty --backup:off %f )"],
				["coverage", "testament --backend:html --show-times --show-progress --compile-time-tools --nim:tests"]
			]))],
			['Cangjie', new handlerInfo('cjpm.toml', new Map([
				['Build', 'cjpm build'],
				['Run', 'cjpm run']
			]))],
			['Zig', new handlerInfo('build.zig|build.zig.zon', new Map([
				['Build', 'zig build'],
				['Run', 'zig build run'],
				['Test', 'zig build test'],
			]))],
			['Gleam', new handlerInfo('gleam.toml', new Map([
				['Run', 'gleam run'],
				['Format', 'gleam format'],
			]))],
			['Go', new handlerInfo('go.mod', new Map([
				['Build', 'go build'],
				['Run', 'go run'],
				['Test', 'go test']
			]))],
			['Wa', new handlerInfo('wa.mod', new Map([
				['Build', 'wa build'],
				['Run', 'wa run'],
				['Test', 'wa test'],
			]))],
			['Java', new handlerInfo('pom.xml', new Map([
				['Build', 'mvn compile'],
				['Run', 'mvn run'],
				['Test', 'mvn test'],
			]))],
			['Npm', new handlerInfo('package.json', new Map([
				['Build', 'npm run compile'],
				['Package', 'npm run compile && vsce.cmd package'],
				['Publish', 'npm run compile && vsce.cmd publish']
			]))],
			['TypeScript', new handlerInfo('tsconfig.json', new Map([
				['Build', 'tsc build'],
				['Run', 'tsc run'],
				['Test', 'tsc test']
			]))],
			['Swift', new handlerInfo('Package.swift', new Map([
				['Build', 'swift build'],
				['Run', 'swift run'],
				['Test', 'swift test']
			]))],
			['C/C++/CMake', new handlerInfo('CMakeLists.txt', new Map([
				['Build', 'cmake -S . -B .build && cmake --build .build'],
				['Test', 'cmake --build .build && ctest --test-dir .build'],
				['Run', 'cmake --build .build && ctest --test-dir .build && cmake run run']
			]))]
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
