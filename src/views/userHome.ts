import type { View } from "@slack/types";

export interface UserHomeData {
  defaultAskTime: string;
  customAskTime: string | null;
  enabled: boolean;
  isTarget: boolean;
  activeDays: number[];
  userActiveDaysOverride: number[] | null; // null means all office days
  isLunchUser: boolean;
  lunchEnabled: boolean;
}

const DAY_NAMES: Record<number, string> = {
  1: "Monday", 2: "Tuesday", 3: "Wednesday",
  4: "Thursday", 5: "Friday", 6: "Saturday", 7: "Sunday",
};

const ENABLED_OPTION = {
  text: { type: "mrkdwn" as const, text: "Receive daily attendance messages" },
  value: "enabled",
};

const LUNCH_ENABLED_OPTION = {
  text: { type: "mrkdwn" as const, text: "Include me in the lunch question" },
  value: "lunch_enabled",
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

  const dayOptions = data.activeDays.map((d) => ({
    text: { type: "plain_text" as const, text: DAY_NAMES[d] ?? `Day ${d}` },
    value: String(d),
  }));

  // Which days to show as selected: override if set, otherwise all active days
  const selectedDays = data.userActiveDaysOverride ?? data.activeDays;
  const selectedDayOptions = dayOptions.filter((opt) => selectedDays.includes(parseInt(opt.value)));

  const dayBlocks: any[] = data.activeDays.length > 0
    ? [
        { type: "divider" },
        {
          type: "section",
          text: { type: "mrkdwn", text: "*On which office days do you want to be asked?*" },
        },
        {
          type: "actions",
          block_id: "user_active_days_block",
          elements: [
            {
              type: "checkboxes",
              action_id: "user_select_active_days",
              options: dayOptions,
              ...(selectedDayOptions.length > 0 ? { initial_options: selectedDayOptions } : {}),
            },
          ],
        },
      ]
    : [];

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
    ...dayBlocks,
    ...(data.isLunchUser
      ? [
          { type: "divider" as const },
          {
            type: "section",
            text: { type: "mrkdwn", text: "*Lunch*" },
          },
          {
            type: "actions",
            block_id: "user_lunch_enabled_block",
            elements: [
              {
                type: "checkboxes",
                action_id: "user_toggle_lunch_enabled",
                options: [LUNCH_ENABLED_OPTION],
                ...(data.lunchEnabled ? { initial_options: [LUNCH_ENABLED_OPTION] } : {}),
              },
            ],
          },
        ]
      : []),
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
          text: { type: "plain_text", text: "Reset all preferences", emoji: true },
          action_id: "user_reset_preferences",
          confirm: {
            title: { type: "plain_text", text: "Reset preferences?" },
            text: { type: "mrkdwn", text: "This will reset your ask time and day selection to defaults." },
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
