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