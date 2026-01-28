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

// Migration: add new columns for enhanced summaries
const migrations = [
  "ALTER TABLE summaries ADD COLUMN transcriptSource TEXT NOT NULL DEFAULT 'captions'",
  "ALTER TABLE summaries ADD COLUMN type TEXT NOT NULL DEFAULT 'general'",
  "ALTER TABLE summaries ADD COLUMN detailedAnalysis TEXT",
  "ALTER TABLE summaries ADD COLUMN takeaways TEXT",      // JSON array
  "ALTER TABLE summaries ADD COLUMN actionItems TEXT",    // JSON array
  "ALTER TABLE summaries ADD COLUMN skillIdeas TEXT",     // JSON array (for coding/ai)
  "ALTER TABLE summaries ADD COLUMN integrations TEXT",   // JSON array (for coding/ai)
  "ALTER TABLE summaries ADD COLUMN model TEXT",          // AI model used for summarization
];

for (const sql of migrations) {
  try {
    db.exec(sql);
  } catch {
    // column already exists
  }
}

export type SummaryType = "general" | "coding" | "ai" | "productivity";

export type SummaryRow = {
  id: string;
  source: string;
  url: string;
  title: string | null;
  transcript: string;
  summary: string;
  transcriptSource: "captions" | "whisper" | "tweet" | "thread";
  createdAt: string;
  // Enhanced fields
  type: SummaryType;
  detailedAnalysis: string | null;
  takeaways: string | null;      // JSON string of string[]
  actionItems: string | null;    // JSON string of string[]
  skillIdeas: string | null;     // JSON string of string[]
  integrations: string | null;   // JSON string of string[]
  model: string | null;          // AI model used for summarization
};

export type ParsedSummary = Omit<SummaryRow, 'takeaways' | 'actionItems' | 'skillIdeas' | 'integrations'> & {
  takeaways: string[];
  actionItems: string[];
  skillIdeas: string[];
  integrations: string[];
  model: string | null;
};

export function insertSummary(row: SummaryRow) {
  const stmt = db.prepare(
    `INSERT INTO summaries (
      id, source, url, title, transcript, summary, transcriptSource, createdAt,
      type, detailedAnalysis, takeaways, actionItems, skillIdeas, integrations, model
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    row.id,
    row.source,
    row.url,
    row.title,
    row.transcript,
    row.summary,
    row.transcriptSource,
    row.createdAt,
    row.type || "general",
    row.detailedAnalysis || null,
    row.takeaways || null,
    row.actionItems || null,
    row.skillIdeas || null,
    row.integrations || null,
    row.model || null
  );
}

export function listSummaries(limit = 20): ParsedSummary[] {
  const stmt = db.prepare(
    `SELECT * FROM summaries ORDER BY datetime(createdAt) DESC LIMIT ?`
  );
  const rows = stmt.all(limit) as SummaryRow[];
  
  return rows.map(row => ({
    ...row,
    type: (row.type || "general") as SummaryType,
    takeaways: safeParseArray(row.takeaways),
    actionItems: safeParseArray(row.actionItems),
    skillIdeas: safeParseArray(row.skillIdeas),
    integrations: safeParseArray(row.integrations),
  }));
}

function safeParseArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
