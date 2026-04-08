import type { View } from "@slack/types";

export interface UserHomeData {
  defaultAskTime: string;
  customAskTime: string | null;
  enabled: boolean;
  isTarget: boolean;
}

const ENABLED_OPTION = {
  text: { type: "mrkdwn" as const, text: "Receive daily attendance messages" },
  value: "enabled",
};

/**
 * Returns the preference blocks without a page header, so they can be
 * embedded in other views (e.g. the admin home).
 */
export function buildUserPreferenceBlocks(data: UserHomeData, notTargetMessage?: string): any[] {
  if (!data.isTarget) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: notTargetMessage ?? "You're not currently on the attendance list. An admin can add you.",
        },
      },
    ];
  }

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Each day you'll receive the attendance question and a live summary that updates as teammates respond.",
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
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Reset to default time", emoji: true },
          action_id: "user_reset_preferences",
          confirm: {
            title: { type: "plain_text", text: "Reset preferences?" },
            text: { type: "mrkdwn", text: "This will clear your custom ask time." },
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
          text: "Time is in your Slack timezone. Changes save automatically.",
        },
      ],
    },
  ];
}

export function buildUserHomeView(data: UserHomeData): View {
  return {
    type: "home",
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "Attendance Bot — Preferences", emoji: true },
      },
      ...buildUserPreferenceBlocks(data),
    ],
  };
}
