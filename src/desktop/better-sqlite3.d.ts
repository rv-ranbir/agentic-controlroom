// Minimal shim for the slice of better-sqlite3's API this app uses — no
// @types package is published for it, and the full surface isn't needed here.
declare module "better-sqlite3" {
  interface SqliteColumn {
    name: string;
  }
  interface SqliteStatement {
    all(...params: unknown[]): Record<string, unknown>[];
    columns(): SqliteColumn[];
  }
  interface SqliteDatabase {
    prepare(sql: string): SqliteStatement;
    close(): void;
  }
  interface SqliteDatabaseConstructor {
    new (path: string, options?: { readonly?: boolean; fileMustExist?: boolean }): SqliteDatabase;
  }
  const Database: SqliteDatabaseConstructor;
  export default Database;
}
