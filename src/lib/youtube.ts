import { YoutubeTranscript } from "youtube-transcript";
import { spawn } from "node:child_process";
import { join } from "node:path";

const YOUTUBE_URL_REGEX = /(youtu.be\/|youtube.com\/watch\?v=|youtube.com\/shorts\/)([\w-]{11})/;

export function isYoutubeUrl(url: string) {
  return YOUTUBE_URL_REGEX.test(url);
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

async function transcribeWithWhisper(url: string) {
  const pythonPath =
    process.env.WHISPER_PYTHON ?? join(process.cwd(), ".venv", "bin", "python");
  const scriptPath = join(process.cwd(), "scripts", "transcribe.py");

  return await new Promise<string>((resolve, reject) => {
    const child = spawn(pythonPath, [scriptPath, url]);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Whisper failed with code ${code}`));
        return;
      }

      try {
        const lastLine = stdout.trim().split("\n").pop();
        if (!lastLine) throw new Error("Empty output");
        const data = JSON.parse(lastLine);
        resolve((data.transcript ?? "").trim());
      } catch (error) {
        reject(new Error("Whisper output was invalid."));
      }
    });
  });
}

export async function fetchYoutubeTranscript(url: string) {
  try {
    const items = await YoutubeTranscript.fetchTranscript(url);
    const text = items.map((item) => item.text).join(" ").trim();
    if (text.length > 0) return text;
  } catch {
    // fall through to whisper
  }

  const fallback = await transcribeWithWhisper(url);
  return fallback;
}
