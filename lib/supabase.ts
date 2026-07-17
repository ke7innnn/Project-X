class LocalStorageSupabaseBuilder {
  private tableName: string;
  private filters: { col: string; val: any }[] = [];
  private orderCol: string | null = null;
  private orderAsc: boolean = true;
  private limitNum: number | null = null;
  private isSingle: boolean = false;
  private action: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private actionData: any = null;
  private upsertOptions: any = null;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  private getItems(): any[] {
    if (typeof window === 'undefined') return [];
    try {
      const data = localStorage.getItem(`sb_mock_${this.tableName}`);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveItems(items: any[]) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(`sb_mock_${this.tableName}`, JSON.stringify(items));
    } catch (e) {
      console.error("Local Storage Save Error:", e);
    }
  }

  select(cols: string = '*') {
    this.action = 'select';
    return this;
  }

  insert(data: any) {
    this.action = 'insert';
    this.actionData = data;
    return this;
  }

  upsert(data: any, options?: any) {
    this.action = 'upsert';
    this.actionData = data;
    this.upsertOptions = options;
    return this;
  }

  update(data: any) {
    this.action = 'update';
    this.actionData = data;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(col: string, val: any) {
    this.filters.push({ col, val });
    return this;
  }

  order(col: string, options?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = options?.ascending ?? true;
    return this;
  }

  limit(num: number) {
    this.limitNum = num;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  // Make it Thenable so `await builder` works
  async then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    try {
      const res = await this.execute();
      if (onfulfilled) return onfulfilled(res);
      return res;
    } catch (err) {
      if (onrejected) return onrejected(err);
      throw err;
    }
  }

  private async execute() {
    let items = this.getItems();

    // 1. Process Actions
    if (this.action === 'insert') {
      const rows = Array.isArray(this.actionData) ? this.actionData : [this.actionData];
      const newRows = rows.map(r => ({
        ...r,
        created_at: r.created_at || new Date().toISOString(),
        updated_at: r.updated_at || new Date().toISOString()
      }));
      items.push(...newRows);
      this.saveItems(items);
      return { data: Array.isArray(this.actionData) ? newRows : newRows[0], error: null };
    }

    if (this.action === 'upsert') {
      const rows = Array.isArray(this.actionData) ? this.actionData : [this.actionData];
      const onConflict = this.upsertOptions?.onConflict || 'session_id';

      const newItems = [...items];
      const updatedRows: any[] = [];

      for (const row of rows) {
        const matchIdx = newItems.findIndex(item => item[onConflict] === row[onConflict]);
        const updatedRow = {
          ...(matchIdx >= 0 ? newItems[matchIdx] : {}),
          ...row,
          updated_at: new Date().toISOString()
        };
        if (matchIdx >= 0) {
          newItems[matchIdx] = updatedRow;
        } else {
          updatedRow.created_at = updatedRow.created_at || new Date().toISOString();
          newItems.push(updatedRow);
        }
        updatedRows.push(updatedRow);
      }

      this.saveItems(newItems);
      return { data: Array.isArray(this.actionData) ? updatedRows : updatedRows[0], error: null };
    }

    if (this.action === 'update') {
      let updatedCount = 0;
      const newItems = items.map(item => {
        const matches = this.filters.every(f => item[f.col] === f.val);
        if (matches) {
          updatedCount++;
          return {
            ...item,
            ...this.actionData,
            updated_at: new Date().toISOString()
          };
        }
        return item;
      });
      this.saveItems(newItems);
      return { data: null, error: null };
    }

    if (this.action === 'delete') {
      const filteredItems = items.filter(item => {
        return !this.filters.every(f => item[f.col] === f.val);
      });
      this.saveItems(filteredItems);
      return { data: null, error: null };
    }

    // Default action: 'select'
    let result = items.filter(item => {
      return this.filters.every(f => {
        return item[f.col] === f.val;
      });
    });

    if (this.orderCol) {
      result.sort((a, b) => {
        const valA = a[this.orderCol!];
        const valB = b[this.orderCol!];
        if (valA < valB) return this.orderAsc ? -1 : 1;
        if (valA > valB) return this.orderAsc ? 1 : -1;
        return 0;
      });
    }

    if (this.limitNum !== null) {
      result = result.slice(0, this.limitNum);
    }

    if (this.isSingle) {
      if (result.length === 0) {
        return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
      }
      return { data: result[0], error: null };
    }

    return { data: result, error: null };
  }
}

export const supabase = {
  from(tableName: string) {
    return new LocalStorageSupabaseBuilder(tableName);
  }
};
