function basicSummary(text: string, sentenceCount = 6) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 700) return cleaned;
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  const pick = sentences.slice(0, sentenceCount).join(" ");
  return pick.length > 0 ? pick : cleaned.slice(0, 900);
}

export async function summarizeText(text: string) {
  const apiUrl = process.env.SUMMARY_API_URL;
  if (!apiUrl) {
    return basicSummary(text);
  }

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    return basicSummary(text);
  }

  const data = (await res.json()) as { summary?: string };
  return data.summary?.trim() || basicSummary(text);
}
