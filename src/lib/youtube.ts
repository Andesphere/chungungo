import { YoutubeTranscript } from "youtube-transcript";

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

export async function fetchYoutubeTranscript(url: string) {
  const items = await YoutubeTranscript.fetchTranscript(url);
  const text = items.map((item) => item.text).join(" ");
  return text;
}
