import type { KnownBlock } from "@slack/types";
import { STATUS_META, UNKNOWN_META } from "../status.js";

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

function mentions(ids: string[], emptyText: string): string {
  return ids.length > 0 ? ids.map((id) => `<@${id}>`).join(", ") : emptyText;
}

/**
 * Build the live summary message. This message is sent once and then updated
 * in-place as teammates respond throughout the day.
 */
export function buildSummaryMessage(data: SummaryData): KnownBlock[] {
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

  // Office
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `:${STATUS_META.office.emoji}: *Office (${data.office.length}):*\n${mentions(data.office, "_No one yet_")}`,
    },
  });

  // Lunch (only if any lunch data exists)
  if (data.lunchBringing.length > 0 || data.lunchNotBringing.length > 0) {
    const parts: string[] = [];
    if (data.lunchBringing.length > 0) {
      parts.push(`Bringing lunch: ${data.lunchBringing.map((id) => `<@${id}>`).join(", ")}`);
    }
    if (data.lunchNotBringing.length > 0) {
      parts.push(`Not bringing lunch: ${data.lunchNotBringing.map((id) => `<@${id}>`).join(", ")}`);
    }
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `:bento: ${parts.join("  ·  ")}` }],
    });
  }

  // Remote
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `:${STATUS_META.remote.emoji}: *Remote (${data.remote.length}):*\n${mentions(data.remote, "_No one_")}`,
    },
  });

  // Away
  if (data.away.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:${STATUS_META.away.emoji}: *Away (${data.away.length}):*\n${mentions(data.away, "_No one_")}`,
      },
    });
  }

  // Maybe (tentative — only ever set from the weekly grid)
  if (data.maybe.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:${STATUS_META.maybe.emoji}: *Maybe (${data.maybe.length}):*\n${mentions(data.maybe, "_No one_")}`,
      },
    });
  }

  // No response
  if (data.noResponse.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:${UNKNOWN_META.emoji}: *No answer yet (${data.noResponse.length}):*\n${mentions(data.noResponse, "_No one_")}`,
      },
    });
  }

  return blocks;
}
