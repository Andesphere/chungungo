import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const dbPath = join(process.cwd(), "data", "summaries.db");
mkdirSync(dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS summaries (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    transcript TEXT NOT NULL,
    summary TEXT NOT NULL,
    transcriptSource TEXT NOT NULL DEFAULT 'captions',
    createdAt TEXT NOT NULL
  );
`);

// Backfill older databases
try {
  db.exec("ALTER TABLE summaries ADD COLUMN transcriptSource TEXT NOT NULL DEFAULT 'captions'");
} catch {
  // column already exists
}

export type SummaryRow = {
  id: string;
  source: string;
  url: string;
  title: string | null;
  transcript: string;
  summary: string;
  transcriptSource: "captions" | "whisper";
  createdAt: string;
};

export function insertSummary(row: SummaryRow) {
  const stmt = db.prepare(
    `INSERT INTO summaries (id, source, url, title, transcript, summary, transcriptSource, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    row.id,
    row.source,
    row.url,
    row.title,
    row.transcript,
    row.summary,
    row.transcriptSource,
    row.createdAt
  );
}

export function listSummaries(limit = 20): SummaryRow[] {
  const stmt = db.prepare(
    `SELECT * FROM summaries ORDER BY datetime(createdAt) DESC LIMIT ?`
  );
  return stmt.all(limit) as SummaryRow[];
}
