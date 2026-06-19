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

/**
 * A context block: a bold label followed by avatar thumbnails for each person
 * (name shown on hover via alt text). Falls back to `emptyText` when nobody is
 * in the group; returns null if empty and no fallback is given.
 */
function peopleRow(label: string, ids: string[], profiles: ProfileMap, emptyText?: string): ContextBlock | null {
  if (ids.length === 0 && !emptyText) return null;

  const elements: ContextBlock["elements"] = [{ type: "mrkdwn", text: label }];

  const overflow = ids.length > MAX_FACES;
  const shown = overflow ? ids.slice(0, MAX_FACES - 1) : ids;
  for (const id of shown) {
    const p = profiles.get(id);
    if (p?.image) {
      elements.push({ type: "image", image_url: p.image, alt_text: p.name });
    }
  }
  if (overflow) {
    elements.push({ type: "mrkdwn", text: `*+${ids.length - (MAX_FACES - 1)}*` });
  }

  // Nothing rendered besides the label (empty group, or none had avatars).
  if (elements.length === 1 && emptyText) {
    elements.push({ type: "mrkdwn", text: emptyText });
  }

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

  push(peopleRow(`:${STATUS_META.office.emoji}: *Office (${data.office.length})*`, data.office, profiles, "_No one yet_"));
  push(peopleRow(`:${STATUS_META.remote.emoji}: *Remote (${data.remote.length})*`, data.remote, profiles, "_No one_"));
  push(peopleRow(`:${STATUS_META.away.emoji}: *Away (${data.away.length})*`, data.away, profiles));
  push(peopleRow(`:${STATUS_META.maybe.emoji}: *Maybe (${data.maybe.length})*`, data.maybe, profiles));
  push(peopleRow(`:${UNKNOWN_META.emoji}: *No answer (${data.noResponse.length})*`, data.noResponse, profiles));

  // Lunch — faces for who's bringing lunch (only set for people in the office).
  if (data.lunchBringing.length > 0) {
    push(peopleRow(`:bento: *Bringing lunch (${data.lunchBringing.length})*`, data.lunchBringing, profiles));
  }

  return blocks;
}
