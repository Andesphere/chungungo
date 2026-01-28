
import { execSync } from "node:child_process";
import { summarizeText } from "./src/lib/summarize.ts";
import { insertSummary } from "./src/lib/db.ts";
import { nanoid } from "nanoid";

const url = "https://x.com/kaboradev/status/2015362098478756339";

// Extract tweet ID
const idMatch = url.match(/status\/(\d+)/);
if (!idMatch) throw new Error("Invalid Twitter URL");
const tweetId = idMatch[1];

// Fetch tweet using bird CLI
console.error("[twitter] Fetching tweet with bird...");
let birdOutput;
try {
  birdOutput = execSync(`bird thread ${tweetId} --plain`, {
    encoding: "utf-8",
    timeout: 30000,
    stdio: ["pipe", "pipe", "pipe"],
  });
} catch (err) {
  // bird may write to stderr for warnings
  if (err.stdout) {
    birdOutput = err.stdout;
  } else {
    throw new Error("Failed to fetch tweet: " + (err.stderr || err.message));
  }
}

// Parse bird output
function parseBirdOutput(output) {
  const tweets = [];
  const blocks = output.split(/─{10,}/);
  
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length === 0) continue;
    
    const headerMatch = lines[0].match(/@(\w+)\s*\(([^)]+)\):/);
    if (!headerMatch) continue;
    
    const handle = headerMatch[1];
    const author = headerMatch[2];
    const textLines = [];
    const media = [];
    let date = "";
    let tweetUrl = "";
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("date:")) {
        date = line.replace("date:", "").trim();
      } else if (line.startsWith("url:")) {
        tweetUrl = line.replace("url:", "").trim();
      } else if (line.startsWith("PHOTO:") || line.startsWith("VIDEO:")) {
        media.push(line.replace(/^(PHOTO|VIDEO):\s*/, "").trim());
      } else if (line.trim()) {
        textLines.push(line);
      }
    }
    
    if (textLines.length > 0) {
      tweets.push({ author, handle, text: textLines.join("\n").trim(), date, url: tweetUrl, media });
    }
  }
  return tweets;
}

const tweets = parseBirdOutput(birdOutput);
if (tweets.length === 0) {
  throw new Error("No tweets found in bird output");
}

const mainTweet = tweets[0];
const isThread = tweets.length > 1;

// Build title
const title = isThread 
  ? `Thread by @${mainTweet.handle}`
  : `Tweet by @${mainTweet.handle}`;

// Build full text for summarization
const fullText = isThread
  ? tweets.map(t => `@${t.handle}: ${t.text}`).join("\n\n")
  : mainTweet.text;

console.error("[twitter] Summarizing content...");
const structuredSummary = await summarizeText(fullText);

const createdAt = new Date().toISOString();
const row = {
  id: nanoid(),
  source: "twitter",
  url: mainTweet.url || url,
  title: `${title}: ${mainTweet.text.slice(0, 80)}...`,
  transcript: fullText,
  summary: structuredSummary.summary,
  transcriptSource: isThread ? "thread" : "tweet",
  createdAt,
  type: structuredSummary.type,
  detailedAnalysis: structuredSummary.detailedAnalysis || null,
  takeaways: structuredSummary.takeaways.length > 0 
    ? JSON.stringify(structuredSummary.takeaways) 
    : null,
  actionItems: structuredSummary.actionItems.length > 0 
    ? JSON.stringify(structuredSummary.actionItems) 
    : null,
  skillIdeas: structuredSummary.skillIdeas.length > 0 
    ? JSON.stringify(structuredSummary.skillIdeas) 
    : null,
  integrations: structuredSummary.integrations.length > 0 
    ? JSON.stringify(structuredSummary.integrations) 
    : null,
  model: structuredSummary.model || null,
};

insertSummary(row);

console.log(JSON.stringify({
  title: row.title,
  url: row.url,
  source: "twitter",
  author: mainTweet.author,
  authorHandle: mainTweet.handle,
  type: structuredSummary.type,
  transcriptSource: row.transcriptSource,
  summary: structuredSummary.summary,
  detailedAnalysis: structuredSummary.detailedAnalysis,
  takeaways: structuredSummary.takeaways,
  actionItems: structuredSummary.actionItems,
  skillIdeas: structuredSummary.skillIdeas,
  integrations: structuredSummary.integrations,
  model: structuredSummary.model,
  threadLength: tweets.length,
}, null, 2));
