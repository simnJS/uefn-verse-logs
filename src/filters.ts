import * as vscode from 'vscode';
import { NOISY_BY_DEFAULT, PRINT_CATEGORY, getConfig } from './config';

const STATE_KEY = 'uefnVerseLogs.filterState.v1';

interface PersistedFilters {
  categories: Record<string, boolean>;
}

function categoryDefault(cat: string): boolean {
  return !NOISY_BY_DEFAULT.has(cat);
}

export class FilterState {
  private readonly _onChange = new vscode.EventEmitter<void>();
  readonly onChange = this._onChange.event;

  readonly categories = new Map<string, boolean>();

  constructor(private readonly storage: vscode.Memento) {
    this.load();
  }

  private load() {
    const persisted = this.storage.get<PersistedFilters>(STATE_KEY);
    for (const cat of getConfig().categories) {
      this.categories.set(cat, persisted?.categories[cat] ?? categoryDefault(cat));
    }
  }

  private persist() {
    const data: PersistedFilters = {
      categories: Object.fromEntries(this.categories),
    };
    void this.storage.update(STATE_KEY, data);
  }

  setCategory(category: string, enabled: boolean) {
    this.categories.set(category, enabled);
    this.persist();
    this._onChange.fire();
  }

  enabledCategories(): string[] {
    return [...this.categories.entries()].filter(([, v]) => v).map(([k]) => k);
  }

  reset() {
    this.categories.clear();
    for (const cat of getConfig().categories) this.categories.set(cat, categoryDefault(cat));
    this.persist();
    this._onChange.fire();
  }

  // Preset: keep only Print() output — uncheck every other category.
  printOnly() {
    for (const cat of this.categories.keys()) {
      this.categories.set(cat, cat === PRINT_CATEGORY);
    }
    this.persist();
    this._onChange.fire();
  }

  setAll(value: boolean) {
    for (const k of this.categories.keys()) this.categories.set(k, value);
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

export type FilterNode = {
  kind: 'category';
  id: string;
  label: string;
  checked: boolean;
};

export class FilterTreeProvider implements vscode.TreeDataProvider<FilterNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly filters: FilterState) {
    filters.onChange(() => this._onDidChangeTreeData.fire());
  }

  getTreeItem(node: FilterNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label);
    item.checkboxState = node.checked
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
    item.contextValue = 'category';
    return item;
  }

  getChildren(): FilterNode[] {
    return [...this.filters.categories.entries()].map(([id, checked]) => ({
      kind: 'category',
      id,
      label: id,
      checked,
    }));
  }
}
