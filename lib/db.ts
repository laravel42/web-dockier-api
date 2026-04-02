import pg from "pg";

let pool: pg.Pool | null = null;
let _dbUrl: string | null = null;

/** Call this once from any service to provide the connection string. */
export function initDb(url: string) {
  if (!_dbUrl) _dbUrl = url;
}

function getPool(): pg.Pool {
  if (!pool) {
    if (!_dbUrl) throw new Error("Database not initialized. Call initDb(DatabaseUrl()) from a service first.");
    pool = new pg.Pool({ connectionString: _dbUrl });
  }
  return pool;
}

/**
 * Drop-in replacement for Encore's SQLDatabase.
 * Supports the same tagged-template API: db.exec, db.queryRow, db.query.
 */
export class Database {
  get exec() {
    return async (strings: TemplateStringsArray, ...values: any[]): Promise<void> => {
      const { text, params } = buildQuery(strings, values);
      await getPool().query(text, params);
    };
  }

  get queryRow() {
    const fn = async <T = any>(
      strings: TemplateStringsArray,
      ...values: any[]
    ): Promise<T | null> => {
      const { text, params } = buildQuery(strings, values);
      const result = await getPool().query(text, params);
      return (result.rows[0] as T) ?? null;
    };
    return fn;
  }

  get query() {
    const fn = <T = any>(
      strings: TemplateStringsArray,
      ...values: any[]
    ): AsyncIterable<T> => {
      const { text, params } = buildQuery(strings, values);
      return {
        [Symbol.asyncIterator]() {
          let rows: T[] | null = null;
          let index = 0;
          return {
            async next(): Promise<IteratorResult<T>> {
              if (!rows) {
                const result = await getPool().query(text, params);
                rows = result.rows as T[];
              }
              if (index < rows.length) {
                return { value: rows[index++], done: false };
              }
              return { value: undefined as any, done: true };
            },
          };
        },
      };
    };
    return fn;
  }
}

function buildQuery(
  strings: TemplateStringsArray,
  values: any[]
): { text: string; params: any[] } {
  let text = "";
  const params: any[] = [];
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) {
      params.push(values[i]);
      text += `$${params.length}`;
    }
  }
  return { text, params };
}

export const db = new Database();
