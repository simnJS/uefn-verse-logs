import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { ALL_LEVELS, LogLevel, getConfig } from './config';
import { detectUefnProject } from './project';
import { FilterState, FilterTreeProvider, FilterNode } from './filters';
import { Tailer, TailerStats } from './tailer';

let output: vscode.LogOutputChannel;
let status: vscode.StatusBarItem;
let filters: FilterState;
let tailer: Tailer;

function setContext(key: string, value: unknown) {
  void vscode.commands.executeCommand('setContext', key, value);
}

function emitByLevel(message: string, level: LogLevel | undefined) {
  switch (level) {
    case 'Verbose':
    case 'VeryVerbose':
      output.debug(message);
      return;
    case 'Warning':
      output.warn(message);
      return;
    case 'Error':
    case 'Fatal':
      output.error(message);
      return;
    default:
      output.info(message);
  }
}

function updateStatus() {
  if (!tailer.isRunning) {
    status.text = '$(eye-closed) Verse';
    status.tooltip = 'UEFN Verse — click to start tailing';
    status.command = 'uefnVerseLogs.pickLatest';
    status.backgroundColor = undefined;
    setContext('uefnVerseLogs.active', false);
    setContext('uefnVerseLogs.paused', false);
    status.show();
    return;
  }

  const label = tailer.projectName ?? (tailer.path ? path.basename(tailer.path) : 'log');
  const stats = tailer.currentStats;
  const errorBadge = stats.errors > 0 ? ` $(error) ${stats.errors}` : '';
  const warnBadge = stats.warnings > 0 ? ` $(warning) ${stats.warnings}` : '';
  const pauseBadge = filters.paused ? ' $(debug-pause)' : '';
  status.text = `$(eye) ${label}${pauseBadge}${errorBadge}${warnBadge}`;
  status.tooltip = new vscode.MarkdownString(
    [
      `**UEFN Verse** — ${filters.paused ? 'paused' : 'streaming'}`,
      '',
      `\`${tailer.path}\``,
      '',
      `Lines read: ${stats.totalLines}`,
      `Lines emitted: ${stats.emittedLines}`,
      `Warnings: ${stats.warnings}`,
      `Errors: ${stats.errors}`,
      '',
      'Click to open the output panel',
    ].join('\n'),
  );
  status.command = 'uefnVerseLogs.showOutput';
  status.backgroundColor = stats.errors > 0
    ? new vscode.ThemeColor('statusBarItem.errorBackground')
    : stats.warnings > 0
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined;
  setContext('uefnVerseLogs.active', true);
  setContext('uefnVerseLogs.paused', filters.paused);
  status.show();
}

async function pickLogFile(): Promise<string | undefined> {
  const { logDirectory } = getConfig();
  const entries = await fs.promises.readdir(logDirectory).catch(() => [] as string[]);
  const logs = await Promise.all(
    entries
      .filter(f => f.toLowerCase().endsWith('.log'))
      .map(async f => {
        const full = path.join(logDirectory, f);
        const st = await fs.promises.stat(full).catch(() => undefined);
        return st ? { path: full, mtime: st.mtimeMs } : undefined;
      }),
  );
  const sorted = logs
    .filter((x): x is { path: string; mtime: number } => x !== undefined)
    .sort((a, b) => b.mtime - a.mtime);

  const items: (vscode.QuickPickItem & { fsPath?: string })[] = sorted.map(l => ({
    label: path.basename(l.path),
    description: new Date(l.mtime).toLocaleString(),
    detail: l.path,
    fsPath: l.path,
  }));
  items.push({ label: '$(folder-opened) Browse…', detail: 'Pick a .log file manually' });

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: `Logs in ${logDirectory}`,
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!pick) return undefined;
  if (pick.fsPath) return pick.fsPath;
  const uri = await vscode.window.showOpenDialog({
    filters: { Logs: ['log'] },
    canSelectMany: false,
  });
  return uri?.[0]?.fsPath;
}

async function startTail(logPath: string) {
  const config = getConfig();
  const project = await detectUefnProject();
  const ok = await tailer.start(logPath, project?.name, config);
  if (!ok) return;
  output.clear();
  if (config.showProjectHeader && project) {
    output.info(`--- project: ${project.name} (${project.root}) ---`);
  }
  output.info(`--- watching ${logPath} ---`);
  const cats = filters.enabledCategories().join(', ') || '(none)';
  output.info(`--- categories: ${cats} ---`);
  output.show(true);
}

async function autoStart() {
  const config = getConfig();
  if (!config.autoStart) return;
  const project = await detectUefnProject();
  if (!project) {
    output.info('--- no .uefnproject found in workspace, autostart skipped ---');
    return;
  }
  const logPath = path.join(config.logDirectory, config.logFileName);
  if (!fs.existsSync(logPath)) {
    output.warn(`--- project "${project.name}" detected but ${logPath} does not exist yet ---`);
    output.warn('--- launch UEFN, then run "UEFN Verse: Watch latest log" ---');
    return;
  }
  await startTail(logPath);
}

interface FilterPickItem extends vscode.QuickPickItem {
  filterKind: 'category' | 'level';
  filterKey: string;
}

