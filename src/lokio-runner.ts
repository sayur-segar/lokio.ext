import { execFile } from "node:child_process";
import * as vscode from "vscode";

function getExecutable(): string {
  return vscode.workspace.getConfiguration("lokio").get<string>("executablePath") ?? "lokio";
}

function getWorkspaceRoot(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : null;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runLokio(args: string[], cwd?: string): Promise<RunResult> {
  const exe = getExecutable();
  const workdir = cwd ?? getWorkspaceRoot() ?? process.cwd();

  return new Promise((resolve) => {
    execFile(exe, args, { cwd: workdir, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      const code = err?.code;
      resolve({
        stdout,
        stderr,
        exitCode: typeof code === "number" ? code : 0,
      });
    });
  });
}

export async function runLokioJson<T>(args: string[]): Promise<T | null> {
  const result = await runLokio([...args, "--json"]);
  if (!result.stdout.trim()) return null;
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    return null;
  }
}

export function isLokioAvailable(): Promise<boolean> {
  return runLokio(["--version"]).then((r) => r.exitCode === 0);
}

export function openTerminalAndRun(command: string, name = "Lokio"): void {
  const root = getWorkspaceRoot();
  const terminal = vscode.window.createTerminal({
    name,
    cwd: root ?? undefined,
  });
  terminal.show();
  terminal.sendText(command);
}
