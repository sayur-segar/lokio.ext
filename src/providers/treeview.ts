import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { runLokioJson } from "../lokio-runner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LokioTemplate {
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    prompt: string;
  }>;
  files: Array<{ path: string; output: string }>;
}

interface LockEntry {
  template: string;
  parameters: Record<string, string | boolean | number>;
  files: Array<{ output: string; template_path: string }>;
  generated_at: string;
}

// ─── Tree Items ───────────────────────────────────────────────────────────────

export class LokioTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    public readonly data?: unknown,
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class LokioTreeProvider
  implements vscode.TreeDataProvider<LokioTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    LokioTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: LokioTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: LokioTreeItem): Promise<LokioTreeItem[]> {
    if (!element) {
      // Root level: two sections
      return [
        new LokioTreeItem(
          "Templates",
          vscode.TreeItemCollapsibleState.Expanded,
          "section-templates",
        ),
        new LokioTreeItem(
          "Generated Files",
          vscode.TreeItemCollapsibleState.Expanded,
          "section-generated",
        ),
      ];
    }

    if (element.contextValue === "section-templates") {
      return this.getTemplates();
    }

    if (element.contextValue === "section-generated") {
      return this.getGeneratedFiles();
    }

    if (element.contextValue === "template") {
      const template = element.data as LokioTemplate;
      return this.getTemplateChildren(template);
    }

    if (element.contextValue === "lock-entry") {
      const entry = element.data as LockEntry;
      return entry.files.map((f) => {
        const item = new LokioTreeItem(
          path.basename(f.output),
          vscode.TreeItemCollapsibleState.None,
          "generated-file",
          f.output,
        );
        item.description = path.dirname(f.output);
        item.iconPath = new vscode.ThemeIcon("file-code");
        item.command = this.openFileCommand(f.output);
        item.tooltip = f.output;
        return item;
      });
    }

    return [];
  }

  private async getTemplates(): Promise<LokioTreeItem[]> {
    const templates = await runLokioJson<LokioTemplate[]>(["templates"]);

    if (!templates || !Array.isArray(templates)) {
      const item = new LokioTreeItem(
        "No templates found",
        vscode.TreeItemCollapsibleState.None,
        "placeholder",
      );
      item.iconPath = new vscode.ThemeIcon("warning");
      return [item];
    }

    return templates.map((t) => {
      const item = new LokioTreeItem(
        t.name,
        vscode.TreeItemCollapsibleState.Collapsed,
        "template",
        t,
      );
      item.description = t.description;
      item.iconPath = new vscode.ThemeIcon("symbol-module");
      item.tooltip = new vscode.MarkdownString(
        `**${t.name}**\n\n${t.description}\n\n*${t.files.length} file(s), ${t.parameters.length} parameter(s)*`,
      );
      return item;
    });
  }

  private getTemplateChildren(template: LokioTemplate): LokioTreeItem[] {
    const items: LokioTreeItem[] = [];

    // Parameters section
    if (template.parameters.length > 0) {
      for (const param of template.parameters) {
        const item = new LokioTreeItem(
          `${param.required ? "* " : ""}${param.name}`,
          vscode.TreeItemCollapsibleState.None,
          "param",
        );
        item.description = param.type;
        item.tooltip = param.prompt;
        item.iconPath = new vscode.ThemeIcon(
          param.required ? "symbol-field" : "symbol-field",
        );
        items.push(item);
      }
    }

    // Files section
    for (const f of template.files) {
      const item = new LokioTreeItem(
        path.basename(f.path),
        vscode.TreeItemCollapsibleState.None,
        "template-file",
        f,
      );
      item.description = f.output;
      item.iconPath = new vscode.ThemeIcon("file-code");
      item.tooltip = `Template: ${f.path}\nOutput: ${f.output}`;
      item.command = this.openTemplateFileCommand(f.path);
      items.push(item);
    }

    return items;
  }

  private getGeneratedFiles(): LokioTreeItem[] {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return [];

    const lockPath = path.join(root, "lokio.lock");
    if (!fs.existsSync(lockPath)) {
      const item = new LokioTreeItem(
        "No generated files (lokio.lock not found)",
        vscode.TreeItemCollapsibleState.None,
        "placeholder",
      );
      item.iconPath = new vscode.ThemeIcon("info");
      return [item];
    }

    let lock: { generations: LockEntry[] };
    try {
      // biome-ignore: dynamic require for yaml (avoid bundling complexity)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const yaml = require("js-yaml") as typeof import("js-yaml");
      lock = yaml.load(fs.readFileSync(lockPath, "utf-8")) as {
        generations: LockEntry[];
      };
    } catch {
      const item = new LokioTreeItem(
        "Error reading lokio.lock",
        vscode.TreeItemCollapsibleState.None,
        "placeholder",
      );
      item.iconPath = new vscode.ThemeIcon("error");
      return [item];
    }

    if (!lock?.generations?.length) {
      const item = new LokioTreeItem(
        "No generations yet",
        vscode.TreeItemCollapsibleState.None,
        "placeholder",
      );
      item.iconPath = new vscode.ThemeIcon("info");
      return [item];
    }

    return lock.generations.map((entry) => {
      const item = new LokioTreeItem(
        entry.template,
        vscode.TreeItemCollapsibleState.Collapsed,
        "lock-entry",
        entry,
      );
      item.description = `${entry.files.length} file(s)`;
      item.iconPath = new vscode.ThemeIcon("package");
      item.tooltip = new vscode.MarkdownString(
        `**${entry.template}**\n\nGenerated: ${new Date(entry.generated_at).toLocaleString()}\n\nParameters:\n${Object.entries(entry.parameters)
          .map(([k, v]) => `- \`${k}\`: ${v}`)
          .join("\n")}`,
      );
      return item;
    });
  }

  private openFileCommand(relPath: string): vscode.Command {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    const absPath = path.join(root, relPath);
    return {
      command: "vscode.open",
      title: "Open File",
      arguments: [vscode.Uri.file(absPath)],
    };
  }

  private openTemplateFileCommand(templatePath: string): vscode.Command {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    const absPath = path.join(root, "lokio/templates", templatePath);
    if (!fs.existsSync(absPath)) return { command: "noop", title: "Open" };
    return {
      command: "vscode.open",
      title: "Open Template",
      arguments: [vscode.Uri.file(absPath)],
    };
  }
}