async function editFiltersQuick() {
  const items: FilterPickItem[] = [
    ...[...filters.categories.entries()].map(
      ([cat, enabled]): FilterPickItem => ({
        label: cat,
        description: 'category',
        filterKind: 'category',
        filterKey: cat,
        picked: enabled,
      }),
    ),
    ...[...filters.levels.entries()].map(
      ([lvl, enabled]): FilterPickItem => ({
        label: lvl,
        description: 'level',
        filterKind: 'level',
        filterKey: lvl,
        picked: enabled,
      }),
    ),
  ];

  const picked = await vscode.window.showQuickPick<FilterPickItem>(items, {
    canPickMany: true,
    placeHolder: 'Select categories and levels to show',
    matchOnDescription: true,
  });
  if (!picked) return;

  const selected = new Set(picked.map(i => `${i.filterKind}:${i.filterKey}`));
  for (const cat of filters.categories.keys()) {
    filters.setCategory(cat, selected.has(`category:${cat}`));
  }
  for (const lvl of filters.levels.keys()) {
    filters.setLevel(lvl, selected.has(`level:${lvl}`));
  }
}

export async function activate(context: vscode.ExtensionContext) {
  output = vscode.window.createOutputChannel('UEFN Verse', { log: true });
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  filters = new FilterState(context.globalState);
  filters.syncCategoryList(getConfig().categories);

  tailer = new Tailer(filters, {
    onLine: (line, level) => emitByLevel(line, level),
    onMeta: msg => output.info(msg),
    onStateChange: () => updateStatus(),
    onStats: (stats: TailerStats) => {
      updateStatus();
      if (stats.errors > 0 && getConfig().revealOnError && !filters.paused) {
        output.show(true);
      }
    },
  });

  filters.onChange(() => updateStatus());

  const treeProvider = new FilterTreeProvider(filters);
  const treeView = vscode.window.createTreeView<FilterNode>('uefnVerseFilters', {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
  });

  treeView.onDidChangeCheckboxState(e => {
    for (const [node, state] of e.items) {
      const checked = state === vscode.TreeItemCheckboxState.Checked;
      if (node.kind === 'category') filters.setCategory(node.id, checked);
      else if (node.kind === 'level') filters.setLevel(node.id, checked);
    }
  });

  context.subscriptions.push(
    output,
    status,
    treeView,

    vscode.commands.registerCommand('uefnVerseLogs.start', async () => {
      const picked = await pickLogFile();
      if (picked) await startTail(picked);
    }),
    vscode.commands.registerCommand('uefnVerseLogs.pickLatest', async () => {
      const { logDirectory, logFileName } = getConfig();
      const preferred = path.join(logDirectory, logFileName);
      if (fs.existsSync(preferred)) {
        await startTail(preferred);
        return;
      }
      const picked = await pickLogFile();
      if (picked) await startTail(picked);
    }),
    vscode.commands.registerCommand('uefnVerseLogs.stop', () => {
      tailer.stop();
      output.info('--- stopped ---');
    }),
    vscode.commands.registerCommand('uefnVerseLogs.pause', () => {
      filters.setPaused(true);
      output.info('--- paused ---');
    }),
    vscode.commands.registerCommand('uefnVerseLogs.resume', () => {
      filters.setPaused(false);
      output.info('--- resumed ---');
    }),
    vscode.commands.registerCommand('uefnVerseLogs.clear', () => output.clear()),
    vscode.commands.registerCommand('uefnVerseLogs.showOutput', () => output.show(true)),
    vscode.commands.registerCommand('uefnVerseLogs.editFilters', () => editFiltersQuick()),
    vscode.commands.registerCommand('uefnVerseLogs.resetFilters', () => {
      filters.reset();
      output.info('--- filters reset ---');
    }),
    vscode.commands.registerCommand('uefnVerseLogs.printOnly', () => {
      filters.printOnly();
      output.info('--- preset: Print() only ---');
    }),
    vscode.commands.registerCommand('uefnVerseLogs.allCategoriesOn', () =>
      filters.setAll('categories', true),
    ),
    vscode.commands.registerCommand('uefnVerseLogs.allCategoriesOff', () =>
      filters.setAll('categories', false),
    ),
    vscode.commands.registerCommand('uefnVerseLogs.allLevelsOn', () =>
      filters.setAll('levels', true),
    ),
    vscode.commands.registerCommand('uefnVerseLogs.allLevelsOff', () =>
      filters.setAll('levels', false),
    ),
    vscode.commands.registerCommand('uefnVerseLogs.openSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:simnjs.uefn-verse-logs'),
    ),

    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('uefnVerseLogs.categories')) {
        filters.syncCategoryList(getConfig().categories);
      }
      if (e.affectsConfiguration('uefnVerseLogs.pollIntervalMs')) {
        tailer.restartTimer();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void autoStart()),
  );

  updateStatus();
  await autoStart();
}

export function deactivate() {
  tailer?.stop();
}

// Re-export so tsc keeps the symbols even if unused above (helps IDE jumps).
export { ALL_LEVELS };
