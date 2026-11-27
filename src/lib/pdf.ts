import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import { formatDate } from "./format";
import type { Match } from "./types";

/**
 * Fixture lists as a printable PDF (A4 landscape): one section per team, with its matches
 * in date order. With several teams, the first page lists them all and the sections follow
 * one another, a team moving to the next page only when it won't fit. Uses the PDF built-in Helvetica, so
 * text outside its character set (e.g. emoji) is simplified or replaced.
 */

export type TeamFixtures = {
  team: { name: string; coach: string | null };
  groupName: string | null;
  matches: Match[];
  teamId: number;
};

const PAGE: [number, number] = [841.89, 595.28]; // A4 landscape, in points
const MARGIN = 36;
const ROW_H = 20;
const BRAND = rgb(0.06, 0.4, 0.27);
const MUTED = rgb(0.4, 0.44, 0.5);
const LINE = rgb(0.86, 0.89, 0.92);
const ZEBRA = rgb(0.96, 0.97, 0.98);

const COLUMNS = [
  { key: "round", label: "Round", width: 95 },
  { key: "date", label: "Date", width: 100 },
  { key: "kickoff", label: "Kick-off", width: 50 },
  { key: "side", label: "H/A", width: 32 },
  { key: "opponent", label: "Opponent", width: 150 },
  { key: "venue", label: "Venue", width: 125 },
  { key: "referee", label: "Referee", width: 120 },
  { key: "result", label: "Result", width: 97 },
] as const;
type Column = (typeof COLUMNS)[number]["key"];

/** Characters Helvetica (WinAnsi) can draw besides printable ASCII and Latin-1. */
const EXTRA = new Set("–—‘’“”•…€‚„†‡ˆ‰Š‹ŒŽ˜™š›œžŸ");

/** Keeps text drawable: accents are kept where possible, anything else becomes "?". */
export function pdfSafe(text: string): string {
  let out = "";
  for (const ch of text.replace(/\s+/g, " ")) {
    const code = ch.codePointAt(0)!;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || EXTRA.has(ch)) {
      out += ch;
      continue;
    }
    const plain = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    out += /^[\x20-\x7e]+$/.test(plain) ? plain : "?";
  }
  return out.trim();
}

