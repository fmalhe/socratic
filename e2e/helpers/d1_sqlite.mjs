import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "migrations");

const D1_MAX_BIND_PARAMS = 100;

function loadMigrationsSql() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
  return files.map((file) => ({
    file,
    sql: fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"),
  }));
}

function normalizeRow(row) {
  if (!row || typeof row !== "object") return null;
  return { ...row };
}

function enforceBindLimit(args) {
  if (args.length > D1_MAX_BIND_PARAMS) {
    throw new Error(
      `D1_ERROR: too many SQL variables (${args.length} > ${D1_MAX_BIND_PARAMS})`,
    );
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === undefined) {
      throw new Error(`D1_TYPE_ERROR: Type 'undefined' not supported at bind index ${i}`);
    }
  }
}

export function createD1Sqlite() {
  let db = null;
  const migrations = loadMigrationsSql();

  function initDb() {
    if (db) {
      try {
        db.close();
      } catch {}
    }
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    for (const mig of migrations) {
      db.exec(mig.sql);
    }
  }

  initDb();

  function makeBoundStatement(sql, args) {
    enforceBindLimit(args);

    return {
      _sql: sql,
      _args: args,
      bind(...nextArgs) {
        return makeBoundStatement(sql, nextArgs);
      },
      async first(colName) {
        const stmt = db.prepare(sql);
        const row = stmt.get(...args);
        if (row === undefined || row === null) {
          return null;
        }
        if (colName !== undefined) {
          return row[colName] === undefined ? null : row[colName];
        }
        return normalizeRow(row);
      },
      async all() {
        const stmt = db.prepare(sql);
        const rows = stmt.all(...args);
        return {
          results: rows.map((r) => ({ ...r })),
          success: true,
          meta: {
            duration: 0,
            changes: 0,
            last_row_id: 0,
            served_by: "e2e-sqlite",
          },
        };
      },
      async run() {
        const stmt = db.prepare(sql);
        const info = stmt.run(...args);
        return {
          results: [],
          success: true,
          meta: {
            duration: 0,
            changes: Number(info.changes ?? 0),
            last_row_id: Number(info.lastInsertRowid ?? 0),
            served_by: "e2e-sqlite",
          },
        };
      },
      async raw() {
        const stmt = db.prepare(sql);
        const rows = stmt.all(...args);
        return rows.map((r) => Object.values(r));
      },
      _execSync() {
        const stmt = db.prepare(sql);
        const hasCols = stmt.columns().length > 0;
        if (hasCols) {
          const rows = stmt.all(...args);
          return {
            results: rows.map((r) => ({ ...r })),
            success: true,
            meta: {
              duration: 0,
              changes: 0,
              last_row_id: 0,
              served_by: "e2e-sqlite",
            },
          };
        }
        const info = stmt.run(...args);
        return {
          results: [],
          success: true,
          meta: {
            duration: 0,
            changes: Number(info.changes ?? 0),
            last_row_id: Number(info.lastInsertRowid ?? 0),
            served_by: "e2e-sqlite",
          },
        };
      },
    };
  }

  return {
    prepare(sql) {
      return makeBoundStatement(sql, []);
    },
    async batch(statements) {
      if (!Array.isArray(statements) || statements.length === 0) {
        return [];
      }
      const results = [];
      db.exec("BEGIN;");
      try {
        for (const stmt of statements) {
          results.push(stmt._execSync());
        }
        db.exec("COMMIT;");
        return results;
      } catch (err) {
        try {
          db.exec("ROLLBACK;");
        } catch {}
        throw err;
      }
    },
    async exec(sql) {
      db.exec(sql);
      return { count: 1, duration: 0 };
    },
    async dump() {
      return new ArrayBuffer(0);
    },
    // Test harness inspection & seeding helpers
    reset() {
      initDb();
    },
    execRaw(sql, ...args) {
      if (args.length === 0 && sql.trim().includes(";")) {
        const parts = sql.split(";").map((s) => s.trim()).filter(Boolean);
        if (parts.length > 1) {
          db.exec(sql);
          return null;
        }
      }
      const stmt = db.prepare(sql);
      if (stmt.columns().length > 0) {
        return stmt.all(...args).map((r) => ({ ...r }));
      }
      return stmt.run(...args);
    },
    getRawDb() {
      return db;
    },
    seedProfile(overrides = {}) {
      const defaults = {
        name: "Lucas",
        age: 10,
        targetLanguageCode: "es-ES",
        targetLanguageName: "Spanish",
        nativeLanguageCode: "nb-NO",
        nativeLanguageName: "Norwegian",
        dialectRules: "Use Castilian Spanish (Spain) vocabulary and vosotros/tú forms.",
        ttsVoiceName: "Puck",
      };
      const p = { ...defaults, ...overrides };
      const info = db
        .prepare(
          `INSERT INTO learner_profile
            (name, age, target_language_code, target_language_name, native_language_code, native_language_name, dialect_rules, tts_voice_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          p.name,
          p.age,
          p.targetLanguageCode,
          p.targetLanguageName,
          p.nativeLanguageCode,
          p.nativeLanguageName,
          p.dialectRules,
          p.ttsVoiceName,
        );
      const id = Number(info.lastInsertRowid);
      db.prepare(
        `INSERT OR IGNORE INTO child_progress (profile_id, total_stars, current_streak_days, last_activity_date, pages_read_count)
         VALUES (?, 0, 0, NULL, 0)`,
      ).run(id);
      return id;
    },
    close() {
      if (db) {
        try {
          db.close();
        } catch {}
        db = null;
      }
    },
  };
}
