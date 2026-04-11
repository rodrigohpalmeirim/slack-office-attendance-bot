import type { KnownBlock } from "@slack/types";

export interface SummaryData {
  targetDate: string;
  formattedDate: string;
  coming: string[];
  notComing: string[];
  noResponse: string[];
  lunchBringing: string[];
  lunchNotBringing: string[];
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

  // Coming
  const comingText =
    data.coming.length > 0
      ? data.coming.map((id) => `<@${id}>`).join(", ")
      : "_No one yet_";
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `:white_check_mark: *Coming (${data.coming.length}):*\n${comingText}`,
    },
  });

  // Lunch (only if any lunch data exists)
  if (data.lunchBringing.length > 0 || data.lunchNotBringing.length > 0) {
    const parts: string[] = [];
    if (data.lunchBringing.length > 0) {
      parts.push(`Bringing lunch: ${data.lunchBringing.map((id) => `<@${id}>`).join(", ")}`);
    }
    if (data.lunchNotBringing.length > 0) {
      parts.push(`Not bringing: ${data.lunchNotBringing.map((id) => `<@${id}>`).join(", ")}`);
    }
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `:bento: ${parts.join("  ·  ")}` }],
    });
  }

  // Not coming
  const notComingText =
    data.notComing.length > 0
      ? data.notComing.map((id) => `<@${id}>`).join(", ")
      : "_No one_";
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `:house: *Working remote (${data.notComing.length}):*\n${notComingText}`,
    },
  });

  // No response
  if (data.noResponse.length > 0) {
    const noResponseText = data.noResponse.map((id) => `<@${id}>`).join(", ");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:grey_question: *No answer yet (${data.noResponse.length}):*\n${noResponseText}`,
      },
    });
  }

  return blocks;
}
