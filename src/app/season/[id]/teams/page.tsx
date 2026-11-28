import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, FileLinkButton } from "@/components/ui";
import { getDb } from "@/lib/db";
import { listGroups, listTeams } from "@/lib/league";
import { countPlayersByTeam } from "@/lib/players";
import type { Team } from "@/lib/types";
import { loadSeason } from "../data";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `${(await loadSeason(params)).name} teams` };
}

export default async function TeamsPage({ params }: Props) {
  const season = await loadSeason(params);
  const db = getDb();
  const teams = await listTeams(db, season.id);
  const groups = await listGroups(db, season.id);
  const squadSize = await countPlayersByTeam(db, season.id);

  if (teams.length === 0) return <EmptyState icon="👥">No teams have been added yet.</EmptyState>;

  const sections: { title: string | null; teams: Team[] }[] = season.format === "groups" && groups.length
    ? [
        ...groups.map((g) => ({ title: g.name, teams: teams.filter((t) => t.groupId === g.id) })),
        { title: "No group", teams: teams.filter((t) => t.groupId == null) },
      ].filter((s) => s.teams.length > 0)
    : [{ title: null, teams }];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Open a team for its squad and matches, or download each team&apos;s fixtures.</p>
        <FileLinkButton href={`/season/${season.id}/fixtures.pdf`} download size="sm">
          ⬇️ All teams&apos; fixtures (PDF)
        </FileLinkButton>
      </div>
      {sections.map((s) => (
        <section key={s.title ?? "all"}>
          {s.title && <h2 className="mb-2 font-bold">{s.title}</h2>}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.teams.map((t) => {
              const n = squadSize.get(t.id) ?? 0;
              return (
                <li key={t.id}>
                  <Link
                    href={`/season/${season.id}/teams/${t.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 hover:border-brand"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{t.name}</span>
                      <span className="text-sm text-muted">{n} player{n === 1 ? "" : "s"}</span>
                    </span>
                    <span aria-hidden className="text-muted">→</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
