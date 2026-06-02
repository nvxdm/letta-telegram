# letta-telegram

NestJS proxy that bridges Telegram bots to [Letta](https://letta.com) agents.

- Each bot binds 1:1 to a single Letta agent (shared agent state across all chats).
- One process can host **N** bots concurrently; every bot is configured via env vars.
- Group chats: every message is relayed to the agent; the agent decides whether to reply.
- Explicit allow-lists for Telegram user IDs (DMs) and chat IDs (groups). Non-whitelisted updates are dropped silently.
- Media bidirectional:
  - **TG → Letta**: photos (base64), documents (uploaded to Letta files), voice / audio (uploaded as files).
  - **Letta → TG**: markdown `![alt](url)` is sent as a photo; `[label](url)` with file extensions is sent as a document; remaining text is sent as a message.
- Powered by the official [`@letta-ai/letta-client`](https://github.com/letta-ai/letta-node) SDK and [`telegraf`](https://github.com/telegraf/telegraf) (the [`nestjs-telegraf`](https://github.com/nksmnf/nestjs-telegraf) package is installed for any future decorator extensions).

## Quick start

```bash
cp .env.example .env
# edit .env: set LETTA_TOKEN, BOT_1_TOKEN, BOT_1_AGENT_ID, BOT_1_ALLOWED_USER_IDS, ...

yarn install
yarn build && yarn start
# or for live reload:
yarn start:dev
```

Or via Docker:

```bash
docker compose up --build
```

## Env vars

### Letta

| Var | Required | Default | Notes |
|---|---|---|---|
| `LETTA_BASE_URL` | yes | — | e.g. `https://api.letta.com` |
| `LETTA_TOKEN` | yes | — | Bearer token (self-hosted server password is fine) |
| `LETTA_TIMEOUT_MS` | no | `120000` | Per-request timeout in ms |

### Per-bot block (repeat for `BOT_2_*`, `BOT_3_*`, ...)

| Var | Required | Notes |
|---|---|---|
| `BOT_<N>_NAME` | yes | Human-readable name, must be unique across bots |
| `BOT_<N>_TOKEN` | yes | Telegram bot token from @BotFather |
| `BOT_<N>_AGENT_ID` | yes | Letta agent id (e.g. `agent-b4c5…`) |
| `BOT_<N>_ALLOWED_USER_IDS` | yes (empty = deny all DMs) | Comma-separated Telegram numeric user IDs |
| `BOT_<N>_ALLOWED_CHAT_IDS` | yes (empty = deny all groups) | Comma-separated Telegram group/supergroup IDs (negative numbers) |

> **Indices must be contiguous starting at 1.** A gap (e.g. `BOT_1_*` then `BOT_3_*` with no `BOT_2_*`) is fine — gaps are skipped, but `BOT_1_*` is required if any bots are configured.

### Misc

| Var | Default | Notes |
|---|---|---|
| `LOG_LEVEL` | `info` | One of `error`, `warn`, `info`/`log`, `debug`, `verbose` |
| `NODE_ENV` | — | `production` recommended in Docker |

## Architecture

```
src/
├── config/         # Env parsing + zod validation (bots, letta)
├── letta/          # @letta-ai/letta-client wrapper + per-agent serialization
├── media/          # Telegram file download, TG→Letta payload, agent output parser
├── bots/           # Bot launcher (Telegraf), access control, update handler, sender
├── common/         # Logger setup + global exception filter
├── app.module.ts
└── main.ts
```

The handler middleware (`telegram-update.handler.ts`) is bot-agnostic and is bound at startup to every configured Telegraf instance via `bot.use(...)`. This avoids hard-coded `@Update()` classes and lets the bot list grow purely from env config.

## How a message flows

1. Telegram → `bot.use(...)` middleware fires for the configured bot.
2. `AccessControlService` checks the chat/user allow-list. Non-allowed updates are dropped silently.
3. `TgPayloadBuilderService` converts the Telegram update into Letta `content` blocks. Media is downloaded; documents/voice/audio are uploaded to a per-bot Letta folder that's attached to the agent.
4. `LettaService.sendMessage(agentId, content)` calls `client.agents.messages.create(...)`. Calls to the same agent are serialized in-process to avoid concurrent-message undefined behavior.
5. The last `assistant_message` from the response is extracted. Empty text = silent (no reply).
6. `AgentOutputParserService` parses markdown for photos/documents.
7. `TelegramSenderService` sends photos, documents, and text in order via `ctx.replyWith*`.

## Finding chat IDs

- For DMs: each user has a numeric ID. Easiest: ask the user to message [@userinfobot](https://t.me/userinfobot), it will reply with their ID.
- For groups: add the bot to a group, then have *any* user send a message. The first dropped update logs `chat <ID> not in BOT_*_ALLOWED_CHAT_IDS` — that's the ID to add.

## Notes

- Long-polling only. No webhook server is exposed.
- Voice transcription is **not** done in this service — the agent (or its tools) is responsible.
- Stickers and videos are not currently relayed.
- The Letta server warns against concurrent messages to the same agent; `LettaService` serializes per-agent.
