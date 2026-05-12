import * as vscode from 'vscode';
import { ALL_LEVELS, LogLevel, NOISY_BY_DEFAULT, PRINT_CATEGORY, getConfig } from './config';

function categoryDefault(cat: string): boolean {
  return !NOISY_BY_DEFAULT.has(cat);
}

const STATE_KEY = 'uefnVerseLogs.filterState.v1';

interface PersistedFilters {
  categories: Record<string, boolean>;
  levels: Record<string, boolean>;
}

export class FilterState {
  private readonly _onChange = new vscode.EventEmitter<void>();
  readonly onChange = this._onChange.event;

  readonly categories = new Map<string, boolean>();
  readonly levels = new Map<LogLevel, boolean>();

  constructor(private readonly storage: vscode.Memento) {
    this.load();
  }

  private load() {
    const persisted = this.storage.get<PersistedFilters>(STATE_KEY);
    for (const cat of getConfig().categories) {
      this.categories.set(cat, persisted?.categories[cat] ?? categoryDefault(cat));
    }
    for (const level of ALL_LEVELS) {
      this.levels.set(level, persisted?.levels[level] ?? true);
    }
  }

  private persist() {
    const data: PersistedFilters = {
      categories: Object.fromEntries(this.categories),
      levels: Object.fromEntries(this.levels) as Record<string, boolean>,
    };
    void this.storage.update(STATE_KEY, data);
  }

  setCategory(category: string, enabled: boolean) {
    this.categories.set(category, enabled);
    this.persist();
    this._onChange.fire();
  }

  setLevel(level: LogLevel, enabled: boolean) {
    this.levels.set(level, enabled);
    this.persist();
    this._onChange.fire();
  }

  enabledCategories(): string[] {
    return [...this.categories.entries()].filter(([, v]) => v).map(([k]) => k);
  }

  isLevelEnabled(level: LogLevel | undefined): boolean {
    if (!level) return true;
    return this.levels.get(level) ?? true;
  }

  reset() {
    this.categories.clear();
    this.levels.clear();
    for (const cat of getConfig().categories) this.categories.set(cat, categoryDefault(cat));
    for (const level of ALL_LEVELS) this.levels.set(level, true);
    this.persist();
    this._onChange.fire();
  }

  // Preset: keep only Print() output — uncheck every other category.
  printOnly() {
    for (const cat of this.categories.keys()) {
      this.categories.set(cat, cat === PRINT_CATEGORY);
    }
    for (const level of ALL_LEVELS) this.levels.set(level, true);
    this.persist();
    this._onChange.fire();
  }

  setAll(kind: 'categories' | 'levels', value: boolean) {
    const map = kind === 'categories' ? this.categories : this.levels;
    for (const k of map.keys()) (map as Map<string, boolean>).set(k as string, value);
    this.persist();
    this._onChange.fire();
  }

  // Refresh after the user edits `uefnVerseLogs.categories` in settings.
  syncCategoryList(categories: string[]) {
    const previous = new Map(this.categories);
    this.categories.clear();
    for (const cat of categories) {
      this.categories.set(cat, previous.get(cat) ?? categoryDefault(cat));
    }
    this.persist();
    this._onChange.fire();
  }
}

export type FilterNode =
  | { kind: 'section'; id: 'categories' | 'levels'; label: string }
  | { kind: 'category'; id: string; label: string; checked: boolean }
  | { kind: 'level'; id: LogLevel; label: string; checked: boolean };

export class FilterTreeProvider implements vscode.TreeDataProvider<FilterNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly filters: FilterState) {
    filters.onChange(() => this._onDidChangeTreeData.fire());
  }

  getTreeItem(node: FilterNode): vscode.TreeItem {
    if (node.kind === 'section') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = `section.${node.id}`;
      item.iconPath = new vscode.ThemeIcon(node.id === 'categories' ? 'list-tree' : 'list-filter');
      return item;
    }
    const item = new vscode.TreeItem(node.label);
    item.checkboxState = node.checked
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
    item.contextValue = node.kind;
    if (node.kind === 'level') {
      item.iconPath = new vscode.ThemeIcon(levelIcon(node.id));
    }
    return item;
  }

  getChildren(node?: FilterNode): FilterNode[] {
    if (!node) {
      return [
        { kind: 'section', id: 'categories', label: 'Categories' },
        { kind: 'section', id: 'levels', label: 'Levels' },
      ];
    }
    if (node.kind === 'section' && node.id === 'categories') {
      return [...this.filters.categories.entries()].map(([id, checked]) => ({
        kind: 'category',
        id,
        label: id,
        checked,
      }));
    }
    if (node.kind === 'section' && node.id === 'levels') {
      return [...this.filters.levels.entries()].map(([id, checked]) => ({
        kind: 'level',
        id,
        label: id,
        checked,
      }));
    }
    return [];
  }
}

function levelIcon(level: LogLevel): string {
  switch (level) {
    case 'Fatal':
    case 'Error':
      return 'error';
    case 'Warning':
      return 'warning';
    case 'Display':
    case 'Log':
      return 'info';
    case 'Verbose':
    case 'VeryVerbose':
      return 'circle-outline';
  }
}