/** Cuts text with "…" so it fits the width. */
function fit(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function cells(m: Match, teamId: number): Record<Column, string> {
  const home = m.home.id === teamId;
  const opponent = home ? m.away.name : m.home.name;
  let result = "–";
  if (m.played) {
    const us = home ? m.homeScore! : m.awayScore!;
    const them = home ? m.awayScore! : m.homeScore!;
    if (m.homePens != null && m.awayPens != null) {
      const usP = home ? m.homePens : m.awayPens;
      const themP = home ? m.awayPens : m.homePens;
      result = `${usP > themP ? "W" : "L"}  ${us}–${them} (${usP}–${themP} p)`;
    } else {
      result = `${us > them ? "W" : us < them ? "L" : "D"}  ${us}–${them}`;
    }
  }
  const round = m.stage ?? [m.groupName, m.round > 0 ? `MD${m.round}` : null].filter(Boolean).join(" · ");
  return {
    round: round || "–",
    date: formatDate(m.date),
    kickoff: m.kickoff ?? "–",
    side: home ? "H" : "A",
    opponent,
    venue: m.venue ?? "–",
    referee: m.referee ?? "–",
    result,
  };
}

export async function fixturesPdf(input: { seasonName: string; teams: TeamFixtures[]; generatedOn: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const title = input.teams.length === 1
    ? `${input.teams[0].team.name} fixtures – ${input.seasonName}`
    : `${input.seasonName} fixtures by team`;
  doc.setTitle(pdfSafe(title));
  doc.setAuthor("Tournament Management System");
  doc.setCreator("Tournament Management System");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [width, height] = PAGE;
  const tableWidth = COLUMNS.reduce((s, c) => s + c.width, 0);

  const text = (page: PDFPage, s: string, x: number, y: number, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; maxWidth?: number } = {}) => {
    const size = opts.size ?? 9;
    const f = opts.font ?? font;
    const safe = pdfSafe(s);
    page.drawText(opts.maxWidth ? fit(safe, f, size, opts.maxWidth) : safe, { x, y, size, font: f, color: opts.color ?? rgb(0.1, 0.12, 0.15) });
  };

  const tableHeader = (page: PDFPage, y: number) => {
    page.drawRectangle({ x: MARGIN, y: y - 6, width: tableWidth, height: ROW_H, color: BRAND });
    let x = MARGIN;
    for (const c of COLUMNS) {
      text(page, c.label, x + 5, y, { font: bold, size: 8.5, color: rgb(1, 1, 1), maxWidth: c.width - 8 });
      x += c.width;
    }
    return y - ROW_H;
  };

  /** Splits text into lines that fit `maxWidth`. */
  const wrap = (s: string, f: PDFFont, size: number, maxWidth: number) => {
    const lines: string[] = [];
    let line = "";
    for (const word of pdfSafe(s).split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && f.widthOfTextAtSize(next, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };

  const many = input.teams.length > 1;
  const bottom = MARGIN + 12; // keep clear of the footer
  let page!: PDFPage;
  let y = 0;
  let atTop = true;

  /** A new page with the running header. */
  const newPage = () => {
    page = doc.addPage(PAGE);
    y = height - MARGIN - 4;
    const brand = "TOURNAMENT MANAGEMENT SYSTEM";
    text(page, brand, MARGIN, y, { font: bold, size: 9, color: BRAND });
    const seasonX = MARGIN + bold.widthOfTextAtSize(brand, 9) + 14;
    text(page, input.seasonName, seasonX, y, { size: 9, color: MUTED, maxWidth: width - MARGIN - seasonX });
    y -= 30;
    atTop = true;
  };
  newPage();

  if (many) {
    // Title and the list of teams inside, so it's clear the whole season is here.
    text(page, `${input.seasonName}: fixtures by team`, MARGIN, y, { font: bold, size: 20, maxWidth: width - 2 * MARGIN });
    y -= 18;
    const list = `${input.teams.length} teams: ${input.teams.map((t) => t.team.name).join(", ")}.`;
    for (const line of wrap(list, font, 9.5, width - 2 * MARGIN)) {
      text(page, line, MARGIN, y, { size: 9.5, color: MUTED });
      y -= 13;
    }
    y -= 14;
    atTop = false;
  }

  const teamTitleSize = many ? 15 : 20;
  const teamHeading = (t: TeamFixtures, continued: boolean) => {
    const played = t.matches.filter((m) => m.played).length;
    text(page, `${t.team.name}${continued ? " (continued)" : ""}`, MARGIN, y, { font: bold, size: teamTitleSize, maxWidth: width - 2 * MARGIN });
    y -= many ? 14 : 18;
    if (!continued) {
      const sub = [
        t.groupName,
        t.team.coach ? `Coach: ${t.team.coach}` : null,
        `${t.matches.length} match${t.matches.length === 1 ? "" : "es"} · ${played} played`,
      ].filter(Boolean).join("   ·   ");
      text(page, sub, MARGIN, y, { size: 9.5, color: MUTED, maxWidth: width - 2 * MARGIN });
      y -= 22;
    } else {
      y -= 8;
    }
    y = tableHeader(page, y);
  };

  for (const t of input.teams) {
    // Start the team on this page if its heading and at least a few rows fit; otherwise turn over.
    const headingHeight = (many ? 14 : 18) + 22 + ROW_H;
    const firstRows = Math.min(Math.max(t.matches.length, 1), 3) * ROW_H;
    if (!atTop) y -= 10;
    if (y - headingHeight - firstRows < bottom) newPage();
    atTop = false;
    teamHeading(t, false);

    if (t.matches.length === 0) {
      text(page, "No matches scheduled yet.", MARGIN + 5, y, { color: MUTED });
      y -= ROW_H;
    }
    t.matches.forEach((m, i) => {
      if (y - ROW_H < bottom) {
        newPage();
        atTop = false;
        teamHeading(t, true);
      }
      if (i % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - 6, width: tableWidth, height: ROW_H, color: ZEBRA });
      page.drawLine({ start: { x: MARGIN, y: y - 6 }, end: { x: MARGIN + tableWidth, y: y - 6 }, thickness: 0.5, color: LINE });
      const row = cells(m, t.teamId);
      let x = MARGIN;
      for (const c of COLUMNS) {
        const isKey = c.key === "opponent" || (c.key === "result" && m.played);
        text(page, row[c.key], x + 5, y, { font: isKey ? bold : font, size: 9, maxWidth: c.width - 8 });
        x += c.width;
      }
      y -= ROW_H;
    });
    y -= 8;
  }

  // Footer on every page: when it was made, and page numbers.
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    text(p, `Generated ${input.generatedOn}. Times and venues may change: check the website for the latest.`, MARGIN, MARGIN - 14, { size: 7.5, color: MUTED });
    const label = `Page ${i + 1} of ${pages.length}`;
    text(p, label, width - MARGIN - font.widthOfTextAtSize(label, 7.5), MARGIN - 14, { size: 7.5, color: MUTED });
  });

  return doc.save();
}

export type TeamSheet = {
  seasonName: string;
  groupName: string | null;
  team: { name: string; coach: string | null };
  players: { name: string; number: number | null; position: string | null }[];
  generatedOn: string;
};

