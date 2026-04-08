import type { App, BlockAction } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import {
  upsertResponse,
  getResponsesForDate,
  getAllTargetUsers,
  getLiveSummariesForDate,
  updateConfig,
  setTargetUsers,
  getAdminIds,
  getTargetUserIds,
  upsertUser,
  getUser,
  getConfig,
} from "../db.js";
import { updateMessage } from "../utils/slack.js";
import { formatDateForDisplay } from "../utils/dates.js";
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
  const allTargetIds = getAllTargetUsers().map((u) => u.slack_user_id);
  const respondedIds = new Set(allResponses.map((r) => r.slack_user_id));

  const coming = allResponses.filter((r) => r.response === "yes").map((r) => r.slack_user_id);
  const notComing = allResponses.filter((r) => r.response === "no").map((r) => r.slack_user_id);
  const noResponse = [
    ...allResponses.filter((r) => r.response === null).map((r) => r.slack_user_id),
    ...allTargetIds.filter((id) => !respondedIds.has(id)),
  ];

  const formattedDate = formatDateForDisplay(targetDate);
  const summaryData = { targetDate, formattedDate, coming, notComing, noResponse };
  const responseMap = new Map(allResponses.map((r) => [r.slack_user_id, r.response as "yes" | "no" | null]));

  for (const summary of getLiveSummariesForDate(targetDate)) {
    const userResponse = responseMap.get(summary.slack_user_id) ?? null;
    const blocks = buildCombinedMessage(targetDate, formattedDate, summaryData, userResponse);
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
  // Null the response so the user moves back to "no answer" in the summary,
  // then update all messages (their own will show buttons again).

  app.action("attendance_change", async ({ ack, body, client }) => {
    await ack();
    const action = (body as BlockAction).actions[0];
    const targetDate = action.type === "button" ? action.value! : "";
    const userId = body.user.id;

    upsertResponse(userId, targetDate, { response: null, responded_at: null });
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
    const view = buildAdminHomeView({
      adminUserIds: newAdminIds,
      targetUserIds: getTargetUserIds(),
      activeDays: JSON.parse(config.active_days),
      defaultAskTime: config.default_ask_time,
    });
    await client.views.publish({ user_id: userId, view });
  });

  app.action("admin_select_target_users", async ({ ack, body }) => {
    await ack();
    const action = (body as BlockAction).actions[0];
    if (action.type === "multi_users_select") {
      setTargetUsers(action.selected_users || []);
    }
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

  app.action("user_toggle_enabled", async ({ ack, body }) => {
    await ack();
    const userId = body.user.id;
    const action = (body as BlockAction).actions[0];
    if (action.type === "checkboxes") {
      const enabled = (action.selected_options || []).some((opt) => opt.value === "enabled");
      upsertUser(userId, { enabled: enabled ? 1 : 0 });
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

  app.action("user_reset_preferences", async ({ ack, body, client }) => {
    await ack();
    const userId = body.user.id;
    upsertUser(userId, { custom_ask_time: null });

    const config = getConfig();
    const user = getUser(userId);
    const view = buildUserHomeView({
      defaultAskTime: config.default_ask_time,
      customAskTime: null,
      enabled: user?.enabled !== 0,
      isTarget: user?.is_target === 1,
    });
    await client.views.publish({ user_id: userId, view });
  });
}
