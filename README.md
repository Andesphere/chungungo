# Signal / Summary Lab (POC)

Local Astro + Bun + SQLite proof‑of‑concept for summarizing YouTube videos.

## Features
- Paste a YouTube URL → transcript → summary
- Summaries stored locally in SQLite
- Optional external summarizer via `SUMMARY_API_URL`

## Getting Started
```bash
bun install
bun run dev
```
Open http://localhost:4321

## Optional: plug in a summarization agent
Set an HTTP endpoint that accepts `{ text }` and returns `{ summary }`.

```
export SUMMARY_API_URL="http://localhost:3001/summarize"
```

If not set, the app uses a basic extractive summary (first sentences).

## API
- `POST /api/summarize` → `{ url }`
- `GET /api/summaries`

## SQLite
Database lives at `data/summaries.db`.
