import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { Config, LogLevel, getConfig } from './config';
import { FilterState } from './filters';
import { parseLine, matchesPrefix } from './parser';

const READ_BUFFER_SIZE = 64 * 1024;

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

// We keep a FileHandle open for the whole tail. On Windows `fs.stat()` only
// sees `size` updates after the metadata is committed, which lags behind
// `write()` by hundreds of ms (the symptom: `Print("a")` not appearing until
// more data is logged). Reading from an open handle goes through the file
// system cache instead and picks up new bytes as soon as the kernel sees them.
export class Tailer {
  private timer: NodeJS.Timeout | undefined;
  private handle: fs.promises.FileHandle | undefined;
  private position = 0;
  private inode = 0;
  private remainder = '';
  private readonly buffer = Buffer.alloc(READ_BUFFER_SIZE);
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
    await this.stop();

    let handle: fs.promises.FileHandle;
    try {
      handle = await fs.promises.open(logPath, 'r');
    } catch {
      vscode.window.showErrorMessage(`File not found: ${logPath}`);
      return false;
    }
    const stat = await handle.stat();

    this.handle = handle;
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

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.handle) {
      await this.handle.close().catch(() => {});
      this.handle = undefined;
    }
    this.currentPath = undefined;
    this.currentProject = undefined;
    this.events.onStateChange();
  }

  // Recreate the timer with the current pollIntervalMs (call after settings change).
  restartTimer() {
    if (!this.timer) return;
    this.startTimer(getConfig().pollIntervalMs);
  }

  private startTimer(intervalMs: number) {
    if (this.timer) clearInterval(this.timer);
    // Re-read getConfig() on every tick so settings (showTimestamp, showCategory…)
    // take effect immediately, without restarting the tail.
    this.timer = setInterval(() => void this.readDelta(getConfig()), intervalMs);
  }

  private async readDelta(config: Config) {
    if (!this.handle || !this.currentPath) return;

    // Drain everything available from the kept-open handle in one tick.
    let totalRead = 0;
    while (true) {
      let bytesRead: number;
      try {
        const r = await this.handle.read(this.buffer, 0, this.buffer.length, this.position);
        bytesRead = r.bytesRead;
      } catch {
        return; // handle may have been closed concurrently
      }
      if (bytesRead === 0) break;
      this.position += bytesRead;
      totalRead += bytesRead;
      const text = this.remainder + this.buffer.toString('utf8', 0, bytesRead);
      const lastNl = text.lastIndexOf('\n');
      const complete = lastNl >= 0 ? text.slice(0, lastNl) : '';
      this.remainder = lastNl >= 0 ? text.slice(lastNl + 1) : text;
      if (complete) this.processLines(complete, config);
      if (bytesRead < this.buffer.length) break;
    }

    // Nothing new — check whether UEFN rotated the file (renamed our handle's
    // target and created a fresh one at the same path).
    if (totalRead === 0) {
      await this.checkRotation();
    }
  }

  private async checkRotation() {
    if (!this.handle || !this.currentPath) return;
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(this.currentPath);
    } catch {
      return;
    }
    if (stat.ino !== this.inode) {
      await this.handle.close().catch(() => {});
      try {
        this.handle = await fs.promises.open(this.currentPath, 'r');
      } catch {
        this.handle = undefined;
        return;
      }
      this.events.onMeta(`--- log rotated (${path.basename(this.currentPath)}) ---`);
      this.inode = stat.ino;
      this.position = 0;
      this.remainder = '';
    } else if (stat.size < this.position) {
      this.events.onMeta(`--- log truncated ---`);
      this.position = 0;
      this.remainder = '';
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
