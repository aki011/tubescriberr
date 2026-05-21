import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";
import { generateText, Output } from "ai";
import { generateObject } from "ai";
import { YoutubeTranscript } from "youtube-transcript";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

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
          const items = await YoutubeTranscript.fetchTranscript(videoId);
          transcript = items.map((i) => i.text).join(" ").replace(/\s+/g, " ").trim();
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

        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-3-flash-preview");

        try {
          const { object } = await generateObject({
            model,
            schema: z.object({
              shortSummary: z.string().describe("3-4 line concise summary"),
              detailedSummary: z.string().describe("comprehensive multi-paragraph summary"),
              bulletPoints: z.array(z.string()).min(3).max(12),
              actionableInsights: z.array(z.string()).min(3).max(10),
            }),
            prompt: `Analyze the following YouTube transcript and provide:
1. Short Summary (3-4 lines)
2. Detailed Summary (multi-paragraph, thorough)
3. Key Bullet Points (5-10 items)
4. Actionable Insights / Key Takeaways (3-7 practical takeaways)

${truncated ? "(NOTE: transcript was truncated to fit token limits)\n" : ""}TRANSCRIPT:
${transcriptForModel}`,
          });

          return Response.json({
            videoId,
            meta,
            truncated,
            ...object,
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
