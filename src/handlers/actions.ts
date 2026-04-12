import type { App, BlockAction } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import {
  upsertResponse,
  getResponsesForDate,
  getTargetUsersForWeekday,
  getLunchTargetUserIds,
  setLunchTargetUsers,
  getLiveSummariesForDate,
  updateConfig,
  setTargetUsers,
  getAdminIds,
  getTargetUserIds,
  upsertUser,
  getUser,
  getConfig,
} from "../db.js";
import { updateMessage, getUserTimezone } from "../utils/slack.js";
import { formatDateForDisplay, getWeekdayFromDate } from "../utils/dates.js";
import { buildCombinedMessage } from "../views/combinedMessage.js";
import { buildAdminHomeView } from "../views/adminHome.js";
import { buildUserHomeView } from "../views/userHome.js";

/**
 * Rebuild the combined message for every user who has received it for the
 * given date. Each user gets the shared summary state but their own
 * question section (buttons vs. confirmation) based on their response.
 */
async function updateAllLiveSummaries(client: WebClient, targetDate: string): Promise<void> {
  const allResponses = getResponsesForDate(targetDate);
  const allTargetIds = getTargetUsersForWeekday(getWeekdayFromDate(targetDate)).map((u) => u.slack_user_id);
  const respondedIds = new Set(allResponses.map((r) => r.slack_user_id));

  const coming = allResponses.filter((r) => r.response === "yes").map((r) => r.slack_user_id);
  const notComing = allResponses.filter((r) => r.response === "no").map((r) => r.slack_user_id);
  const noResponse = [
    ...allResponses.filter((r) => r.response === null).map((r) => r.slack_user_id),
    ...allTargetIds.filter((id) => !respondedIds.has(id)),
  ];

  const lunchTargetIds = new Set(getLunchTargetUserIds());
  const lunchBringing = allResponses
    .filter((r) => r.lunch_response === "yes" && lunchTargetIds.has(r.slack_user_id))
    .map((r) => r.slack_user_id);
  const lunchNotBringing = allResponses
    .filter((r) => r.lunch_response === "no" && lunchTargetIds.has(r.slack_user_id))
    .map((r) => r.slack_user_id);

  const formattedDate = formatDateForDisplay(targetDate);
  const summaryData = { targetDate, formattedDate, coming, notComing, noResponse, lunchBringing, lunchNotBringing };
  const responseMap = new Map(allResponses.map((r) => [r.slack_user_id, r.response as "yes" | "no" | null]));
  const lunchResponseMap = new Map(allResponses.map((r) => [r.slack_user_id, r.lunch_response as "yes" | "no" | null]));

  for (const summary of getLiveSummariesForDate(targetDate)) {
    const userResponse = responseMap.get(summary.slack_user_id) ?? null;
    const userLunchResponse = lunchResponseMap.get(summary.slack_user_id) ?? null;
    const showLunchQuestion = lunchTargetIds.has(summary.slack_user_id);
    const blocks = buildCombinedMessage(targetDate, formattedDate, summaryData, userResponse, showLunchQuestion, userLunchResponse);
    try {
      await updateMessage(client, summary.channel_id, summary.message_ts, blocks, `Live attendance for ${formattedDate}`);
    } catch (err) {
      console.error(`Failed to update live summary for ${summary.slack_user_id}:`, err);
    }
  }
}

