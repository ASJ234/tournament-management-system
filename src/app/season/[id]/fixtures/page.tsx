import type { Metadata } from "next";
import { MatchList } from "@/components/league";
import { DownloadButton } from "@/components/ui";
import { getDb } from "@/lib/db";
import { fixtureCount, listMatches } from "@/lib/matches";
import { loadSeason } from "../data";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `${(await loadSeason(params)).name} fixtures` };
}

export default async function FixturesPage({ params }: Props) {
  const season = await loadSeason(params);
  const db = getDb();
  const upcoming = (await listMatches(db, season.id)).filter((m) => !m.played);
  const any = (await fixtureCount(db, season.id)) > 0;

  return (
    <div className="space-y-4">
      {any && (
        <div className="flex justify-end">
          <DownloadButton href={`/season/${season.id}/fixtures.pdf`} size="sm">
            ⬇️ Fixtures by team (PDF)
          </DownloadButton>
        </div>
      )}
      <MatchList
        matches={upcoming}
        hrefFor={(m) => `/season/${season.id}/match/${m.id}`}
        emptyText={any ? "All matches have been played. 🎉" : "Fixtures haven't been published yet."}
      />
    </div>
  );
}
