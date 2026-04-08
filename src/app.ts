import { App, LogLevel } from "@slack/bolt";
import { registerAppHomeHandler } from "./handlers/appHome.js";
import { registerActionHandlers } from "./handlers/actions.js";
import { startScheduler } from "./scheduler.js";

// Bun loads .env automatically — no dotenv needed

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: LogLevel.INFO,
});

// Import db.ts to run schema initialization as a side effect
import "./db.js";

// Register handlers
registerAppHomeHandler(app);
registerActionHandlers(app);

// Start scheduler
startScheduler(app);

// Start the app
await app.start();
console.log("Attendance bot is running!");
