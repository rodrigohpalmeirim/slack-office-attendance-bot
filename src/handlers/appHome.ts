import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { getConfig, getUser, getTargetUserIds, getAdminIds, getLunchTargetUserIds, isAdmin, upsertUser } from "../db.js";
import { getUserTimezone } from "../utils/slack.js";
import { buildAdminHomeView } from "../views/adminHome.js";
import { buildUserHomeView } from "../views/userHome.js";

/**
 * Build and publish the correct home view (admin or user) for the given user.
 * Call this after any action that changes state visible in the home tab.
 */
export async function refreshHomeView(client: WebClient, userId: string): Promise<void> {
  const config = getConfig();
  const user = getUser(userId);
  const activeDays: number[] = JSON.parse(config.active_days);
  const lunchTargetUserIds = getLunchTargetUserIds();

  const userPrefsBase = {
    defaultAskTime: config.default_ask_time,
    customAskTime: user?.custom_ask_time ?? null,
    isOptedIn: user?.is_target === 1,
    activeDays,
    userActiveDaysOverride: user?.active_days_override
      ? (JSON.parse(user.active_days_override) as number[])
      : null,
    isLunchOptedIn: user?.is_lunch_target !== 0,
  };

  if (isAdmin(userId)) {
    const view = buildAdminHomeView({
      adminUserIds: getAdminIds(),
      targetUserIds: getTargetUserIds(),
      lunchUserIds: lunchTargetUserIds,
      activeDays,
      defaultAskTime: config.default_ask_time,
      userPrefs: userPrefsBase,
    });
    await client.views.publish({ user_id: userId, view });
  } else {
    const view = buildUserHomeView(userPrefsBase);
    await client.views.publish({ user_id: userId, view });
  }
}

export function registerAppHomeHandler(app: App): void {
  app.event("app_home_opened", async ({ event, client }) => {
    if (event.tab !== "home") return;

    const userId = event.user;

    // Refresh user timezone on every home open
    const tz = await getUserTimezone(client, userId);
    upsertUser(userId, { timezone: tz, timezone_updated_at: new Date().toISOString() });

    await refreshHomeView(client, userId);
  });
}
