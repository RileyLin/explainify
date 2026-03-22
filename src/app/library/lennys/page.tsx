import fs from "fs";
import path from "path";
import { LennysLibraryClient } from "./library-client";

export interface PodcastEntry {
  title: string;
  filename: string;
  tags: string[];
  word_count: number;
  date: string;
  description: string;
  guest?: string;
  type: "podcast";
}

export interface NewsletterEntry {
  title: string;
  filename: string;
  tags: string[];
  word_count: number;
  date: string;
  description: string;
  type: "newsletter";
}

export type LibraryEntry = PodcastEntry | NewsletterEntry;

export interface GeneratedEntry {
  slug: string;
  template: string;
  title: string;
}

function loadLibraryData(): {
  entries: LibraryEntry[];
  generated: Record<string, GeneratedEntry[]>;
} {
  const indexPath = path.join(process.cwd(), "public", "data", "lennys-index.json");
  const generatedPath = path.join(process.cwd(), "public", "data", "lennys-generated.json");

  const raw = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  const generated: Record<string, GeneratedEntry[]> = JSON.parse(
    fs.readFileSync(generatedPath, "utf-8")
  );

  const podcasts: PodcastEntry[] = (raw.podcasts || []).map(
    (p: Omit<PodcastEntry, "type">) => ({ ...p, type: "podcast" as const })
  );
  const newsletters: NewsletterEntry[] = (raw.newsletters || []).map(
    (n: Omit<NewsletterEntry, "type">) => ({ ...n, type: "newsletter" as const })
  );

  // Sort newest first
  const entries: LibraryEntry[] = [...podcasts, ...newsletters].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return { entries, generated };
}

export default function LennysLibraryPage() {
  const { entries, generated } = loadLibraryData();

  const podcastCount = entries.filter((e) => e.type === "podcast").length;
  const newsletterCount = entries.filter((e) => e.type === "newsletter").length;

  return (
    <LennysLibraryClient
      entries={entries}
      generated={generated}
      podcastCount={podcastCount}
      newsletterCount={newsletterCount}
    />
  );
}
