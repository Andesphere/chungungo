import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SummaryType } from "./db";

/**
 * Load project context for AI summarization
 */
function loadProjectContext(): string {
  const contextPath = join(
    process.env.HOME || "/Users/aljorgevi",
    "clawd/context/PROJECT_CONTEXT.md"
  );
  
  if (existsSync(contextPath)) {
    try {
      return readFileSync(contextPath, "utf-8");
    } catch {
      console.error("[summarize] Failed to load PROJECT_CONTEXT.md");
    }
  }
  return "";
}

function basicSummary(text: string, sentenceCount = 6) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 700) return cleaned;
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  const pick = sentences.slice(0, sentenceCount).join(" ");
  return pick.length > 0 ? pick : cleaned.slice(0, 900);
}

/**
 * Maximum transcript length to send to the AI.
 */
const MAX_TRANSCRIPT_LENGTH = 50000;

function truncateTranscript(text: string): string {
  if (text.length <= MAX_TRANSCRIPT_LENGTH) return text;
  
  const keepStart = Math.floor(MAX_TRANSCRIPT_LENGTH * 0.7);
  const keepEnd = MAX_TRANSCRIPT_LENGTH - keepStart - 100;
  
  return (
    text.slice(0, keepStart) +
    "\n\n[... transcript truncated for length ...]\n\n" +
    text.slice(-keepEnd)
  );
}

export type StructuredSummary = {
  type: SummaryType;
  summary: string;
  detailedAnalysis: string;
  takeaways: string[];
  actionItems: string[];
  skillIdeas: string[];      // For coding/AI videos
  integrations: string[];    // Pudu/Clawdbot integration opportunities
  model: string | null;      // AI model used for summarization
};

/**
 * Build the enhanced summarization prompt
 */
function buildPrompt(transcript: string): string {
  const projectContext = loadProjectContext();
  
  return `You are an intelligent content analyzer. Analyze this content and provide a structured summary.

${projectContext ? `## PROJECT CONTEXT (use this for skill ideas and integration suggestions)

${projectContext}

---

` : ""}INSTRUCTIONS:
1. First, classify the video type based on content:
   - "coding" = programming tutorials, dev tools, software engineering
   - "ai" = AI/ML, LLMs, agents, automation tools, AI products
   - "productivity" = workflows, note-taking, task management, time management
   - "general" = anything else (entertainment, news, vlogs, etc.)

2. For ALL videos, provide:
   - A 2-3 sentence high-level summary
   - 3-5 key takeaways
   - 1-3 suggested action items

3. For "coding", "ai", or "productivity" videos, ALSO provide:
   - A detailed analysis (4-6 sentences) focusing on practical applications
   - Skill ideas: Clawdbot skills that could be created based on this content
   - Integration opportunities: How concepts could enhance Pudu or Clawdbot

OUTPUT FORMAT (respond with ONLY valid JSON, no markdown):
{
  "type": "coding" | "ai" | "productivity" | "general",
  "summary": "High-level summary in 2-3 sentences",
  "detailedAnalysis": "Deeper analysis for technical videos, empty string for general",
  "takeaways": ["Key point 1", "Key point 2", "Key point 3"],
  "actionItems": ["Action 1", "Action 2"],
  "skillIdeas": ["Skill idea 1", "Skill idea 2"],
  "integrations": ["Integration opportunity 1", "Integration opportunity 2"]
}

TRANSCRIPT:
${truncateTranscript(transcript)}

JSON:`;
}

/** Map agent names to friendly model names */
const agentModelMap: Record<string, string> = {
  "echo": "GPT-5.2 Codex",
  "main": "Claude Opus 4.5",
  "worker-gemini": "Gemini 3 Flash",
  "worker-haiku": "Claude Haiku 4",
  "worker-sonnet": "Claude Sonnet 4",
};

/**
 * Resolve clawdbot binary path
 */
function resolveClawdbotPath(): string {
  const candidates = [
    process.env.CLAWDBOT_PATH,
    join(process.env.HOME || "", ".npm-global/bin/clawdbot"),
    "/usr/local/bin/clawdbot",
    "clawdbot", // fallback to PATH
  ].filter(Boolean) as string[];
  
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return "clawdbot"; // fallback
}

/**
 * Call Clawdbot agent for AI summarization
 */
