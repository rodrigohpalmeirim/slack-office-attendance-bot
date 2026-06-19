import type { App, BlockAction } from "@slack/bolt";
import {
  upsertResponse,
  setLunchTargetUsers,
  updateConfig,
  setTargetUsers,
  upsertUser,
  getConfig,
} from "../db.js";
import { getUserTimezone } from "../utils/slack.js";
import { STATUSES, type Status } from "../status.js";
import { updateAllLiveSummaries } from "../services/liveSummary.js";
import { refreshHomeView } from "./appHome.js";

export function registerActionHandlers(app: App): void {
  // The weekly-prompt button just opens a URL; ack so Slack doesn't warn.
  app.action("open_weekly_web", async ({ ack }) => {
    await ack();
  });

  // --- Attendance status (one handler per status) ---

  for (const status of STATUSES) {
    app.action(`attendance_${status}`, async ({ ack, body, client }) => {
      await ack();
      const action = (body as BlockAction).actions[0];
      const targetDate = action.type === "button" ? action.value! : "";
      const userId = body.user.id;

      const fields: { response: Status; responded_at: string; lunch_response?: null } = {
        response: status,
        responded_at: new Date().toISOString(),
      };
      // Leaving the office invalidates any prior lunch answer.
      if (status !== "office") fields.lunch_response = null;

      upsertResponse(userId, targetDate, fields);
      await updateAllLiveSummaries(client, targetDate);
    });
  }

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
    await refreshHomeView(client, userId);
  });

  app.action("admin_select_target_users", async ({ ack, body, client }) => {
    await ack();
    const userId = body.user.id;
    const action = (body as BlockAction).actions[0];
    if (action.type !== "multi_users_select") return;

    const selectedUsers = action.selected_users || [];
    setTargetUsers(selectedUsers);

    // Fetch and cache timezones immediately so the scheduler uses the correct
    // local time for each user rather than falling back to UTC.
    for (const uid of selectedUsers) {
      const tz = await getUserTimezone(client, uid);
      upsertUser(uid, { timezone: tz, timezone_updated_at: new Date().toISOString() });
    }

    await refreshHomeView(client, userId);
  });

  app.action("admin_select_lunch_users", async ({ ack, body, client }) => {
    await ack();
    const userId = body.user.id;
    const action = (body as BlockAction).actions[0];
    if (action.type !== "multi_users_select") return;

    setLunchTargetUsers(action.selected_users || []);
    await refreshHomeView(client, userId);
  });

  app.action("admin_select_active_days", async ({ ack, body, client }) => {
    await ack();
    const userId = body.user.id;
    const action = (body as BlockAction).actions[0];
    if (action.type === "checkboxes") {
      const days = (action.selected_options || []).map((opt) => parseInt(opt.value!));
      updateConfig({ active_days: JSON.stringify(days) });
    }
    await refreshHomeView(client, userId);
  });

  app.action("admin_set_ask_time", async ({ ack, body, client }) => {
    await ack();
    const userId = body.user.id;
    const action = (body as BlockAction).actions[0];
    if (action.type === "timepicker" && action.selected_time) {
      updateConfig({ default_ask_time: action.selected_time });
    }
    await refreshHomeView(client, userId);
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
    await refreshHomeView(client, userId);
  });

  app.action("user_toggle_lunch_target", async ({ ack, body, client }) => {
    await ack();
    const userId = body.user.id;
    const action = (body as BlockAction).actions[0];
    if (action.type === "checkboxes") {
      const optedIn = (action.selected_options || []).some((opt) => opt.value === "lunch_opted_in");
      upsertUser(userId, { is_lunch_target: optedIn ? 1 : 0 });
    }
    await refreshHomeView(client, userId);
  });

  app.action("user_set_ask_time", async ({ ack, body, client }) => {
    await ack();
    const userId = body.user.id;
    const action = (body as BlockAction).actions[0];
    if (action.type === "timepicker" && action.selected_time) {
      upsertUser(userId, { custom_ask_time: action.selected_time });
    }
    await refreshHomeView(client, userId);
  });

  app.action("user_select_active_days", async ({ ack, body, client }) => {
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
    await refreshHomeView(client, userId);
  });

  app.action("user_reset_preferences", async ({ ack, body, client }) => {
    await ack();
    const userId = body.user.id;
    upsertUser(userId, { custom_ask_time: null, active_days_override: null });
    await refreshHomeView(client, userId);
  });
}
