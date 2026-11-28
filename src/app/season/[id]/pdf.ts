import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getSeason, getTeam, listGroups, listTeams } from "@/lib/league";
import { listMatches } from "@/lib/matches";
import { fixturesPdf, teamSheetPdf } from "@/lib/pdf";
import { listPlayers } from "@/lib/players";
import { POSITION_LABEL } from "@/lib/types";

const slug = (s: string) => s.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "fixtures";

/**
 * A team's fixtures (or, with no team, every team's, ordered by group) as a PDF
 * download. Public, like the rest of the season pages.
 */
export async function fixturesPdfResponse(seasonIdRaw: string, teamIdRaw?: string): Promise<Response> {
  const db = getDb();
  const season = await getSeason(db, Number(seasonIdRaw));
  if (!season) return new Response("Season not found", { status: 404 });

  const allTeams = await listTeams(db, season.id);
  const teams = teamIdRaw == null ? allTeams : allTeams.filter((t) => t.id === Number(teamIdRaw));
  if (teamIdRaw != null && teams.length === 0) return new Response("Team not found", { status: 404 });

  const groups = await listGroups(db, season.id); // in name order: Group A, Group B…
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  // Group by group (teams without a group last), then by name.
  if (season.format === "groups") {
    const order = new Map(groups.map((g, i) => [g.id, i]));
    teams.sort((a, b) => (order.get(a.groupId ?? -1) ?? groups.length) - (order.get(b.groupId ?? -1) ?? groups.length));
  }
  const matches = await listMatches(db, season.id);
  const bytes = await fixturesPdf({
    seasonName: season.name,
    generatedOn: formatDate(new Date().toISOString().slice(0, 10)),
    teams: teams.map((t) => ({
      teamId: t.id,
      team: t,
      groupName: season.format === "groups" && t.groupId != null ? groupName.get(t.groupId) ?? null : null,
      matches: matches.filter((m) => m.home.id === t.id || m.away.id === t.id),
    })),
  });

  const name = teams.length === 1 ? `${slug(teams[0].name)}-fixtures-${slug(season.name)}.pdf` : `${slug(season.name)}-fixtures-by-team.pdf`;
  return new Response(new Blob([bytes as BlobPart], { type: "application/pdf" }), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** A team's sheet (name, coach, squad) as a PDF download. Public, like the team page. */
export async function teamSheetPdfResponse(seasonIdRaw: string, teamIdRaw: string): Promise<Response> {
  const db = getDb();
  const season = await getSeason(db, Number(seasonIdRaw));
  if (!season) return new Response("Season not found", { status: 404 });
  const team = await getTeam(db, Number(teamIdRaw));
  if (!team || team.seasonId !== season.id) return new Response("Team not found", { status: 404 });

  const group = season.format === "groups" && team.groupId != null
    ? (await listGroups(db, season.id)).find((g) => g.id === team.groupId)
    : undefined;
  const players = await listPlayers(db, team.id);
  const bytes = await teamSheetPdf({
    seasonName: season.name,
    groupName: group?.name ?? null,
    team,
    players: players.map((p) => ({ name: p.name, number: p.number, position: p.position ? POSITION_LABEL[p.position] : null })),
    generatedOn: formatDate(new Date().toISOString().slice(0, 10)),
  });

  const name = `${slug(team.name)}-team-sheet-${slug(season.name)}.pdf`;
  return new Response(new Blob([bytes as BlobPart], { type: "application/pdf" }), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