async function clawdbotSummarize(text: string): Promise<StructuredSummary | null> {
  const clawdbotBin = resolveClawdbotPath();
  const agent = process.env.CLAWDBOT_SUMMARIZER_AGENT || "echo";
  const timeout = process.env.CLAWDBOT_SUMMARIZER_TIMEOUT || "180";
  const thinking = process.env.CLAWDBOT_SUMMARIZER_THINKING || "medium";
  
  const prompt = buildPrompt(text);
  
  const args = [
    "agent",
    "--agent", agent,
    "--message", prompt,
    "--json",
    "--timeout", timeout
  ];
  
  // Add thinking level if specified
  if (thinking && thinking !== "off") {
    args.push("--thinking", thinking);
  }
  
  return new Promise((resolve) => {
    const child = spawn(clawdbotBin, args);
    
    let stdout = "";
    let stderr = "";
    
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    
    child.on("error", (err) => {
      console.error("[summarize] clawdbot spawn error:", err.message);
      resolve(null);
    });
    
    child.on("close", (code) => {
      if (code !== 0) {
        console.error("[summarize] clawdbot exited with code:", code);
        if (stderr) console.error("[summarize] stderr:", stderr);
        resolve(null);
        return;
      }
      
      try {
        const data = JSON.parse(stdout);
        
        if (data.status !== "ok" || !data.result?.payloads?.[0]?.text) {
          console.error("[summarize] unexpected clawdbot response:", data.status);
          resolve(null);
          return;
        }
        
        const responseText = data.result.payloads[0].text.trim();
        
        // Try to extract JSON from the response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.error("[summarize] no JSON found in response");
          resolve(null);
          return;
        }
        
        const parsed = JSON.parse(jsonMatch[0]) as StructuredSummary;
        
        // Get model name from agent or response metadata
        const thinking = process.env.CLAWDBOT_SUMMARIZER_THINKING || "medium";
        let modelName = agentModelMap[agent] || data.result?.model || agent;
        if (thinking && thinking !== "off") {
          modelName = `${modelName} (${thinking})`; // e.g. "GPT-5.2 Codex (medium)"
        }
        
        // Validate and normalize
        const result: StructuredSummary = {
          type: ["coding", "ai", "productivity", "general"].includes(parsed.type) 
            ? parsed.type 
            : "general",
          summary: parsed.summary || "",
          detailedAnalysis: parsed.detailedAnalysis || "",
          takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways : [],
          actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
          skillIdeas: Array.isArray(parsed.skillIdeas) ? parsed.skillIdeas : [],
          integrations: Array.isArray(parsed.integrations) ? parsed.integrations : [],
          model: modelName,
        };
        
        resolve(result);
      } catch (err) {
        console.error("[summarize] failed to parse clawdbot output:", err);
        resolve(null);
      }
    });
  });
}

/**
 * Legacy API-based summarization (if SUMMARY_API_URL is set)
 */
async function apiSummarize(text: string): Promise<string | null> {
  const apiUrl = process.env.SUMMARY_API_URL;
  if (!apiUrl) return null;
  
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    
    if (!res.ok) return null;
    
    const data = (await res.json()) as { summary?: string };
    return data.summary?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Create a fallback structured summary from basic text
 */
function createFallbackSummary(text: string): StructuredSummary {
  const summary = basicSummary(text);
  return {
    type: "general",
    summary,
    detailedAnalysis: "",
    takeaways: [],
    actionItems: [],
    skillIdeas: [],
    integrations: [],
    model: "fallback",
  };
}

/**
 * Main summarization function - returns structured summary
 */
export async function summarizeText(text: string): Promise<StructuredSummary> {
  // Try legacy API first (for backwards compatibility)
  const apiResult = await apiSummarize(text);
  if (apiResult) {
    return {
      type: "general",
      summary: apiResult,
      detailedAnalysis: "",
      takeaways: [],
      actionItems: [],
      skillIdeas: [],
      integrations: [],
      model: "legacy-api",
    };
  }
  
  // Try Clawdbot agent summarization
  const clawdbotResult = await clawdbotSummarize(text);
  if (clawdbotResult) return clawdbotResult;
  
  // Fallback to basic sentence extraction
  console.log("[summarize] falling back to basic summary");
  return createFallbackSummary(text);
}

/**
 * Simple summarization (legacy compatibility)
 */
export async function summarizeTextSimple(text: string): Promise<string> {
  const result = await summarizeText(text);
  return result.summary;
}
