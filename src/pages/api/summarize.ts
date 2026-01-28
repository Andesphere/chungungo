import type { APIRoute } from "astro";
import { nanoid } from "nanoid";
import { insertSummary, type SummaryRow } from "../../lib/db";
import { summarizeText } from "../../lib/summarize";
import {
  fetchYoutubeTitle,
  fetchYoutubeTranscript,
  isYoutubeUrl,
} from "../../lib/youtube";

export const prerender = false;

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
    const structuredSummary = await summarizeText(transcriptResult.text);
    const title = await fetchYoutubeTitle(url);
    const createdAt = new Date().toISOString();
    
    const row: SummaryRow = {
      id: nanoid(),
      source: "youtube",
      url,
      title,
      transcript: transcriptResult.text,
      summary: structuredSummary.summary,
      transcriptSource: transcriptResult.source,
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
    };

    insertSummary(row);

    // Return parsed data for the frontend
    return new Response(JSON.stringify({
      ...row,
      takeaways: structuredSummary.takeaways,
      actionItems: structuredSummary.actionItems,
      skillIdeas: structuredSummary.skillIdeas,
      integrations: structuredSummary.integrations,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/summarize] Error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to summarize video." }),
      { status: 500 }
    );
  }
};
