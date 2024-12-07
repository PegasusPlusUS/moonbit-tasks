import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import * as fs from 'fs';

import * as helper from './helper';

let configChangeListener: vscode.Disposable | undefined;
let extensionContext: vscode.ExtensionContext | undefined; // Store context for later use

export function activate(context: vscode.ExtensionContext) {
    extensionContext = context; // Save the context for later use
	
	asyncInitLangDef();
}

const configNameLangDef = 'moonbit-tasks.languageHandlerDef';

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
	signatureFilePattern: string;
	commands: Map<string, string>;
	icon: string;

	constructor(sigFileName: string, commands: Map<string, string>, icon: string = "") {
		this.signatureFilePattern = sigFileName;
		this.commands = commands;
		this.icon = icon;
	}

	static isValid(h: handlerInfo | undefined): boolean {
		return h !== undefined && h !== null;
	}

	static notValid(h: handlerInfo | undefined): boolean {
		return !this.isValid(h);
	}

	toJSON(): object {
		return {
			signatureFileName: this.signatureFilePattern,
			commands: Array.from(this.commands.entries())
		};
	}

	static fromJSON(json: any): handlerInfo {
		return new handlerInfo(
			json.signatureFileName,
			new Map(json.commands)
		);
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
		//await asyncLoadLangDef();
	}
	catch(e) {
		vscode.window.showInformationMessage(`Load language definition failed: ${e}`);
	}

	if (!helper.isValidMap(languageHandlerMap)) {
		const myMap: Map<string, handlerInfo> = new Map([
			['Moonbit', new handlerInfo('moon.mod.json', new Map([
				['Build', 'moon build'],
				['Check', 'moon check'],
				['Run', 'moon run'],
				['Test', 'moon test'],
				['Coverage', 'moon test --enable-coverage; moon coverage report'],
				['Clean', 'moon clean'],
				['Format', 'moon fmt'],
				['Doc', 'moon doc'],
				['Package', 'moon package'],
				['Publish', 'moon publish'],
				['Update', 'moon update'],
				['Upgrade', 'moon upgrade'],
			]), 'extension-icon.png')],
			['Rust', new handlerInfo('Cargo.toml', new Map([
				['Build', 'cargo b'],
				['Check', 'cargo c'],
				['Run', 'cargo r'],
				['Test','cargo t'],
				['Format', 'cargo fmt'],
				['Clippy', 'cargo clippy'],
				['Coverage','cargo tarpaulin'],
				//['GCov', 'cargo gcov'],
				['Benchmark', 'cargo bench'],
				['Doc', 'cargo d'],
				['Clean', 'cargo clean'],
				['Update', 'cargo update'],
				['Publish', 'cargo publish'],
				['Upgrade', 'rustup upgrade'],
			]), 'file_type_rust_toolchain.svg')],
			['Nim', new handlerInfo('*.nimble', new Map([
				['Run', 'nimble run'],
				['Format',"for /r %f in (*.nim) do ( nimpretty --backup:off %f )"],
				["Coverage", "testament --backend:html --show-times --show-progress --compile-time-tools --nim:tests"]
			]), 'file_type_nimble.svg')],
			['Cangjie', new handlerInfo('cjpm.toml', new Map([
				['Build', 'cjpm build'],
				['Check', 'cjpm check'],
				['Run', 'cjpm run'],
				['Test', 'cjpm test'],
				['Bench', 'cjpm bench'],
				['Clean', 'cjpm clean'],
			]), 'file_type_xcode.svg')],
			['Zig', new handlerInfo('build.zig|build.zig.zon', new Map([
				['Build', 'zig build'],
				['Run', 'zig build run'],
				['Test', 'zig build test'],
			]), 'file_type_zig.svg')],
			['Gleam', new handlerInfo('gleam.toml', new Map([
				['Build', 'gleam build'],
				['Run', 'gleam run'],
				['Check', 'gleam check'],
				['Clean', 'gleam clean'],
				['Format', 'gleam format'],
				['Docs', 'gleam docs'],
				['Fix', 'gleam fix'],
				['Publish', 'gleam publish'],
				['Update', 'gleam update'],
				['Shell', 'gleam shell'],
			]), 'file_type_gleam.svg')],
			['Go', new handlerInfo('go.mod', new Map([
				['Build', 'go build'],
				['Run', 'go run'],
				['Test', 'go test'],
				['Doc', 'go doc'],
				['Clean', 'go clean'],
				['Fix', 'go fix'],
				['Format', 'go format'],
			]), 'file_type_go_fuchsia.svg')],
			['Wa', new handlerInfo('wa.mod', new Map([
				['Build', 'wa build'],
				['Run', 'wa run'],
				['Test', 'wa test'],
			]), 'file_type_wasm.svg')],
			['Java', new handlerInfo('pom.xml', new Map([
				['Build', 'mvn compile'],
				['Run', 'mvn run'],
				['Test', 'mvn test'],
			]), 'file_type_java.svg')],
			['Npm', new handlerInfo('package.json', new Map([
				['Build', 'npm run compile'],
				['Rebuild', 'npm rebuild'],
				['Lint', 'npm run lint'],
				['Test', 'npm test'],
				['CI', 'npm ci'],
				['Install-test', 'npm install-test'],
				['Install-ci-test', 'npm install-ci-test'],
				['Update', 'npm update'],
				['Npm-publish', 'npm publish'],
				['VSCE-Package', 'vsce package'],
				['VSCE-Publish', 'vsce publish']
			]), 'file_type_npm.svg')],
			['TypeScript', new handlerInfo('tsconfig.json', new Map([
				['Build', 'tsc build'],
				['Run', 'tsc run'],
				['Test', 'tsc test']
			]), 'file_type_typescript_official.svg')],
			['Swift', new handlerInfo('Package.swift', new Map([
				['Build', 'swift build'],
				['Run', 'swift run'],
				['Test', 'swift test']
			]), 'file_type_swift.svg')],
			['C/C++/CMake', new handlerInfo('CMakeLists.txt', new Map([
				['Build', 'cmake -S . -B .build && cmake --build .build'],
				['Test', 'cmake --build .build && ctest --test-dir .build'],
				['Run', 'cmake --build .build && ctest --test-dir .build && cmake run run']
			]), 'folder_type_cmake.svg')]
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
        const jsonLangDef = await fsPromises.readFile(fullFilePathNameLangDef, 'utf8');
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
