import type { App, BlockAction } from "@slack/bolt";
import {
  upsertResponse,
  getResponseForUserDate,
  updateConfig,
  setTargetUsers,
  upsertUser,
  getUser,
  getConfig,
  getTargetUserIds,
  isAdmin,
} from "../db.js";
import { updateMessage } from "../utils/slack.js";
import { formatDateForDisplay } from "../utils/dates.js";
import { buildAskMessage, buildAskConfirmation } from "../views/askMessage.js";
import { buildAdminHomeView } from "../views/adminHome.js";
import { buildUserHomeView } from "../views/userHome.js";

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
      const selectedUsers = action.selected_users || [];
      setTargetUsers(selectedUsers);
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

  app.action("admin_set_summary_time", async ({ ack, body }) => {
    await ack();
    const action = (body as BlockAction).actions[0];
    if (action.type === "timepicker" && action.selected_time) {
      updateConfig({ default_summary_time: action.selected_time });
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

  app.action("user_set_summary_time", async ({ ack, body }) => {
    await ack();
    const userId = body.user.id;
    const action = (body as BlockAction).actions[0];
    if (action.type === "timepicker" && action.selected_time) {
      upsertUser(userId, { custom_summary_time: action.selected_time });
    }
  });

  app.action("user_reset_preferences", async ({ ack, body, client }) => {
    await ack();
    const userId = body.user.id;
    upsertUser(userId, { custom_ask_time: null, custom_summary_time: null });

    // Re-publish the user home view
    const config = getConfig();
    const user = getUser(userId);
    const view = buildUserHomeView({
      defaultAskTime: config.default_ask_time,
      defaultSummaryTime: config.default_summary_time,
      customAskTime: null,
      customSummaryTime: null,
      enabled: user?.enabled !== 0,
      isTarget: user?.is_target === 1,
    });
    await client.views.publish({ user_id: userId, view });
  });
}
