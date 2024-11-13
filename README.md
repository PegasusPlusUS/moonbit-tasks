
## Features

Create a "SMART TASKS" panel in EXPLORER workspace view

```
> WORKSPACE
> OUTLINE
> TIMELINE
V SMART TASKS
    Build
	Check
	Test
	Coverage
	Run
	Clean
	Fmt
	Update

Build -> 'moon build'
Check -> 'moon check'
Test -> 'moon test'
Coverage -> 'moon `
Run -> 'moon run'
Clean -> 'moon clean'
Fmt -> 'moon fmt'
Update -> 'moon update'

Also support:
  Cangjie(cjpm)
  Gleam
  Rust (cargo, tarpaulin)
  TypeScript/JavaScript (npm)
  Go
  Swift
  Java (Maven)
  C/C++ (CMake, GoogleTest)
  Nim (nimble)
  Zig
Language definition within setting, can manually update, extension will reload definition automatically

Sample definition:
{"Moonbit":{"signatureFileName":"moon.mod.json","projectManagerCmd":"moon","macroHandler":null},"Rust":{"signatureFileName":"Cargo.toml","projectManagerCmd":"cargo","macroHandler":{"run":"run src/main","coverage":"tarpaulin --skip-clean"}},"Nim":{"signatureFileName":"*.nimble","projectManagerCmd":"nimble","macroHandler":{"run":"run","fmt":"for /r %f in (*.nim) do ( nimpretty --backup:off %f )","coverage":"testament --backend:html --show-times --show-progress --compile-time-tools --nim:tests"}},"Cangjie":{"signatureFileName":"cjpm.toml","projectManagerCmd":"cjpm","macroHandler":{"run":"run"}},"Zig":{"signatureFileName":"build.zig.zon","projectManagerCmd":"zig","macroHandler":{"run":"run src/main.zig","test":"test src/main.zig"}},"Gleam":{"signatureFileName":"gleam.toml","projectManagerCmd":"gleam","macroHandler":{"run":"run","fmt":"format"}},"Go":{"signatureFileName":"go.mod","projectManagerCmd":"go","macroHandler":null},"Wa":{"signatureFileName":"wa.mod","projectManagerCmd":"wa","macroHandler":null},"Java":{"signatureFileName":"pom.xml","projectManagerCmd":"mvn","macroHandler":{"build":"compile"}},"Npm":{"signatureFileName":"package.json","projectManagerCmd":"npm run","macroHandler":{"build":"compile"}},"TypeScript":{"signatureFileName":"tsconfig.json","projectManagerCmd":"tsc","macroHandler":null},"Swift":{"signatureFileName":"Package.swift","projectManagerCmd":"swift","macroHandler":{"run":"run"}},"C++":{"signatureFileName":"CMakeLists.txt","projectManagerCmd":"cmake","macroHandler":{"run":"run", "build":"-S . -B .build && cmake --build .build", "test":"-S. -B .build&&cmake --build .build&&ctest --test-dir .build"}}}
```

//Create tasks for contributed task group 'moon', to make build/test/clean etc tasks easier.

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

CLI of Moonbit installed so that shellcmd 'moon' can be called

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.scanSubdirectoryForProject`: default is true.

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 0.0.1

Initial release of moonbit tasks - 'build', 'test'

### 0.0.2

Add icon, 'run src/main'

### 0.0.3

Undo web extension entrypoint

### 0.0.4

Add smart tasks view in explorer view

Build, Test, Run, Clean, Fmt, Coverage

### 0.0.5

Multi-root workspace support

Cangjie, Rust, Go, Gleam, Nim, Zig, Maven support

### 0.0.6

If multi project contains active document, choose the project that has maximum path length

Encounter typescipt bug, VSC 1.94.2, Node.js 20.16.0, Npm 10.8.2

```TypeScript
					// Check each workspace folder to see if the file is in it and keep the folder that has maximum length
					let rootDir: vscode.WorkspaceFolder | undefined = undefined;
					const firstFoundRootDir = workspaceFolders.find(folder => {
						return false;
						//const folderPath = folder.uri.fsPath;
						//return fileDir.startsWith(folderPath);  // Check if the file is within this folder
					});
					rootDir = firstFoundRootDir; // Have to assign to the obsolete undefined firstFoundRootDir first, otherwise, in last line, rootDir can't by referenced, compiler reports .uri not exists, rootDir is of unknown type
					let maxPathLength = 0;
					workspaceFolders.forEach(folder => {
						const pathLength = folder.uri.fsPath.length;
						if (fileDir.startsWith(folder.uri.fsPath) && pathLength > maxPathLength) {
							maxPathLength = pathLength;
							rootDir = folder;
						}
					});
					if (rootDir !== undefined && rootDir !== null && rootDir.uri.fsPath.length > 0) {

```

### 0.0.7

- Nim (*.nimble) project file support

### 0.0.8

- Language definition file

- Also search in parent folders for project file when current dir or active fold in workspace dir can't find project file

  1. Active file; 2. Active path; 3. Active parent paths chain (within workspace); 4. Root folders of workspace

### 0.0.9

- Async load language def

- Check, Update

### 0.0.10

- Terminal shell/icon

### 0.11.1

- Language definition save/load fix

- Swift

### 0.11.4

- Language definition save/load fix, monitoring change to reload

### 0.11.5

- Language definition in setting, monitoring change

### 0.11.7

- Update feature desctiption

- cmake, google test

### 0.11.8

- Update definition in setting for C/C++ CMake, Google Test

- Disable contributed task group in 'Terminal' -> 'Run Task...'

### 0.11.20241103

- LangDef setting fix

### 0.12.202411071

- VSC version requirement lower to 1.80, so that VSC on Mac can use this extension.

### 0.12.2024111201

- Update cmd handler for Zig, 'zig build run', 'zig build test'.

### 0.12.2024111202

- Signature file pattern update, allow multiple file patter, seperated by '|', e.x. 'build.zig|build.zig.zon', '*.nimble|*.nim'

- Add 'Package', 'Publish' tasks

### 0.12.2024111203

- Fix signature pattern processing bug (remove first char)
