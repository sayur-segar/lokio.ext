import * as path from "node:path";
import * as vscode from "vscode";
import { runLokioJson } from "../lokio-runner";

interface CheckFailure {
  message: string;
  severity: "warning" | "danger";
  type: "required" | "forbidden";
  source: "auto" | "annotation";
}

interface CheckResult {
  file: string;
  templateName: string;
  status: "ok" | "warn" | "danger";
  failures: CheckFailure[];
  namingViolation?: string;
}

interface CheckJsonOutput {
  results: CheckResult[];
  summary: { ok: number; warn: number; danger: number; total: number };
  dangerMode: "block" | "warn";
  error?: string;
}

export class LokioDiagnosticsProvider {
  private collection: vscode.DiagnosticCollection;
  private statusBarItem: vscode.StatusBarItem;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    collection: vscode.DiagnosticCollection,
    statusBarItem: vscode.StatusBarItem,
  ) {
    this.collection = collection;
    this.statusBarItem = statusBarItem;
  }

  scheduleCheck(delay = 1500): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.runCheck(), delay);
  }

  async runCheck(): Promise<void> {
    this.statusBarItem.text = "$(sync~spin) Lokio";
    this.statusBarItem.tooltip = "Running lokio check...";

    const output = await runLokioJson<CheckJsonOutput>(["check"]);

    if (!output || output.error) {
      this.statusBarItem.text = "$(warning) Lokio";
      this.statusBarItem.tooltip = output?.error ?? "lokio check failed";
      return;
    }

    this.collection.clear();

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;

    const byFile = new Map<string, vscode.Diagnostic[]>();

    for (const result of output.results) {
      if (result.status === "ok") continue;

      const fileUri = vscode.Uri.file(path.join(root, result.file));
      const diags = byFile.get(fileUri.toString()) ?? [];

      // Naming violation → diagnostic at line 0
      if (result.namingViolation) {
        diags.push(
          new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 0),
            `Lokio: ${result.namingViolation}`,
            vscode.DiagnosticSeverity.Warning,
          ),
        );
      }

      // Rule failures → diagnostics at line 0 (whole-file rules)
      for (const failure of result.failures) {
        const severity =
          failure.severity === "danger"
            ? output.dangerMode === "block"
              ? vscode.DiagnosticSeverity.Error
              : vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Warning;

        const diag = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 0),
          `Lokio [${result.templateName}]: ${failure.message}`,
          severity,
        );
        diag.source = "lokio";
        diag.code = failure.type;
        diags.push(diag);
      }

      byFile.set(fileUri.toString(), diags);
      this.collection.set(fileUri, diags);
    }

    // Update status bar
    const { ok, warn, danger, total } = output.summary;
    if (danger > 0) {
      this.statusBarItem.text = `$(shield) Lokio $(error) ${danger}`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground",
      );
    } else if (warn > 0) {
      this.statusBarItem.text = `$(shield) Lokio $(warning) ${warn}`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground",
      );
    } else {
      this.statusBarItem.text = `$(shield) Lokio $(check) ${ok}/${total}`;
      this.statusBarItem.backgroundColor = undefined;
    }
    this.statusBarItem.tooltip = `Lokio: ${ok} ok, ${warn} warn, ${danger} danger (${total} files)`;
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.collection.dispose();
  }
}
