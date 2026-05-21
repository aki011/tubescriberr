import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";
import { YoutubeTranscript } from "youtube-transcript";

// Extract YouTube video id from many URL shapes (watch, youtu.be, shorts, embed)
function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "v") {
        return parts[1] ?? null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Fetch oEmbed metadata (title, author, thumbnail) — no API key needed
async function fetchVideoMeta(videoId: string) {
  const res = await fetch(
    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
  return {
    title: data.title ?? "Untitled video",
    author: data.author_name ?? "",
    thumbnail: data.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

function cleanTranscript(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function extractTranscriptText(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (Array.isArray(payload)) return payload.map(extractTranscriptText).filter(Boolean).join(" ");
  if (!payload || typeof payload !== "object") return "";

  const record = payload as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  if (typeof record.transcript === "string") return record.transcript;
  if (Array.isArray(record.transcript)) return extractTranscriptText(record.transcript);
  if (Array.isArray(record.snippets)) return extractTranscriptText(record.snippets);
  if (Array.isArray(record.success)) return extractTranscriptText(record.success[0]);
  return "";
}

function parseSummaryJson(text: string) {
  const jsonText = text.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  const parsed = JSON.parse(jsonText) as Partial<{
    shortSummary: string;
    detailedSummary: string;
    bulletPoints: string[];
    actionableInsights: string[];
  }>;

  return {
    shortSummary: parsed.shortSummary || "Summary unavailable.",
    detailedSummary: parsed.detailedSummary || parsed.shortSummary || "Detailed summary unavailable.",
    bulletPoints: Array.isArray(parsed.bulletPoints) ? parsed.bulletPoints : [],
    actionableInsights: Array.isArray(parsed.actionableInsights) ? parsed.actionableInsights : [],
  };
}

function randomHex(length: number) {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

async function fetchTranscriptFromFallback(videoId: string) {
  // Public Firebase browser key used by youtube-transcript.io for anonymous auth.
  const publicFirebaseKey = "AIzaSyC02AJ8YNuHAUKTf8e8u8orfZwTrLmqBeo";
  const authRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${publicFirebaseKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
    },
  );
  if (!authRes.ok) throw new Error(`Fallback auth failed: ${authRes.status}`);

  const auth = (await authRes.json()) as { idToken?: string };
  if (!auth.idToken) throw new Error("Fallback auth token missing");

  const transcriptRes = await fetch("https://www.youtube-transcript.io/api/transcripts/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.idToken}`,
      "x-request-channel": "9527-c",
      "X-Hash": randomHex(64),
    },
    body: JSON.stringify({ ids: [videoId], source: "video" }),
  });
  if (!transcriptRes.ok) throw new Error(`Fallback transcript failed: ${transcriptRes.status}`);

  const payload = await transcriptRes.json();
  const text = cleanTranscript(extractTranscriptText(payload));
  if (!text || text.toLowerCase().includes("youtube is currently blocking")) {
    throw new Error("Fallback transcript was empty");
  }
  return text;
}

async function fetchTranscript(videoId: string) {
  const errors: string[] = [];

  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId);
    const text = cleanTranscript(items.map((i) => i.text).join(" "));
    if (text) return text;
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  try {
    return await fetchTranscriptFromFallback(videoId);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  console.warn("Transcript extraction failed:", errors);
  throw new Error("Transcript not available for this video");
}

async function generateSummary(apiKey: string, transcriptForModel: string, truncated: boolean) {
  const prompt = `Return ONLY valid JSON with this exact shape:
{
  "shortSummary": "3-4 concise lines",
  "detailedSummary": "multi-paragraph detailed summary",
  "bulletPoints": ["5-10 key points"],
  "actionableInsights": ["3-7 practical takeaways"]
}

Analyze this YouTube transcript for a business analyst audience.

${truncated ? "(NOTE: transcript was truncated to fit token limits)\n" : ""}TRANSCRIPT:
${transcriptForModel}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "direct-fetch",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const error = new Error(`AI gateway failed: ${res.status}`) as Error & { statusCode?: number };
    error.statusCode = res.status;
    throw error;
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("AI gateway returned an empty response");
  return parseSummaryJson(text);
}

export const Route = createFileRoute("/api/summarize")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const body = (await request.json().catch(() => ({}))) as { url?: string };
        const videoId = body.url ? extractVideoId(body.url) : null;
        if (!videoId) {
          return Response.json({ error: "Please enter a valid YouTube URL" }, { status: 400 });
        }

        // 1. Fetch transcript
        let transcript = "";
        try {
          transcript = await fetchTranscript(videoId);
        } catch (err) {
          const msg = err instanceof Error ? err.message.toLowerCase() : "";
          if (msg.includes("disabled") || msg.includes("transcript")) {
            return Response.json(
              { error: "Transcript not available for this video" },
              { status: 404 },
            );
          }
          if (msg.includes("unavailable") || msg.includes("private")) {
            return Response.json(
              { error: "Video is private or inaccessible" },
              { status: 404 },
            );
          }
          return Response.json(
            { error: "Transcript not available for this video" },
            { status: 404 },
          );
        }

        if (transcript.length < 80) {
          return Response.json(
            { error: "Transcript is too short to summarize" },
            { status: 422 },
          );
        }

        // 2. Trim very long transcripts to stay within token limits (~30k chars)
        const MAX_CHARS = 30000;
        const truncated = transcript.length > MAX_CHARS;
        const transcriptForModel = truncated ? transcript.slice(0, MAX_CHARS) : transcript;

        // 3. Fetch video metadata in parallel-friendly way
        const meta = await fetchVideoMeta(videoId).catch(() => null);

        // 4. Call Lovable AI Gateway (Gemini) for structured summary
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return Response.json({ error: "AI service temporarily unavailable" }, { status: 503 });
        }

        try {
          const summary = await generateSummary(apiKey, transcriptForModel, truncated);

          return Response.json({
            videoId,
            meta,
            truncated,
            ...summary,
          });
        } catch (err) {
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 429) {
            return Response.json(
              { error: "Rate limit reached. Please try again in a moment." },
              { status: 429 },
            );
          }
          if (status === 402) {
            return Response.json(
              { error: "AI credits exhausted. Please add credits in workspace settings." },
              { status: 402 },
            );
          }
          console.error("AI gateway error:", err);
          return Response.json(
            { error: "AI service temporarily unavailable" },
            { status: 503 },
          );
        }
      },
    },
  },
});
