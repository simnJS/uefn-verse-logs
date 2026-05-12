import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { Config, LogLevel, getConfig } from './config';
import { FilterState } from './filters';
import { parseLine, matchesPrefix } from './parser';

export interface TailerStats {
  totalLines: number;
  emittedLines: number;
  errors: number;
  warnings: number;
}

export interface TailerEvents {
  onLine: (rendered: string, level: LogLevel | undefined) => void;
  onMeta: (message: string) => void;
  onStateChange: () => void;
  onStats: (stats: TailerStats) => void;
}

export class Tailer {
  private timer: NodeJS.Timeout | undefined;
  private position = 0;
  private inode = 0;
  private remainder = '';
  private currentPath: string | undefined;
  private currentProject: string | undefined;
  private stats: TailerStats = { totalLines: 0, emittedLines: 0, errors: 0, warnings: 0 };

  constructor(
    private readonly filters: FilterState,
    private readonly events: TailerEvents,
  ) {}

  get isRunning(): boolean {
    return this.timer !== undefined;
  }
  get path(): string | undefined {
    return this.currentPath;
  }
  get projectName(): string | undefined {
    return this.currentProject;
  }
  get currentStats(): TailerStats {
    return this.stats;
  }

  async start(logPath: string, projectName: string | undefined, config: Config): Promise<boolean> {
    this.stop();
    const stat = await fs.promises.stat(logPath).catch(() => undefined);
    if (!stat) {
      vscode.window.showErrorMessage(`File not found: ${logPath}`);
      return false;
    }
    this.currentPath = logPath;
    this.currentProject = projectName;
    this.position = stat.size;
    this.inode = stat.ino;
    this.remainder = '';
    this.stats = { totalLines: 0, emittedLines: 0, errors: 0, warnings: 0 };
    this.events.onStats(this.stats);

    this.startTimer(config.pollIntervalMs);
    this.events.onStateChange();
    return true;
  }

  // Recreate the timer with the current pollIntervalMs (call after settings change).
  restartTimer() {
    if (!this.timer) return;
    this.startTimer(getConfig().pollIntervalMs);
  }

  private startTimer(intervalMs: number) {
    if (this.timer) clearInterval(this.timer);
    // Re-read getConfig() on every tick so toggling showTimestamp / showCategory
    // in settings.json takes effect immediately, without restarting the tail.
    this.timer = setInterval(() => void this.readDelta(getConfig()), intervalMs);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
    this.currentPath = undefined;
    this.currentProject = undefined;
    this.events.onStateChange();
  }

  private async readDelta(config: Config) {
    if (!this.currentPath) return;
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(this.currentPath);
    } catch {
      return;
    }

    if (stat.ino !== this.inode || stat.size < this.position) {
      this.events.onMeta(`--- log rotated (${path.basename(this.currentPath)}) ---`);
      this.position = 0;
      this.inode = stat.ino;
      this.remainder = '';
    }

    if (stat.size === this.position) return;

    const fd = await fs.promises.open(this.currentPath, 'r');
    try {
      const length = stat.size - this.position;
      const buf = Buffer.alloc(length);
      await fd.read(buf, 0, length, this.position);
      this.position = stat.size;
      const text = this.remainder + buf.toString('utf8');
      const lastNl = text.lastIndexOf('\n');
      const complete = lastNl >= 0 ? text.slice(0, lastNl) : '';
      this.remainder = lastNl >= 0 ? text.slice(lastNl + 1) : text;
      if (complete) this.processLines(complete, config);
    } finally {
      await fd.close();
    }
  }

  private processLines(chunk: string, config: Config) {
    let statsChanged = false;
    const enabledCats = this.filters.enabledCategories();

    for (const line of chunk.split(/\r?\n/)) {
      if (!line) continue;
      this.stats.totalLines++;
      statsChanged = true;

      const parsed = parseLine(line);
      if (!parsed) continue;

      if (!matchesPrefix(parsed.category, enabledCats)) continue;
      if (!this.filters.isLevelEnabled(parsed.level)) continue;

      const parts: string[] = [];
      if (config.showTimestamp) parts.push(`[${parsed.timestamp}]`);
      if (config.showCategory) parts.push(parsed.category);
      if (parsed.level) parts.push(parsed.level);
      const prefix = parts.length > 0 ? parts.join(' ') + ': ' : '';

      this.events.onLine(prefix + parsed.message, parsed.level);
      this.stats.emittedLines++;
      if (parsed.level === 'Error' || parsed.level === 'Fatal') this.stats.errors++;
      else if (parsed.level === 'Warning') this.stats.warnings++;
    }
    if (statsChanged) this.events.onStats(this.stats);
  }
}
