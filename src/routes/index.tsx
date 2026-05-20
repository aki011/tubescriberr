import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Toaster, toast } from "sonner";
import { Loader2, Sparkles, Copy, Download, Youtube, Wand2 } from "lucide-react";

type SummaryResponse = {
  videoId: string;
  meta: { title: string; author: string; thumbnail: string } | null;
  truncated: boolean;
  shortSummary: string;
  detailedSummary: string;
  bulletPoints: string[];
  actionableInsights: string[];
};

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SummaryResponse | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      toast.error("Please enter a YouTube URL");
      return;
    }
    setLoading(true);
    setData(null);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Something went wrong");
        return;
      }
      setData(json as SummaryResponse);
      toast.success("Summary ready");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Copy failed"),
    );
  }

  function download() {
    if (!data) return;
    const lines = [
      `YouTube AI Summary`,
      `==================`,
      ``,
      `Title: ${data.meta?.title ?? ""}`,
      `Channel: ${data.meta?.author ?? ""}`,
      `URL: https://www.youtube.com/watch?v=${data.videoId}`,
      ``,
      `SHORT SUMMARY`,
      `-------------`,
      data.shortSummary,
      ``,
      `DETAILED SUMMARY`,
      `----------------`,
      data.detailedSummary,
      ``,
      `KEY BULLET POINTS`,
      `-----------------`,
      ...data.bulletPoints.map((b) => `• ${b}`),
      ``,
      `ACTIONABLE INSIGHTS`,
      `-------------------`,
      ...data.actionableInsights.map((b) => `→ ${b}`),
    ].join("\n");
    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `summary-${data.videoId}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Downloaded");
  }

  return (
    <div className="min-h-screen bg-hero">
      <Toaster position="top-center" theme="dark" richColors />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-primary shadow-glow">
            <Youtube className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-semibold">Tubescribe AI</span>
        </div>
        <span className="hidden text-xs text-muted-foreground sm:block">Powered by Lovable AI · Gemini</span>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24">
        <section className="pt-10 pb-12 text-center">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Turn any video into knowledge in seconds
          </div>
          <h1 className="font-display text-4xl font-bold leading-tight sm:text-6xl">
            Summarize YouTube videos <span className="text-gradient">instantly</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Paste a link. Get a short summary, a deep dive, key bullets, and
            actionable takeaways — built for analysts, students, and curious minds.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mx-auto mt-8 flex w-full max-w-2xl flex-col gap-3 rounded-2xl border border-border bg-card/70 p-3 shadow-card backdrop-blur sm:flex-row"
          >
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="min-w-0 flex-1 rounded-xl bg-input/70 px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-95 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {loading ? "Summarizing…" : "Generate Summary"}
            </button>
          </form>
        </section>

        {loading && (
          <div className="grid animate-pulse gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-40 rounded-2xl border border-border bg-card/60" />
            ))}
          </div>
        )}

        {data && !loading && (
          <section className="space-y-6">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card sm:flex">
              {data.meta?.thumbnail && (
                <img
                  src={data.meta.thumbnail}
                  alt={data.meta.title}
                  className="h-48 w-full object-cover sm:h-auto sm:w-72"
                />
              )}
              <div className="flex flex-1 flex-col justify-between gap-3 p-5">
                <div>
                  <h2 className="font-display text-xl font-semibold">{data.meta?.title}</h2>
                  {data.meta?.author && (
                    <p className="mt-1 text-sm text-muted-foreground">{data.meta.author}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`https://www.youtube.com/watch?v=${data.videoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Youtube className="h-3.5 w-3.5" /> Open on YouTube
                  </a>
                  <button
                    onClick={download}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Download className="h-3.5 w-3.5" /> Download .txt
                  </button>
                </div>
              </div>
            </div>

            <ResultCard title="Short Summary" accent onCopy={() => copy(data.shortSummary, "Short summary")}>
              <p className="text-base leading-relaxed">{data.shortSummary}</p>
            </ResultCard>

            <ResultCard title="Detailed Summary" onCopy={() => copy(data.detailedSummary, "Detailed summary")}>
              <p className="whitespace-pre-wrap leading-relaxed text-foreground/90">{data.detailedSummary}</p>
            </ResultCard>

            <div className="grid gap-6 md:grid-cols-2">
              <ResultCard
                title="Key Bullet Points"
                onCopy={() => copy(data.bulletPoints.map((b) => `• ${b}`).join("\n"), "Bullets")}
              >
                <ul className="space-y-2">
                  {data.bulletPoints.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </ResultCard>

              <ResultCard
                title="Actionable Insights"
                onCopy={() => copy(data.actionableInsights.map((b) => `→ ${b}`).join("\n"), "Insights")}
              >
                <ul className="space-y-2">
                  {data.actionableInsights.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed">
                      <span className="font-semibold text-accent">→</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </ResultCard>
            </div>

            {data.truncated && (
              <p className="text-center text-xs text-muted-foreground">
                Note: the transcript was very long and was truncated before summarization.
              </p>
            )}
          </section>
        )}

        {!data && !loading && (
          <section className="grid gap-4 sm:grid-cols-3">
            {[
              { t: "Paste any URL", d: "Standard videos, Shorts, and youtu.be links all work." },
              { t: "Structured output", d: "Short, detailed, bullets, and takeaways — every time." },
              { t: "Export anywhere", d: "Copy any section or download the whole summary as text." },
            ].map((f) => (
              <div key={f.t} className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur">
                <h3 className="font-display font-semibold">{f.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </section>
        )}
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Built with Lovable · TanStack Start · Gemini via Lovable AI Gateway
      </footer>
    </div>
  );
}

function ResultCard({
  title,
  children,
  onCopy,
  accent,
}: {
  title: string;
  children: React.ReactNode;
  onCopy: () => void;
  accent?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl border border-border p-6 shadow-card backdrop-blur ${
        accent ? "bg-gradient-to-br from-card to-card/60 ring-1 ring-primary/30" : "bg-card/80"
      }`}
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <Copy className="h-3 w-3" /> Copy
        </button>
      </header>
      {children}
    </article>
  );
}
