import type { KnownBlock } from "@slack/types";

/**
 * Build the attendance question DM with Yes/No buttons.
 */
export function buildAskMessage(targetDate: string, formattedDate: string): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:office: Are you coming to the office on *${formattedDate}*?`,
      },
    },
    {
      type: "actions",
      block_id: `attendance_ask_${targetDate}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Yes", emoji: true },
          style: "primary",
          action_id: "attendance_yes",
          value: targetDate,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "No", emoji: true },
          style: "danger",
          action_id: "attendance_no",
          value: targetDate,
        },
      ],
    },
  ];
}

/**
 * Build the confirmation message shown after the user responds.
 * Includes a "Change response" button to allow updates.
 */
export function buildAskConfirmation(
  targetDate: string,
  formattedDate: string,
  response: "yes" | "no"
): KnownBlock[] {
  const text =
    response === "yes"
      ? `:white_check_mark: You're coming to the office on *${formattedDate}*.`
      : `:house: You're working remote on *${formattedDate}*.`;

  return [
    {
      type: "section",
      text: { type: "mrkdwn", text },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Change response", emoji: true },
          action_id: "attendance_change",
          value: targetDate,
        },
      ],
    },
  ];
}
