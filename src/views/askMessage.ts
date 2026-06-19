import type { KnownBlock } from "@slack/types";
import { STATUSES, STATUS_META, type Status } from "../status.js";

/**
 * Build the attendance question DM with one button per status.
 */
export function buildAskMessage(targetDate: string, formattedDate: string): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:office: Where will you be on *${formattedDate}*?`,
      },
    },
    {
      type: "actions",
      block_id: `attendance_ask_${targetDate}`,
      elements: STATUSES.map((status) => {
        const meta = STATUS_META[status];
        return {
          type: "button" as const,
          text: { type: "plain_text" as const, text: meta.label, emoji: true },
          ...(meta.buttonStyle ? { style: meta.buttonStyle } : {}),
          action_id: `attendance_${status}`,
          value: targetDate,
        };
      }),
    },
  ];
}

/**
 * Build the confirmation message shown after the user responds.
 * For "office" + lunch users: appends the lunch question or confirmation below.
 */
export function buildAskConfirmation(
  targetDate: string,
  formattedDate: string,
  response: Status,
  showLunchQuestion: boolean,
  lunchResponse: "yes" | "no" | null
): KnownBlock[] {
  const statusText: Record<Status, string> = {
    office: `:${STATUS_META.office.emoji}: You're in the *office* on *${formattedDate}*.`,
    remote: `:${STATUS_META.remote.emoji}: You're working *remote* on *${formattedDate}*.`,
    away: `:${STATUS_META.away.emoji}: You're *away* on *${formattedDate}*.`,
  };

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: statusText[response] },
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

  if (response === "office" && showLunchQuestion) {
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