const SHEET_PAGE: [number, number] = [595.28, 841.89]; // A4 portrait, in points
const SHEET_COLUMNS = [
  { key: "number", label: "No.", width: 50 },
  { key: "name", label: "Player", width: 323.28 },
  { key: "position", label: "Position", width: 150 },
] as const;

/**
 * A team sheet as a printable PDF (A4 portrait): the team name, its coach and the
 * registered squad in shirt-number order, continuing onto further pages for long squads.
 */
export async function teamSheetPdf(input: TeamSheet): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`${input.team.name} team sheet – ${input.seasonName}`));
  doc.setAuthor("Tournament Management System");
  doc.setCreator("Tournament Management System");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [width, height] = SHEET_PAGE;
  const tableWidth = SHEET_COLUMNS.reduce((s, c) => s + c.width, 0);
  const bottom = MARGIN + 12;

  const text = (page: PDFPage, s: string, x: number, y: number, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; maxWidth?: number } = {}) => {
    const size = opts.size ?? 10;
    const f = opts.font ?? font;
    const safe = pdfSafe(s);
    page.drawText(opts.maxWidth ? fit(safe, f, size, opts.maxWidth) : safe, { x, y, size, font: f, color: opts.color ?? rgb(0.1, 0.12, 0.15) });
  };

  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = doc.addPage(SHEET_PAGE);
    y = height - MARGIN - 4;
    const brand = "TOURNAMENT MANAGEMENT SYSTEM";
    text(page, brand, MARGIN, y, { font: bold, size: 9, color: BRAND });
    const seasonX = MARGIN + bold.widthOfTextAtSize(brand, 9) + 14;
    text(page, input.seasonName, seasonX, y, { size: 9, color: MUTED, maxWidth: width - MARGIN - seasonX });
    y -= 34;
  };
  const tableHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - 6, width: tableWidth, height: ROW_H, color: BRAND });
    let x = MARGIN;
    for (const c of SHEET_COLUMNS) {
      text(page, c.label, x + 6, y, { font: bold, size: 9, color: rgb(1, 1, 1) });
      x += c.width;
    }
    y -= ROW_H;
  };

  newPage();
  text(page, input.team.name, MARGIN, y, { font: bold, size: 22, maxWidth: width - 2 * MARGIN });
  y -= 22;
  const sub = [input.groupName, `${input.players.length} player${input.players.length === 1 ? "" : "s"}`].filter(Boolean).join("   ·   ");
  text(page, sub, MARGIN, y, { size: 10, color: MUTED, maxWidth: width - 2 * MARGIN });
  y -= 26;

  // Coach box.
  page.drawRectangle({ x: MARGIN, y: y - 10, width: tableWidth, height: 28, color: ZEBRA, borderColor: LINE, borderWidth: 0.5 });
  text(page, "HEAD COACH", MARGIN + 8, y, { font: bold, size: 8.5, color: MUTED });
  text(page, input.team.coach ?? "Not set", MARGIN + 90, y, { font: input.team.coach ? bold : font, size: 11, color: input.team.coach ? undefined : MUTED, maxWidth: tableWidth - 100 });
  y -= 40;

  text(page, "Squad", MARGIN, y, { font: bold, size: 13 });
  y -= 20;
  tableHeader();

  if (input.players.length === 0) {
    text(page, "No players registered yet.", MARGIN + 6, y, { color: MUTED });
    y -= ROW_H;
  }
  input.players.forEach((p, i) => {
    if (y - ROW_H < bottom) {
      newPage();
      text(page, `${input.team.name} squad (continued)`, MARGIN, y, { font: bold, size: 13, maxWidth: width - 2 * MARGIN });
      y -= 20;
      tableHeader();
    }
    if (i % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - 6, width: tableWidth, height: ROW_H, color: ZEBRA });
    page.drawLine({ start: { x: MARGIN, y: y - 6 }, end: { x: MARGIN + tableWidth, y: y - 6 }, thickness: 0.5, color: LINE });
    const row = { number: p.number == null ? "–" : String(p.number), name: p.name, position: p.position ?? "–" };
    let x = MARGIN;
    for (const c of SHEET_COLUMNS) {
      text(page, row[c.key], x + 6, y, { font: c.key === "name" ? bold : font, maxWidth: c.width - 10 });
      x += c.width;
    }
    y -= ROW_H;
  });

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    text(p, `Generated ${input.generatedOn}.`, MARGIN, MARGIN - 14, { size: 7.5, color: MUTED });
    const label = `Page ${i + 1} of ${pages.length}`;
    text(p, label, width - MARGIN - font.widthOfTextAtSize(label, 7.5), MARGIN - 14, { size: 7.5, color: MUTED });
  });

  return doc.save();
}
