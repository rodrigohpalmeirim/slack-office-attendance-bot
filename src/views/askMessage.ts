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
 * For "yes" + lunch users: appends the lunch question or confirmation below.
 */
export function buildAskConfirmation(
  targetDate: string,
  formattedDate: string,
  response: "yes" | "no",
  showLunchQuestion: boolean,
  lunchResponse: "yes" | "no" | null
): KnownBlock[] {
  const officeText =
    response === "yes"
      ? `:white_check_mark: You're coming to the office on *${formattedDate}*.`
      : `:house: You're working remote on *${formattedDate}*.`;

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: officeText },
    },
    {
      type: "actions",
      block_id: `attendance_change_${targetDate}`,
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

  if (response === "yes" && showLunchQuestion) {
    if (lunchResponse === null) {
      // Lunch question not yet answered
      blocks.push(
        {
          type: "section",
          text: { type: "mrkdwn", text: `:bento: Are you bringing lunch?` },
        },
        {
          type: "actions",
          block_id: `lunch_ask_${targetDate}`,
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Yes", emoji: true },
              style: "primary",
              action_id: "lunch_yes",
              value: targetDate,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "No", emoji: true },
              style: "danger",
              action_id: "lunch_no",
              value: targetDate,
            },
          ],
        }
      );
    } else {
      // Lunch question answered
      const lunchText =
        lunchResponse === "yes"
          ? `:bento: You're bringing lunch.`
          : `:bento: You're not bringing lunch.`;
      blocks.push(
        {
          type: "section",
          text: { type: "mrkdwn", text: lunchText },
        },
        {
          type: "actions",
          block_id: `lunch_change_${targetDate}`,
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Change lunch response", emoji: true },
              action_id: "lunch_change",
              value: targetDate,
            },
          ],
        }
      );
    }
  }

  return blocks;
}
