import type { App, BlockAction } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import {
  upsertResponse,
  getResponsesForDate,
  getAllTargetUsers,
  getLiveSummariesForDate,
  updateConfig,
  setTargetUsers,
  upsertUser,
  getUser,
  getConfig,
  isAdmin,
} from "../db.js";
import { updateMessage } from "../utils/slack.js";
import { formatDateForDisplay } from "../utils/dates.js";
import { buildAskMessage, buildAskConfirmation } from "../views/askMessage.js";
import { buildSummaryMessage } from "../views/summaryMessage.js";
import { buildAdminHomeView } from "../views/adminHome.js";
import { buildUserHomeView } from "../views/userHome.js";

/**
 * Rebuild the summary and update every user's live summary message for the given date.
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
  const blocks = buildSummaryMessage({ targetDate, formattedDate, coming, notComing, noResponse });
  const text = `Live attendance for ${formattedDate}`;

  for (const summary of getLiveSummariesForDate(targetDate)) {
    try {
      await updateMessage(client, summary.channel_id, summary.message_ts, blocks, text);
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

    upsertResponse(userId, targetDate, {
      response: "yes",
      responded_at: new Date().toISOString(),
    });

    const message = (body as BlockAction).message;
    const channel = (body as BlockAction).channel;
    if (message && channel) {
      const formattedDate = formatDateForDisplay(targetDate);
      await updateMessage(
        client,
        channel.id,
        message.ts!,
        buildAskConfirmation(targetDate, formattedDate, "yes"),
        `You responded yes for ${formattedDate}`
      );
    }

    await updateAllLiveSummaries(client, targetDate);
  });

  app.action("attendance_no", async ({ ack, body, client }) => {
    await ack();
    const action = (body as BlockAction).actions[0];
    const targetDate = action.type === "button" ? action.value! : "";
    const userId = body.user.id;

    upsertResponse(userId, targetDate, {
      response: "no",
      responded_at: new Date().toISOString(),
    });

    const message = (body as BlockAction).message;
    const channel = (body as BlockAction).channel;
    if (message && channel) {
      const formattedDate = formatDateForDisplay(targetDate);
      await updateMessage(
        client,
        channel.id,
        message.ts!,
        buildAskConfirmation(targetDate, formattedDate, "no"),
        `You responded no for ${formattedDate}`
      );
    }

    await updateAllLiveSummaries(client, targetDate);
  });

  // --- Change Response ---

  app.action("attendance_change", async ({ ack, body, client }) => {
    await ack();
    const action = (body as BlockAction).actions[0];
    const targetDate = action.type === "button" ? action.value! : "";

    const message = (body as BlockAction).message;
    const channel = (body as BlockAction).channel;
    if (message && channel) {
      const formattedDate = formatDateForDisplay(targetDate);
      await updateMessage(
        client,
        channel.id,
        message.ts!,
        buildAskMessage(targetDate, formattedDate),
        `Are you coming to the office on ${formattedDate}?`
      );
    }
  });

  // --- Admin Actions ---

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
