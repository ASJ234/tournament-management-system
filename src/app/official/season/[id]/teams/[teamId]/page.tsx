import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setTeamCoachAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { AddPlayersForm, SquadEditor } from "@/components/official";
import { Field, FileLinkButton, Input, PageHeader, Section } from "@/components/ui";
import { getDb } from "@/lib/db";
import { getTeam } from "@/lib/league";
import { squadWithStats } from "@/lib/players";
import { loadSeasonForOfficial } from "../../data";

export const metadata: Metadata = { title: "Squad" };

export default async function SquadPage({ params }: { params: Promise<{ id: string; teamId: string }> }) {
  const season = await loadSeasonForOfficial(params);
  const db = getDb();
  const team = await getTeam(db, Number((await params).teamId));
  if (!team || team.seasonId !== season.id) notFound();
  const squad = await squadWithStats(db, team.id);

  return (
    <div className="space-y-6">
      <PageHeader
        level={2}
        title={`${team.name} squad`}
        subtitle={`${squad.length} player${squad.length === 1 ? "" : "s"} registered`}
        back={{ href: `/official/season/${season.id}`, label: "All teams" }}
        actions={
          <div className="flex flex-wrap gap-2">
            <FileLinkButton href={`/season/${season.id}/teams/${team.id}/team-sheet.pdf`} download>
              ⬇️ Team sheet (PDF)
            </FileLinkButton>
            <FileLinkButton href={`/season/${season.id}/teams/${team.id}/fixtures.pdf`} download>
              ⬇️ Fixtures (PDF)
            </FileLinkButton>
          </div>
        }
      />
      <Section title="Coach" description="Shown on the team page. A card can be given to the coach when recording a match.">
        <ActionForm action={setTeamCoachAction} fields={{ teamId: team.id }} className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Head coach" className="min-w-0 flex-1">
              <Input key={team.coach ?? ""} name="coach" maxLength={60} defaultValue={team.coach ?? ""} placeholder="Coach's name (optional)" autoComplete="off" />
            </Field>
            <SubmitButton variant="secondary">Save coach</SubmitButton>
          </div>
        </ActionForm>
      </Section>
      <Section>
        <AddPlayersForm teamId={team.id} />
      </Section>
      {squad.length > 0 && <SquadEditor squad={squad} />}
    </div>
  );
}