export function registerActionHandlers(app: App): void {
  // --- Attendance Yes/No ---

  app.action("attendance_yes", async ({ ack, body, client }) => {
    await ack();
    const action = (body as BlockAction).actions[0];
    const targetDate = action.type === "button" ? action.value! : "";
    const userId = body.user.id;

    upsertResponse(userId, targetDate, { response: "yes", responded_at: new Date().toISOString() });
    await updateAllLiveSummaries(client, targetDate);
  });

  app.action("attendance_no", async ({ ack, body, client }) => {
    await ack();
    const action = (body as BlockAction).actions[0];
    const targetDate = action.type === "button" ? action.value! : "";
    const userId = body.user.id;

    upsertResponse(userId, targetDate, { response: "no", responded_at: new Date().toISOString() });
    await updateAllLiveSummaries(client, targetDate);
  });

  // --- Change Response ---
  // Null the response (and lunch response) so the user moves back to "no answer",
  // then update all messages (their own will show buttons again).

  app.action("attendance_change", async ({ ack, body, client }) => {
    await ack();
    const action = (body as BlockAction).actions[0];
    const targetDate = action.type === "button" ? action.value! : "";
    const userId = body.user.id;

    upsertResponse(userId, targetDate, { response: null, responded_at: null, lunch_response: null });
    await updateAllLiveSummaries(client, targetDate);
  });

  // --- Lunch Yes/No/Change ---

  app.action("lunch_yes", async ({ ack, body, client }) => {
    await ack();
    const action = (body as BlockAction).actions[0];
    const targetDate = action.type === "button" ? action.value! : "";
    const userId = body.user.id;

    upsertResponse(userId, targetDate, { lunch_response: "yes" });
    await updateAllLiveSummaries(client, targetDate);
  });

  app.action("lunch_no", async ({ ack, body, client }) => {
    await ack();
    const action = (body as BlockAction).actions[0];
    const targetDate = action.type === "button" ? action.value! : "";
    const userId = body.user.id;

    upsertResponse(userId, targetDate, { lunch_response: "no" });
    await updateAllLiveSummaries(client, targetDate);
  });

  app.action("lunch_change", async ({ ack, body, client }) => {
    await ack();
    const action = (body as BlockAction).actions[0];
    const targetDate = action.type === "button" ? action.value! : "";
    const userId = body.user.id;

    upsertResponse(userId, targetDate, { lunch_response: null });
    await updateAllLiveSummaries(client, targetDate);
  });

  // --- Admin Actions ---

  app.action("admin_select_admins", async ({ ack, body, client }) => {
    await ack();
    const userId = body.user.id;
    const action = (body as BlockAction).actions[0];
    if (action.type !== "multi_users_select") return;

    // Prevent the acting admin from removing themselves
    const selected = action.selected_users || [];
    const newAdminIds = selected.includes(userId) ? selected : [userId, ...selected];

    updateConfig({ admin_user_ids: JSON.stringify(newAdminIds) });

    // Re-publish so the selector reflects the corrected list (in case of self-removal attempt)
    const config = getConfig();
    const user = getUser(userId);
    const activeDays: number[] = JSON.parse(config.active_days);
    const lunchTargetUserIds = getLunchTargetUserIds();
    const view = buildAdminHomeView({
      adminUserIds: newAdminIds,
      targetUserIds: getTargetUserIds(),
      lunchUserIds: lunchTargetUserIds,
      activeDays,
      defaultAskTime: config.default_ask_time,
      userPrefs: {
        defaultAskTime: config.default_ask_time,
        customAskTime: user?.custom_ask_time ?? null,
        isOptedIn: user?.is_target === 1,
        activeDays,
        userActiveDaysOverride: user?.active_days_override
          ? (JSON.parse(user.active_days_override) as number[])
          : null,
        isLunchOptedIn: user?.is_lunch_target !== 0,
      },
    });
    await client.views.publish({ user_id: userId, view });
  });

  app.action("admin_select_target_users", async ({ ack, body, client }) => {
    await ack();
    const action = (body as BlockAction).actions[0];
    if (action.type !== "multi_users_select") return;

    const selectedUsers = action.selected_users || [];
    setTargetUsers(selectedUsers);

    // Fetch and cache timezones immediately so the scheduler uses the correct
    // local time for each user rather than falling back to UTC.
    for (const userId of selectedUsers) {
      const tz = await getUserTimezone(client, userId);
      upsertUser(userId, { timezone: tz, timezone_updated_at: new Date().toISOString() });
    }
  });

  app.action("admin_select_lunch_users", async ({ ack, body }) => {
    await ack();
    const action = (body as BlockAction).actions[0];
    if (action.type !== "multi_users_select") return;

    setLunchTargetUsers(action.selected_users || []);
  });

  app.action("admin_select_active_days", async ({ ack, body }) => {
    await ack();
    const action = (body as BlockAction).actions[0];
    if (action.type === "checkboxes") {
      const days = (action.selected_options || []).map((opt) => parseInt(opt.value!));
      updateConfig({ active_days: JSON.stringify(days) });
    }
  });

  app.action("admin_set_ask_time", async ({ ack, body }) => {
    await ack();
    const action = (body as BlockAction).actions[0];
    if (action.type === "timepicker" && action.selected_time) {
      updateConfig({ default_ask_time: action.selected_time });
    }
  });

  // --- User Preference Actions ---

  app.action("user_toggle_target", async ({ ack, body, client }) => {
    await ack();
    const userId = body.user.id;
    const action = (body as BlockAction).actions[0];
    if (action.type !== "checkboxes") return;

    const optedIn = (action.selected_options || []).some((opt) => opt.value === "opted_in");
    // Opting out of attendance also removes from lunch
    upsertUser(userId, { is_target: optedIn ? 1 : 0, ...(optedIn ? {} : { is_lunch_target: 0 }) });

    const config = getConfig();
    const user = getUser(userId);
    const view = buildUserHomeView({
      defaultAskTime: config.default_ask_time,
      customAskTime: user?.custom_ask_time ?? null,
      isOptedIn: optedIn,
      activeDays: JSON.parse(config.active_days),
      userActiveDaysOverride: user?.active_days_override
        ? (JSON.parse(user.active_days_override) as number[])
        : null,
      isLunchOptedIn: optedIn && user?.is_lunch_target !== 0,
    });
    await client.views.publish({ user_id: userId, view });
  });

  app.action("user_toggle_lunch_target", async ({ ack, body }) => {
    await ack();
    const userId = body.user.id;
    const action = (body as BlockAction).actions[0];
    if (action.type === "checkboxes") {
      const optedIn = (action.selected_options || []).some((opt) => opt.value === "lunch_opted_in");
      upsertUser(userId, { is_lunch_target: optedIn ? 1 : 0 });
    }
  });

  app.action("user_set_ask_time", async ({ ack, body }) => {
    await ack();
    const userId = body.user.id;
    const action = (body as BlockAction).actions[0];
    if (action.type === "timepicker" && action.selected_time) {
      upsertUser(userId, { custom_ask_time: action.selected_time });
    }
  });

  app.action("user_select_active_days", async ({ ack, body }) => {
    await ack();
    const userId = body.user.id;
    const action = (body as BlockAction).actions[0];
    if (action.type !== "checkboxes") return;

    const config = getConfig();
    const activeDays: number[] = JSON.parse(config.active_days);
    const selected = (action.selected_options || []).map((opt) => parseInt(opt.value!));

    // null means "all days" — avoids stale data if admin later adds office days
    const isAllSelected = activeDays.every((d) => selected.includes(d)) && selected.length === activeDays.length;
    upsertUser(userId, { active_days_override: isAllSelected ? null : JSON.stringify(selected) });
  });

  app.action("user_reset_preferences", async ({ ack, body, client }) => {
    await ack();
    const userId = body.user.id;
    upsertUser(userId, { custom_ask_time: null, active_days_override: null });

    const config = getConfig();
    const user = getUser(userId);
    const view = buildUserHomeView({
      defaultAskTime: config.default_ask_time,
      customAskTime: null,
      isOptedIn: user?.is_target === 1,
      activeDays: JSON.parse(config.active_days),
      userActiveDaysOverride: null,
      isLunchOptedIn: user?.is_lunch_target !== 0,
    });
    await client.views.publish({ user_id: userId, view });
  });
}
