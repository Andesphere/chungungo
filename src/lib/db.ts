import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const dbPath = join(process.cwd(), "data", "summaries.db");
mkdirSync(dirname(dbPath), { recursive: true });

const db = new Database(dbPath, { create: true });

db.run(`
  CREATE TABLE IF NOT EXISTS summaries (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    transcript TEXT NOT NULL,
    summary TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
`);

export type SummaryRow = {
  id: string;
  source: string;
  url: string;
  title: string | null;
  transcript: string;
  summary: string;
  createdAt: string;
};

export function insertSummary(row: SummaryRow) {
  const stmt = db.prepare(
    `INSERT INTO summaries (id, source, url, title, transcript, summary, createdAt)
     VALUES ($id, $source, $url, $title, $transcript, $summary, $createdAt)`
  );
  stmt.run(row);
}

export function listSummaries(limit = 20): SummaryRow[] {
  const stmt = db.prepare(
    `SELECT * FROM summaries ORDER BY datetime(createdAt) DESC LIMIT $limit`
  );
  return stmt.all({ limit }) as SummaryRow[];
}
