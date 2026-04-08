import type { App } from "@slack/bolt";
import { getConfig, getUser, getTargetUserIds, getAdminIds, isAdmin, upsertUser } from "../db.js";
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

    if (isAdmin(userId)) {
      const view = buildAdminHomeView({
        adminUserIds: getAdminIds(),
        targetUserIds: getTargetUserIds(),
        activeDays: JSON.parse(config.active_days),
        defaultAskTime: config.default_ask_time,
      });
      await client.views.publish({ user_id: userId, view });
    } else {
      const user = getUser(userId);
      const view = buildUserHomeView({
        defaultAskTime: config.default_ask_time,
        customAskTime: user?.custom_ask_time ?? null,
        enabled: user?.enabled !== 0,
        isTarget: user?.is_target === 1,
      });
      await client.views.publish({ user_id: userId, view });
    }
  });
}
