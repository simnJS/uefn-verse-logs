import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

export type LogLevel = 'Verbose' | 'VeryVerbose' | 'Log' | 'Display' | 'Warning' | 'Error' | 'Fatal';

export const ALL_LEVELS: readonly LogLevel[] = [
  'Fatal',
  'Error',
  'Warning',
  'Display',
  'Log',
  'Verbose',
  'VeryVerbose',
];

// The categories UEFN actually emits with "Verse" in the name (per the
// Output Log filter). Users can add more via `uefnVerseLogs.categories`.
export const DEFAULT_CATEGORIES: readonly string[] = [
  'LogVerse',
  'LogVerseInterop',
  'LogVerseMessageServer',
  'LogVersePredicts',
  'LogVerseUObjectGenerator',
  'VerseBuild',
];

// Categories that fire constantly during UEFN startup but rarely carry
// user-actionable info — default them off so a fresh install isn't a wall
// of noise. Users can re-enable them via the filter tree.
export const NOISY_BY_DEFAULT: ReadonlySet<string> = new Set([
  'LogVerseInterop',
  'LogVerseMessageServer',
  'LogVersePredicts',
  'LogVerseUObjectGenerator',
]);

// The category that carries Print() output. Used by the "Print only" preset.
export const PRINT_CATEGORY = 'LogVerse';

export interface Config {
  logDirectory: string;
  logFileName: string;
  categories: string[];
  pollIntervalMs: number;
  autoStart: boolean;
  showTimestamp: boolean;
  showCategory: boolean;
  showProjectHeader: boolean;
  revealOnError: boolean;
}

export function defaultLogDir(): string {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'UnrealEditorFortnite', 'Saved', 'Logs');
}

export function getConfig(): Config {
  const cfg = vscode.workspace.getConfiguration('uefnVerseLogs');
  return {
    logDirectory: cfg.get<string>('logDirectory') || defaultLogDir(),
    logFileName: cfg.get<string>('logFileName') || 'UnrealEditorFortnite.log',
    categories: cfg.get<string[]>('categories') ?? [...DEFAULT_CATEGORIES],
    pollIntervalMs: cfg.get<number>('pollIntervalMs') ?? 500,
    autoStart: cfg.get<boolean>('autoStart') ?? true,
    showTimestamp: cfg.get<boolean>('showTimestamp') ?? true,
    showCategory: cfg.get<boolean>('showCategory') ?? true,
    showProjectHeader: cfg.get<boolean>('showProjectHeader') ?? true,
    revealOnError: cfg.get<boolean>('revealOnError') ?? false,
  };
}
