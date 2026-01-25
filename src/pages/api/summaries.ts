import type { APIRoute } from "astro";
import { listSummaries } from "../../lib/db";

export const GET: APIRoute = async () => {
  const summaries = listSummaries();
  return new Response(JSON.stringify({ summaries }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
