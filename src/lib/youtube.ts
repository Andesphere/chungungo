import { YoutubeTranscript } from "youtube-transcript";
import { spawn, execSync } from "node:child_process";
import { join } from "node:path";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const YOUTUBE_URL_REGEX = /(youtu.be\/|youtube.com\/watch\?v=|youtube.com\/shorts\/)([\w-]{11})/;

export function isYoutubeUrl(url: string) {
  return YOUTUBE_URL_REGEX.test(url);
}

export function extractVideoId(url: string): string | null {
  const match = url.match(YOUTUBE_URL_REGEX);
  return match ? match[2] : null;
}

export async function fetchYoutubeTitle(url: string) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    return data.title ?? null;
  } catch {
    return null;
  }
}

/**
 * Parse VTT subtitle file and extract plain text
 */
function parseVttToText(vttContent: string): string {
  const lines = vttContent.split("\n");
  const textLines: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    // Skip WEBVTT header, timestamps, positioning
    if (
      line.startsWith("WEBVTT") ||
      line.startsWith("Kind:") ||
      line.startsWith("Language:") ||
      line.includes("-->") ||
      line.includes("align:") ||
      line.trim() === ""
    ) {
      continue;
    }

    // Remove VTT timing tags like <00:00:00.640><c>
    const cleanLine = line
      .replace(/<[\d:.]+>/g, "")
      .replace(/<\/?c>/g, "")
      .replace(/<\/?[^>]+>/g, "")
      .trim();

    if (cleanLine && !seen.has(cleanLine)) {
      seen.add(cleanLine);
      textLines.push(cleanLine);
    }
  }

  return textLines.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Fetch auto-generated captions using yt-dlp
 */
async function fetchAutoSubsWithYtDlp(url: string): Promise<string> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("Invalid YouTube URL");

  const tmpDir = mkdtempSync(join(tmpdir(), "yt-subs-"));

  try {
    // Try auto-generated subs first, then regular subs
    execSync(
      `yt-dlp --write-auto-sub --sub-lang en --skip-download --sub-format vtt -o "${join(tmpDir, "sub")}" "${url}"`,
      { encoding: "utf-8", timeout: 60000, stdio: ["pipe", "pipe", "pipe"] }
    );

    // Find the VTT file
    const vttPath = join(tmpDir, `sub.en.vtt`);
    const vttContent = readFileSync(vttPath, "utf-8");
    return parseVttToText(vttContent);
  } finally {
    try {
      rmSync(tmpDir, { recursive: true });
    } catch {}
  }
}

export async function fetchYoutubeTranscript(url: string) {
  // Try youtube-transcript library first (fastest)
  try {
    const items = await YoutubeTranscript.fetchTranscript(url);
    const text = items.map((item) => item.text).join(" ").trim();
    if (text.length > 0) {
      return { text, source: "captions" as const };
    }
  } catch {
    // fall through to yt-dlp
  }

  // Fallback: use yt-dlp to get auto-generated captions
  const fallback = await fetchAutoSubsWithYtDlp(url);
  return { text: fallback, source: "auto-captions" as const };
}
