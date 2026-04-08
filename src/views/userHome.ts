import type { View } from "@slack/types";

export interface UserHomeData {
  defaultAskTime: string;
  defaultSummaryTime: string;
  customAskTime: string | null;
  customSummaryTime: string | null;
  enabled: boolean;
  isTarget: boolean;
}

const ENABLED_OPTION = {
  text: { type: "mrkdwn" as const, text: "Receive daily attendance messages" },
  value: "enabled",
};

export function buildUserHomeView(data: UserHomeData): View {
  const blocks: any[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Attendance Bot — Preferences", emoji: true },
    },
  ];

  if (!data.isTarget) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "You're not currently on the attendance list. An admin can add you.",
      },
    });
    return { type: "home", blocks };
  }

  blocks.push(
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Customize when you receive the daily attendance question and summary.",
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: "*Notifications*" },
    },
    {
      type: "actions",
      block_id: "user_enabled_block",
      elements: [
        {
          type: "checkboxes",
          action_id: "user_toggle_enabled",
          options: [ENABLED_OPTION],
          ...(data.enabled ? { initial_options: [ENABLED_OPTION] } : {}),
        },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*When to receive the question:*\n_Default: ${data.defaultAskTime}_`,
      },
      accessory: {
        type: "timepicker",
        action_id: "user_set_ask_time",
        initial_time: data.customAskTime ?? data.defaultAskTime,
        placeholder: { type: "plain_text", text: "Select time" },
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*When to receive the summary:*\n_Default: ${data.defaultSummaryTime}_`,
      },
      accessory: {
        type: "timepicker",
        action_id: "user_set_summary_time",
        initial_time: data.customSummaryTime ?? data.defaultSummaryTime,
        placeholder: { type: "plain_text", text: "Select time" },
      },
    },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Reset to defaults", emoji: true },
          action_id: "user_reset_preferences",
          confirm: {
            title: { type: "plain_text", text: "Reset preferences?" },
            text: {
              type: "mrkdwn",
              text: "This will clear your custom ask and summary times.",
            },
            confirm: { type: "plain_text", text: "Reset" },
            deny: { type: "plain_text", text: "Cancel" },
          },
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Times are in your Slack timezone. Changes save automatically.",
        },
      ],
    }
  );

  return { type: "home", blocks };
}
