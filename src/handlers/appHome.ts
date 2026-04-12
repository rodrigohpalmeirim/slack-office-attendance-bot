import type { App } from "@slack/bolt";
import { getConfig, getUser, getTargetUserIds, getAdminIds, getLunchTargetUserIds, isAdmin, upsertUser } from "../db.js";
import { getUserTimezone } from "../utils/slack.js";
import { buildAdminHomeView } from "../views/adminHome.js";
import { buildUserHomeView } from "../views/userHome.js";

export function registerAppHomeHandler(app: App): void {
  app.event("app_home_opened", async ({ event, client }) => {
    if (event.tab !== "home") return;

    const userId = event.user;

    // Refresh user timezone on every home open
    const tz = await getUserTimezone(client, userId);
    upsertUser(userId, { timezone: tz, timezone_updated_at: new Date().toISOString() });

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
  });
}
