import type { View } from "@slack/types";
import { buildUserPreferenceBlocks, type UserHomeData } from "./userHome.js";

export interface AdminHomeData {
  adminUserIds: string[];
  targetUserIds: string[];
  lunchUserIds: string[];
  activeDays: number[];
  defaultAskTime: string;
  userPrefs: UserHomeData;
}

const DAY_OPTIONS = [
  { text: { type: "plain_text" as const, text: "Monday" }, value: "1" },
  { text: { type: "plain_text" as const, text: "Tuesday" }, value: "2" },
  { text: { type: "plain_text" as const, text: "Wednesday" }, value: "3" },
  { text: { type: "plain_text" as const, text: "Thursday" }, value: "4" },
  { text: { type: "plain_text" as const, text: "Friday" }, value: "5" },
  { text: { type: "plain_text" as const, text: "Saturday" }, value: "6" },
  { text: { type: "plain_text" as const, text: "Sunday" }, value: "7" },
];

export function buildAdminHomeView(data: AdminHomeData): View {
  const selectedDayOptions = DAY_OPTIONS.filter((opt) =>
    data.activeDays.includes(parseInt(opt.value))
  );

  return {
    type: "home",
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "Your Preferences", emoji: true },
      },
      ...buildUserPreferenceBlocks(
        data.userPrefs,
        "You're not on the attendance list. Add yourself using the teammate selector below."
      ),
      {
        type: "header",
        text: { type: "plain_text", text: "Admin Settings", emoji: true },
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Who should be asked about office attendance?*" },
        accessory: {
          type: "multi_users_select",
          action_id: "admin_select_target_users",
          placeholder: { type: "plain_text", text: "Select teammates" },
          ...(data.targetUserIds.length > 0 ? { initial_users: data.targetUserIds } : {}),
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Which days should be asked about?*\n_The question is sent the day before._" },
      },
      {
        type: "actions",
        block_id: "admin_active_days_block",
        elements: [
          {
            type: "checkboxes",
            action_id: "admin_select_active_days",
            options: DAY_OPTIONS,
            ...(selectedDayOptions.length > 0 ? { initial_options: selectedDayOptions } : {}),
          },
        ],
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Default time to ask the question:*" },
        accessory: {
          type: "timepicker",
          action_id: "admin_set_ask_time",
          initial_time: data.defaultAskTime,
          placeholder: { type: "plain_text", text: "Select time" },
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Who should be asked about bringing lunch?*" },
        accessory: {
          type: "multi_users_select",
          action_id: "admin_select_lunch_users",
          placeholder: { type: "plain_text", text: "Select teammates" },
          ...(data.lunchUserIds.length > 0 ? { initial_users: data.lunchUserIds } : {}),
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Who are the admins?*" },
        accessory: {
          type: "multi_users_select",
          action_id: "admin_select_admins",
          placeholder: { type: "plain_text", text: "Select admins" },
          ...(data.adminUserIds.length > 0 ? { initial_users: data.adminUserIds } : {}),
        },
      },
      { type: "divider" },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "Changes are saved automatically." }],
      },
      { type: "divider" }
    ],
  };
}
