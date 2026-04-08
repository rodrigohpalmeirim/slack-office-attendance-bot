import type { KnownBlock } from "@slack/types";

export interface SummaryData {
  targetDate: string;
  formattedDate: string;
  coming: string[];
  notComing: string[];
  noResponse: string[];
}

/**
 * Build the live summary message. This message is sent once and then updated
 * in-place as employees respond throughout the day.
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
