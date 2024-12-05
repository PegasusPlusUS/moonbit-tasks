import * as vscode from 'vscode';
import { access as fsAccess, constants as fsConstants, promises as fsPromises } from 'fs';

export function isValidString(str: string | undefined | null): boolean {
    return str !== undefined && str !== null && str.trim().length > 0;
}

export function isValidMap(map: Map<any, any> | undefined | null): boolean {
    return map !== undefined && map !== null && map.size > 0;
}

export async function asyncGetShellPath(): Promise<string> {
    let defaultTerminalShellPath : string = "";
    let terminalProfilePath : string = "windows";

    const os = require("os");
    if (os.platform() === 'win32') {
        defaultTerminalShellPath = 'cmd.exe';
    } else if (os.platform() === 'darwin') {
        defaultTerminalShellPath = '/bin/zsh';
        terminalProfilePath = "macOS";
    } else {
        defaultTerminalShellPath = '/bin/bash';
        terminalProfilePath = "linux";
    }

    const config = vscode.workspace.getConfiguration('terminal.integrated.profiles.' + terminalProfilePath);
    const gitBashProfile = config.get< {path:string}>('Git Bash');
    if (gitBashProfile && gitBashProfile.path) {
        return gitBashProfile.path;
    } else {
        const gitBashFilePath = "C:\\Program Files\\Git\\bin\\bash.exe";
        try {
            await fsPromises.access(gitBashFilePath, fsConstants.F_OK);
            return gitBashFilePath;
        } catch {
        }
    }
    return defaultTerminalShellPath;
}
