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
export type CommandItem = {
  command: string;
  shellCmd: string;
  subcommands?: Array<CommandItem>;
};
//interface handlerInfo {
export class handlerInfo {
	signatureFilePattern: string;
  commands: Array<CommandItem>;
	icon: string;

	constructor(sigFileName: string, commands: Array<CommandItem>, icon: string = "") {
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
			commands: Array.from(this.commands.entries()),
      icon: this.icon,
		};
	}

	static fromJSON(json: any): handlerInfo {
		return new handlerInfo(
			json.signatureFileName,
			json.commands,
      json.icon,
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
        ['Moonbit', new handlerInfo('moon.mod.json', [
                { command: 'Build', shellCmd: 'moon build' },
                { command: 'Check', shellCmd: 'moon check' },
                { command: 'Run', shellCmd: 'moon run' },
                { command: 'Test', shellCmd: 'moon test' },
                { command: 'Coverage', shellCmd: 'moon test --enable-coverage; moon coverage report' },
                { command: 'Clean', shellCmd: 'moon clean' },
                { command: 'Format', shellCmd: 'moon fmt' },
                { command: 'Doc', shellCmd: 'moon doc' },
                { command: 'Package', shellCmd: 'moon package' },
                { command: 'Publish', shellCmd: 'moon publish' },
                { command: 'Update', shellCmd: 'moon update' },
                { command: 'Upgrade', shellCmd: 'moon upgrade' },
            ],
            'extension-icon.png')
        ], ['Rust', new handlerInfo('Cargo.toml', [
                { command: 'Build', shellCmd: 'cargo b',
                    subcommands: [
                        { command: 'Release', shellCmd: 'cargo b --release' },
                        { command: 'Locked', shellCmd: 'cargo b --locked'},
                        { command: 'Offline', shellCmd: 'cargo b --offline'},
                        { command: 'Frozen', shellCmd: 'cargo b --frozen'},
                        { command: 'Clean', shellCmd: 'cargo clean' },
                        { command: 'Publish', shellCmd: 'cargo publish' },
                    ]
                },
                { command: 'Check', shellCmd: 'cargo c',
                    subcommands: [
                        { command: 'Release', shellCmd: 'cargo c --release' },
                        { command: 'Locked', shellCmd: 'cargo c --locked'},
                        { command: 'Offline', shellCmd: 'cargo c --offline'},
                        { command: 'Frozen', shellCmd: 'cargo c --frozen'},
                        { command: 'Fmt', shellCmd: 'cargo fmt' },
                        { command: 'Clippy', shellCmd: 'cargo clippy' },
                    ]
                },
                { command: 'Run', shellCmd: 'cargo r' },
                { command: 'Test', shellCmd: 'cargo t',
                    subcommands: [
                        { command: 'Coverage', shellCmd: 'cargo tarpaulin' },
                        //['GCov', 'cargo gcov'],
                        { command: 'Benchmark', shellCmd: 'cargo bench' },
                    ]
                },
                { command: 'Doc', shellCmd: 'cargo d' },
                { command: 'Update', shellCmd: 'cargo update' },
                { command: 'Upgrade', shellCmd: 'rustup upgrade' },
            ], 'file_type_rust_toolchain.svg')],
        ['Nim', new handlerInfo('*.nimble', [
                { command: 'Build', shellCmd: 'nimble build' },
                { command: 'Check', shellCmd: 'nimble check' },
                { command: 'Test', shellCmd: 'nimble test' },
                { command: 'Run', shellCmd: 'nimble run' },
                // CMD
                // ['Format',"for /r %f in (*.nim) do ( nimpretty --backup:off %f )"],
                // Bash
                { command: 'Format', shellCmd: "find . -type f -name '*.nim' -exec nimpretty --backup:off {} \\;" },
                { command: 'Suggest', shellCmd: 'nimsuggest' },
                { command: "Coverage", shellCmd: "testament --backend:html --show-times --show-progress --compile-time-tools --nim:tests" },
                { command: 'Clean', shellCmd: 'nimble clean' },
            ], 'file_type_nimble.svg')],
        ['Cangjie', new handlerInfo('cjpm.toml', [
                { command: 'Build', shellCmd: 'cjpm build' },
                { command: 'Check', shellCmd: 'cjpm check' },
                { command: 'Run', shellCmd: 'cjpm run' },
                { command: 'Test', shellCmd: 'cjpm test' },
                { command: 'Bench', shellCmd: 'cjpm bench' },
                { command: 'Clean', shellCmd: 'cjpm clean' },
            ], 'file_type_xcode.svg')],
        // ['Zig', new handlerInfo('build.zig|build.zig.zon', new Map([
        // 	['Build', 'zig build'],
        // 	['Run', 'zig build run'],
        // 	['Test', 'zig build test'],
        // 	['Format', "find . -type f -name '*.zig' -exec zig fmt {} \\;"],
        // 	['Zen', 'zig zen'],
        // ]), 'file_type_zig.svg')],
        // ['Gleam', new handlerInfo('gleam.toml', new Map([
        // 	['Build', 'gleam build'],
        // 	['Run', 'gleam run'],
        // 	['Check', 'gleam check'],
        // 	['Clean', 'gleam clean'],
        // 	['Format', 'gleam format'],
        // 	['Docs', 'gleam docs'],
        // 	['Fix', 'gleam fix'],
        // 	['Publish', 'gleam publish'],
        // 	['Update', 'gleam update'],
        // 	['Shell', 'gleam shell'],
        // ]), 'file_type_gleam.svg')],
        // ['Go', new handlerInfo('go.mod', new Map([
        // 	['Build', 'go build'],
        // 	['Run', 'go run'],
        // 	['Test', 'go test'],
        // 	['Doc', 'go doc'],
        // 	['Clean', 'go clean'],
        // 	['Fix', 'go fix'],
        // 	['Format', 'go format'],
        // ]), 'file_type_go_fuchsia.svg')],
        // ['Wa', new handlerInfo('wa.mod', new Map([
        // 	['Build', 'wa build'],
        // 	['Run', 'wa run'],
        // 	['Test', 'wa test'],
        // ]), 'file_type_wasm.svg')],
        // ['Java', new handlerInfo('pom.xml', new Map([
        // 	['Build', 'mvn compile'],
        // 	['Run', 'mvn run'],
        // 	['Test', 'mvn test'],
        // ]), 'file_type_java.svg')],
        ['Npm', new handlerInfo('package.json', [
                { command: 'Build', shellCmd: 'npm run compile' },
                { command: 'Rebuild', shellCmd: 'npm rebuild' },
                { command: 'Lint', shellCmd: 'npm run lint' },
                { command: 'Test', shellCmd: 'npm test' },
                { command: 'CI', shellCmd: 'npm ci' },
                { command: 'Install-test', shellCmd: 'npm install-test' },
                { command: 'Install-ci-test', shellCmd: 'npm install-ci-test' },
                { command: 'Update', shellCmd: 'npm update' },
                { command: 'Npm-publish', shellCmd: 'npm publish' },
                { command: 'VSCE-Package', shellCmd: 'vsce package',
                  subcommands: [
                    { command: 'Reinstall', shellCmd: 'vsce package; npm run vsce-reinst' },
                    { command: 'Publish', shellCmd: 'vsce publish' }
                  ]
                },
            ], 'file_type_npm.svg')],
        // ['TypeScript', new handlerInfo('tsconfig.json', new Map([
        // 	['Build', 'tsc build'],
        // 	['Run', 'tsc run'],
        // 	['Test', 'tsc test']
        // ]), 'file_type_typescript_official.svg')],
        ['Swift', new handlerInfo('Package.swift', [
                { command: 'Build', shellCmd: 'swift build' },
                { command: 'Run', shellCmd: 'swift run' },
                { command: 'Test', shellCmd: 'swift test' },
            ], 'file_type_swift.svg')],
        ['C/C++/CMake', new handlerInfo('CMakeLists.txt', [
            { command: 'Build', shellCmd: 'cmake -S . -B .build && cmake --build .build' },
            { command: 'Test', shellCmd: 'cmake --build .build && ctest --test-dir .build' },
            { command: 'Run', shellCmd: 'cmake --build .build && ctest --test-dir .build && cmake run run' },
        ], 'folder_type_cmake.svg')],
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
