import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MatchList } from "@/components/league";
import { Card, FileLinkButton, PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db";
import { getTeam, listGroups } from "@/lib/league";
import { listMatches } from "@/lib/matches";
import { squadWithStats } from "@/lib/players";
import { POSITION_LABEL } from "@/lib/types";
import { loadSeason } from "../../data";

type Props = { params: Promise<{ id: string; teamId: string }> };

async function load(params: Props["params"]) {
  const season = await loadSeason(params);
  const team = await getTeam(getDb(), Number((await params).teamId));
  if (!team || team.seasonId !== season.id) notFound();
  return { season, team };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await load(params)).team.name };
}

export default async function TeamPage({ params }: Props) {
  const { season, team } = await load(params);
  const db = getDb();
  const squad = await squadWithStats(db, team.id);
  const group = season.format === "groups" ? (await listGroups(db, season.id)).find((g) => g.id === team.groupId) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        level={2}
        title={team.name}
        subtitle={[group?.name, team.coach ? `Coach: ${team.coach}` : null].filter(Boolean).join(" · ") || undefined}
        back={{ href: `/season/${season.id}/teams`, label: "All teams" }}
        actions={
          <div className="flex flex-wrap gap-2">
            <FileLinkButton href={`/season/${season.id}/teams/${team.id}/team-sheet.pdf`} download>
              ⬇️ Team sheet (PDF)
            </FileLinkButton>
            <FileLinkButton href={`/season/${season.id}/teams/${team.id}/fixtures.pdf`} target="_blank" rel="noopener">
              📄 Fixtures (PDF)
            </FileLinkButton>
          </div>
        }
      />

      <Card className="overflow-hidden">
        <h3 className="border-b border-border px-4 py-3 font-bold">Squad</h3>
        {squad.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">The squad hasn&apos;t been entered yet.</p>
        ) : (
          <table className="num w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="w-10 py-2 pl-3 text-left sm:w-12 sm:pl-4">No.</th>
                <th className="py-2 text-left">Player</th>
                <th className="hidden py-2 text-left sm:table-cell">Position</th>
                <StatTh title="Goals">⚽</StatTh>
                <StatTh title="Assists">🎯</StatTh>
                <StatTh title="Yellow cards">🟨</StatTh>
                <StatTh title="Red cards" last>🟥</StatTh>
              </tr>
            </thead>
            <tbody>
              {squad.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-2 pl-3 font-semibold text-muted sm:pl-4">{p.number ?? "–"}</td>
                  <td className="max-w-0 py-2 pr-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    {p.position && <span className="block text-xs text-muted sm:hidden">{POSITION_LABEL[p.position]}</span>}
                  </td>
                  <td className="hidden py-2 text-muted sm:table-cell">{p.position ? POSITION_LABEL[p.position] : "–"}</td>
                  <StatTd n={p.goals} />
                  <StatTd n={p.assists} />
                  <StatTd n={p.yellow} />
                  <StatTd n={p.red} last />
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <section>
        <h3 className="mb-2 font-bold">Matches</h3>
        <MatchList
          matches={await listMatches(db, season.id, { teamId: team.id })}
          hrefFor={(m) => `/season/${season.id}/match/${m.id}`}
          emptyText="No matches scheduled yet."
        />
      </section>
    </div>
  );
}

function StatTh({ children, title, last }: { children: React.ReactNode; title: string; last?: boolean }) {
  return <th title={title} className={`w-9 py-2 text-center sm:w-12 ${last ? "pr-3 sm:pr-4" : ""}`}>{children}</th>;
}

function StatTd({ n, last }: { n: number; last?: boolean }) {
  return <td className={`py-2 text-center ${last ? "pr-3 sm:pr-4" : ""} ${n ? "font-bold" : "text-muted"}`}>{n || "·"}</td>;
}
