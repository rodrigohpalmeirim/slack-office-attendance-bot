# Slack Office Attendance Bot

A Slack bot that asks teammates if they're coming to the office the next day. Responses are collected via Yes/No buttons, and a live summary updates in real time as people reply.

## Features

- Sends a daily DM to configured teammates asking about the next office day
- Live summary message updates in-place as each person responds — no separate scheduled summary
- Admins configure office days, target teammates, ask time, and other admins via an App Home tab
- Each teammate can override their ask time or opt out entirely from their own App Home tab
- Per-user timezones read automatically from Slack profiles
- Socket Mode — no public URL or reverse proxy required

## Slack App Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app **from scratch**.

2. Under **Socket Mode**, enable it and generate an **App-Level Token** with the `connections:write` scope. Save it as `SLACK_APP_TOKEN`.

3. Under **OAuth & Permissions**, add these **Bot Token Scopes**:
   - `chat:write`
   - `im:write`
   - `users:read`

   Install the app to your workspace and save the **Bot User OAuth Token** as `SLACK_BOT_TOKEN`.

4. Under **Basic Information**, copy the **Signing Secret** and save it as `SLACK_SIGNING_SECRET`.

5. Under **Event Subscriptions**, subscribe to the `app_home_opened` bot event.

6. Under **App Home**, enable the **Home Tab**.

7. Under **Interactivity & Shortcuts**, ensure interactivity is enabled (Socket Mode handles this automatically).

## Running Locally

**Prerequisites:** [Bun](https://bun.sh) 1.x

```bash
cp .env.example .env
# Fill in your tokens and set INITIAL_ADMIN_IDS to your Slack user ID
bun install
bun dev
```

Open the bot's App Home in Slack to configure office days, teammates, and the daily ask time.

## Running with Docker

```bash
docker run -d \
  --name slack-office-attendance-bot \
  -v /your/data/path:/data \
  -e SLACK_BOT_TOKEN=xoxb-... \
  -e SLACK_APP_TOKEN=xapp-... \
  -e SLACK_SIGNING_SECRET=... \
  -e INITIAL_ADMIN_IDS=U12345 \
  ghcr.io/rodrigohpalmeirim/slack-office-attendance-bot:latest
```

Mount a volume at `/data` to persist the SQLite database across restarts.

A `docker-compose.yml` is also included for convenience — update the image name and environment values, then run `docker compose up -d`.

## Environment Variables

| Variable | Description |
|---|---|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token (`xoxb-…`) |
| `SLACK_APP_TOKEN` | App-Level Token for Socket Mode (`xapp-…`) |
| `SLACK_SIGNING_SECRET` | Signing secret from Basic Information |
| `INITIAL_ADMIN_IDS` | Comma-separated Slack user IDs granted admin on first run |
| `DATABASE_PATH` | Path to the SQLite database file (default: `./data/attendance.db`) |

## How It Works

- A cron job runs every minute. For each target teammate, if tomorrow is an office day and it's their configured ask time, the bot sends them a DM.
- The DM contains a live attendance summary (updated as people respond) followed by Yes/No buttons.
- Clicking a button updates the response and immediately refreshes the summary section in every teammate's message.
- "Change response" re-opens the buttons and moves the person back to the unanswered list.

## Docker Image

The image is automatically built and pushed to GitHub Container Registry on every push to `main`:

```
ghcr.io/rodrigohpalmeirim/slack-office-attendance-bot:latest
ghcr.io/rodrigohpalmeirim/slack-office-attendance-bot:<commit-sha>
```
