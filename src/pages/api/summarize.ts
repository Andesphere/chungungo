import type { APIRoute } from "astro";
import { nanoid } from "nanoid";
import { insertSummary } from "../../lib/db";
import { summarizeText } from "../../lib/summarize";
import {
  fetchYoutubeTitle,
  fetchYoutubeTranscript,
  isYoutubeUrl,
} from "../../lib/youtube";

export const POST: APIRoute = async ({ request }) => {
  let payload: { url?: string } | null = null;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
    });
  }

  const url = payload?.url?.trim();
  if (!url) {
    return new Response(JSON.stringify({ error: "Missing url." }), {
      status: 400,
    });
  }

  if (!isYoutubeUrl(url)) {
    return new Response(
      JSON.stringify({ error: "Only YouTube URLs are supported in this POC." }),
      { status: 400 }
    );
  }

  try {
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

    return new Response(JSON.stringify(row), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to summarize video." }),
      { status: 500 }
    );
  }
};
