#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const input = process.argv[2];
if (!input) {
  console.error("Missing YouTube URL or ID.");
  process.exit(1);
}

const root = process.env.CHUNGUNGO_ROOT || "/Users/aljorgevi/dev/code/chungungo";
const appRoot = resolve(root);

if (!existsSync(appRoot)) {
  console.error(`CHUNGUNGO_ROOT not found: ${appRoot}`);
  process.exit(1);
}

const url = input.includes("http")
  ? input
  : `https://youtu.be/${input}`;

const { pathToFileURL } = await import("node:url");
const appPath = (file) => pathToFileURL(resolve(appRoot, file)).href;

process.chdir(appRoot);

const { fetchYoutubeTranscript, fetchYoutubeTitle } = await import(
  appPath("src/lib/youtube.ts")
);
const { summarizeText } = await import(appPath("src/lib/summarize.ts"));
const { insertSummary } = await import(appPath("src/lib/db.ts"));
const { nanoid } = await import("nanoid");

const transcriptResult = await fetchYoutubeTranscript(url);
const summary = await summarizeText(transcriptResult.text);
const title = await fetchYoutubeTitle(url);

const createdAt = new Date().toISOString();
const row = {
  id: nanoid(),
  source: "youtube",
  url,
  title,
  transcript: transcriptResult.text,
  summary,
  transcriptSource: transcriptResult.source,
  createdAt,
};

insertSummary(row);

const sentences = summary.split(/(?<=[.!?])\s+/).filter(Boolean);
const highLevel = sentences.slice(0, 3).join(" ").slice(0, 600);

console.log(
  JSON.stringify(
    {
      title,
      url,
      transcriptSource: transcriptResult.source,
      highLevelSummary: highLevel,
    },
    null,
    2
  )
);
