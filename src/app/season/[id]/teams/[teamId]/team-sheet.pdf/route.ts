import { teamSheetPdfResponse } from "../../../pdf";

/** /season/:id/teams/:teamId/team-sheet.pdf — the team's name, coach and squad as a PDF download. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; teamId: string }> }) {
  const { id, teamId } = await params;
  return teamSheetPdfResponse(id, teamId);
}
