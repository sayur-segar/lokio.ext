import * as vscode from "vscode";
import { isLokioAvailable, openTerminalAndRun, runLokio } from "../lokio-runner";

async function checkLokio(): Promise<boolean> {
  const available = await isLokioAvailable();
  if (!available) {
    const action = await vscode.window.showErrorMessage(
      "lokio is not installed or not found in PATH.",
      "Install lokio",
      "Configure Path",
    );
    if (action === "Install lokio") {
      vscode.env.openExternal(
        vscode.Uri.parse("https://lokio.dev/docs/getting-started"),
      );
    } else if (action === "Configure Path") {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "lokio.executablePath",
      );
    }
    return false;
  }
  return true;
}

export async function cmdGenerate(): Promise<void> {
  if (!(await checkLokio())) return;

  // Run lokio templates --json to get template list
  const result = await runLokio(["templates", "--json"]);
  let templates: Array<{ name: string; description: string }> = [];

  try {
    const parsed = JSON.parse(result.stdout);
    if (Array.isArray(parsed)) templates = parsed;
  } catch {
    // fallback: open terminal
    openTerminalAndRun("lokio gen", "Lokio: Generate");
    return;
  }

  if (templates.length === 0) {
    vscode.window.showWarningMessage(
      "No templates found. Add templates with `lokio add`.",
    );
    return;
  }

  const picked = await vscode.window.showQuickPick(
    templates.map((t) => ({
      label: t.name,
      description: t.description,
    })),
    {
      placeHolder: "Select a template to generate from",
      matchOnDescription: true,
    },
  );

  if (!picked) return;

  // Open terminal and run lokio gen <template>
  // Interactive prompts need a real terminal
  openTerminalAndRun(`lokio gen ${picked.label}`, `Lokio: Generate ${picked.label}`);
}

export async function cmdGenerateFromTree(
  template: { name: string } | undefined,
): Promise<void> {
  if (!template) {
    await cmdGenerate();
    return;
  }
  if (!(await checkLokio())) return;
  openTerminalAndRun(`lokio gen ${template.name}`, `Lokio: Generate ${template.name}`);
}

export async function cmdCheck(): Promise<void> {
  if (!(await checkLokio())) return;
  openTerminalAndRun("lokio check", "Lokio: Check");
}

export async function cmdSync(): Promise<void> {
  if (!(await checkLokio())) return;
  openTerminalAndRun("lokio sync", "Lokio: Sync");
}

export async function cmdSyncFile(filePath: string | undefined): Promise<void> {
  if (!(await checkLokio())) return;
  if (!filePath) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    filePath = editor.document.uri.fsPath;
  }

  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) return;

  const { relative } = await import("node:path");
  const relPath = relative(root, filePath).replace(/\\/g, "/");

  openTerminalAndRun(`lokio gen --update ${relPath}`, "Lokio: Sync File");
}

export async function cmdDiff(): Promise<void> {
  if (!(await checkLokio())) return;
  openTerminalAndRun("lokio diff", "Lokio: Diff");
}

export async function cmdDoctor(): Promise<void> {
  if (!(await checkLokio())) return;
  openTerminalAndRun("lokio doctor", "Lokio: Doctor");
}

export async function cmdAiCheck(): Promise<void> {
  if (!(await checkLokio())) return;
  openTerminalAndRun("lokio ai", "Lokio: AI Check");
}
