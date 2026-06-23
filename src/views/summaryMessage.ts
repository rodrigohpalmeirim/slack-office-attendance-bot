import type { ContextBlock, KnownBlock } from "@slack/types";
import { STATUS_META, UNKNOWN_META } from "../status.js";
import type { Profile } from "../services/profiles.js";

export interface SummaryData {
  targetDate: string;
  formattedDate: string;
  /** Slack user IDs grouped by status. */
  office: string[];
  remote: string[];
  away: string[];
  maybe: string[];
  noResponse: string[];
  lunchBringing: string[];
  lunchNotBringing: string[];
}

export type ProfileMap = Map<string, Profile>;

// Faces beyond this count collapse into a "+N" element (context blocks allow
// at most 10 elements total, and one is always the label).
const MAX_FACES = 9;
const MAX_ELEMENTS = 10;

// Lunch markers shown inline after a person's avatar on the Office row.
const MARK_BRINGING = ":bento:"; // 🍱
const MARK_NOT_BRINGING = ":knife_fork_plate:"; // 🍽️ — eating out / not bringing

/**
 * A context block: a bold label followed by avatar thumbnails for each person
 * (name shown on hover via alt text). Falls back to `emptyText` when nobody is
 * in the group; returns null if empty and no fallback is given.
 */
function peopleRow(
  label: string,
  ids: string[],
  profiles: ProfileMap,
  emptyText?: string,
  trailing?: string
): ContextBlock | null {
  if (ids.length === 0 && !emptyText) return null;

  const elements: ContextBlock["elements"] = [{ type: "mrkdwn", text: label }];

  // Budget within the 10-element cap, reserving the label and (if any) trailing.
  const faceBudget = MAX_FACES - (trailing ? 1 : 0);
  const overflow = ids.length > faceBudget;
  const shown = overflow ? ids.slice(0, faceBudget - 1) : ids;
  for (const id of shown) {
    const p = profiles.get(id);
    if (p?.image) {
      elements.push({ type: "image", image_url: p.image, alt_text: p.name });
    }
  }
  if (overflow) {
    elements.push({ type: "mrkdwn", text: `*+${ids.length - (faceBudget - 1)}*` });
  }

  // Nothing rendered besides the label (empty group, or none had avatars).
  if (elements.length === 1 && emptyText) {
    elements.push({ type: "mrkdwn", text: emptyText });
  }

  if (trailing) {
    elements.push({ type: "mrkdwn", text: trailing });
  }

  return { type: "context", elements };
}

/**
 * The Office row, with each person's lunch intent shown two ways: a hover
 * label on every avatar, and (when it fits the 10-element cap) an inline
 * 🍱 / 🍽️ marker right after the face. When the row is too crowded for inline
 * markers, it falls back to plain faces plus a trailing lunch tally — hover
 * labels are kept either way.
 */
function buildOfficeRow(data: SummaryData, profiles: ProfileMap): ContextBlock {
  const label = `:${STATUS_META.office.emoji}: *Office (${data.office.length})*`;

  if (data.office.length === 0) {
    return { type: "context", elements: [{ type: "mrkdwn", text: label }, { type: "mrkdwn", text: "_No one yet_" }] };
  }

  const bringing = new Set(data.lunchBringing);
  const notBringing = new Set(data.lunchNotBringing);
  const altFor = (id: string, name: string) =>
    bringing.has(id) ? `${name} · bringing lunch` : notBringing.has(id) ? `${name} · not bringing lunch` : name;
  const markerFor = (id: string) =>
    bringing.has(id) ? MARK_BRINGING : notBringing.has(id) ? MARK_NOT_BRINGING : null;

  // Attempt 1: a face (+ inline marker) per person.
  const inline: ContextBlock["elements"] = [{ type: "mrkdwn", text: label }];
  for (const id of data.office) {
    const p = profiles.get(id);
    const name = p?.name ?? id;
    if (p?.image) inline.push({ type: "image", image_url: p.image, alt_text: altFor(id, name) });
    const marker = markerFor(id);
    if (marker) inline.push({ type: "mrkdwn", text: marker });
  }
  if (inline.length <= MAX_ELEMENTS) return { type: "context", elements: inline };

  // Attempt 2 (crowded): plain faces with overflow + a trailing lunch tally.
  const tally =
    data.lunchBringing.length > 0 || data.lunchNotBringing.length > 0
      ? `:bento: ${data.lunchBringing.length} bringing lunch${data.lunchNotBringing.length > 0 ? ` · ${data.lunchNotBringing.length} not` : ""}`
      : undefined;

  const faceBudget = MAX_FACES - (tally ? 1 : 0);
  const overflow = data.office.length > faceBudget;
  const shown = overflow ? data.office.slice(0, faceBudget - 1) : data.office;
  const elements: ContextBlock["elements"] = [{ type: "mrkdwn", text: label }];
  for (const id of shown) {
    const p = profiles.get(id);
    if (p?.image) elements.push({ type: "image", image_url: p.image, alt_text: altFor(id, p.name) });
  }
  if (overflow) elements.push({ type: "mrkdwn", text: `*+${data.office.length - (faceBudget - 1)}*` });
  if (tally) elements.push({ type: "mrkdwn", text: tally });
  return { type: "context", elements };
}

/**
 * Build the live summary message. This message is sent once and then updated
 * in-place as teammates respond throughout the day.
 */
export function buildSummaryMessage(data: SummaryData, profiles: ProfileMap): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Office Attendance — ${data.formattedDate}`,
        emoji: true,
      },
    },
  ];

  const push = (block: ContextBlock | null) => {
    if (block) blocks.push(block);
  };

  // Office row carries lunch intent inline on each avatar (with a fallback).
  push(buildOfficeRow(data, profiles));
  push(peopleRow(`:${STATUS_META.remote.emoji}: *Remote (${data.remote.length})*`, data.remote, profiles, "_No one_"));
  push(peopleRow(`:${STATUS_META.away.emoji}: *Away (${data.away.length})*`, data.away, profiles));
  push(peopleRow(`:${STATUS_META.maybe.emoji}: *Maybe (${data.maybe.length})*`, data.maybe, profiles));
  push(peopleRow(`:${UNKNOWN_META.emoji}: *No answer (${data.noResponse.length})*`, data.noResponse, profiles));

  return blocks;
}
