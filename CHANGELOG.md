# Change Log

All notable changes to the "moonbit-tasks" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## 0.0.1

- Initial release

- 'build', 'test', 'clean'

## 0.0.2

- Add icon, 'run src/main'

## 0.0.3

- Undo web extension entrypoint

## 0.0.4

- Add smart tasks view in explorer view

- Build, Test, Run, Clean, Fmt, Coverage

## 0.0.5

Multi-root workspace support

Cangjie, Rust, Go, Gleam, Nim, Zig, Maven support

## 0.0.6

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

## 0.0.7

- Nim (*.nimble) project file support

## 0.0.8

- Language definition file

- Also search in parent folders for project file when current dir or active fold in workspace dir can't find project file

  1. Active file; 2. Active path; 3. Active parent paths chain (within workspace); 4. Root folders of workspace 

## 0.0.9

- Async load language def

- Check, Update

## 0.0.10

- Terminal shell/icon

## 0.11.1

- Language definition save/load fix

- Swift

## 0.11.4

- Language definition save/load fix, monitoring change to reload

## 0.11.5

- Language definition in setting, monitoring change

## 0.11.7

- Update feature desctiption

- cmake, google test

## 0.11.8

- Update definition in setting for C/C++ CMake, Google Test

- Disable contributed task group in 'Terminal' -> 'Run Task...'

## 0.11.20241103

- LangDef setting fix

## 0.12.202411071

- VSC version requirement lower to 1.80, so that VSC on Mac can use this extension.

## 0.12.2024111201

- Update cmd handler for Zig, 'zig build run', 'zig build test'.

## 0.12.2024111202

- Signature file pattern update, allow multiple file patter, seperated by '|', e.x. 'build.zig|build.zig.zon', '*.nimble|*.nim'

- Add 'Package', 'Publish' tasks

## 0.12.2024111203

- Fix signature pattern processing bug (remove first char)

## 0.12.2024112906

- Redefine tasks of language, smart tasks menu refresh when capture project signatures

- Add Git tasks view

## 0.12.2024112907

- Update language def
