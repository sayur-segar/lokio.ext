import * as vscode from "vscode";
import {
  cmdAiCheck,
  cmdCheck,
  cmdDiff,
  cmdDoctor,
  cmdGenerate,
  cmdGenerateFromTree,
  cmdSync,
  cmdSyncFile,
} from "./commands";
import { LokioCodeLensProvider } from "./providers/codelens";
import { LokioDiagnosticsProvider } from "./providers/diagnostics";
import { LokioTreeItem, LokioTreeProvider } from "./providers/treeview";

export function activate(context: vscode.ExtensionContext): void {
  // ─── Status bar ────────────────────────────────────────────────────────────

  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    10,
  );
  statusBar.text = "$(shield) Lokio";
  statusBar.tooltip = "Lokio — click to run check";
  statusBar.command = "lokio.check";

  const showStatusBar = vscode.workspace
    .getConfiguration("lokio")
    .get<boolean>("showStatusBar", true);
  if (showStatusBar) statusBar.show();

  context.subscriptions.push(statusBar);

  // ─── Diagnostics ───────────────────────────────────────────────────────────

  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("lokio");
  context.subscriptions.push(diagnosticCollection);

  const diagnosticsProvider = new LokioDiagnosticsProvider(
    diagnosticCollection,
    statusBar,
  );
  context.subscriptions.push({ dispose: () => diagnosticsProvider.dispose() });

  // ─── Tree view ─────────────────────────────────────────────────────────────

  const treeProvider = new LokioTreeProvider();
  const treeView = vscode.window.createTreeView("lokioExplorer", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // ─── CodeLens ──────────────────────────────────────────────────────────────

  const codeLensProvider = new LokioCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: "file" },
      codeLensProvider,
    ),
  );

  // ─── Commands ──────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("lokio.generate", cmdGenerate),
    vscode.commands.registerCommand("lokio.generateFromTree", (item: LokioTreeItem) =>
      cmdGenerateFromTree(item?.data as { name: string } | undefined),
    ),
    vscode.commands.registerCommand("lokio.check", cmdCheck),
    vscode.commands.registerCommand("lokio.sync", cmdSync),
    vscode.commands.registerCommand("lokio.syncFile", (filePath?: string) =>
      cmdSyncFile(filePath),
    ),
    vscode.commands.registerCommand("lokio.diff", cmdDiff),
    vscode.commands.registerCommand("lokio.doctor", cmdDoctor),
    vscode.commands.registerCommand("lokio.aiCheck", cmdAiCheck),
    vscode.commands.registerCommand("lokio.refresh", () => {
      treeProvider.refresh();
      codeLensProvider.refresh();
      diagnosticsProvider.runCheck();
    }),
  );

  // ─── File watchers ─────────────────────────────────────────────────────────

  const checkOnSave = vscode.workspace
    .getConfiguration("lokio")
    .get<boolean>("checkOnSave", true);

  // Run check on file save
  if (checkOnSave) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        // Skip lokio config files themselves
        if (doc.uri.fsPath.includes("lokio")) return;
        diagnosticsProvider.scheduleCheck(2000);
      }),
    );
  }

  // Refresh tree view when lokio.lock changes
  const lockWatcher = vscode.workspace.createFileSystemWatcher("**/lokio.lock");
  context.subscriptions.push(
    lockWatcher,
    lockWatcher.onDidChange(() => {
      treeProvider.refresh();
      codeLensProvider.refresh();
    }),
    lockWatcher.onDidCreate(() => {
      treeProvider.refresh();
      codeLensProvider.refresh();
    }),
  );

  // Refresh tree view when configs.yaml changes
  const configWatcher = vscode.workspace.createFileSystemWatcher(
    "**/lokio/configs.yaml",
  );
  context.subscriptions.push(
    configWatcher,
    configWatcher.onDidChange(() => {
      treeProvider.refresh();
      diagnosticsProvider.scheduleCheck(1000);
    }),
  );

  // ─── Initial check ─────────────────────────────────────────────────────────

  // Delay so workspace fully loads
  setTimeout(() => {
    diagnosticsProvider.scheduleCheck(3000);
  }, 1000);
}

export function deactivate(): void {
  // Cleanup handled by context.subscriptions
}
