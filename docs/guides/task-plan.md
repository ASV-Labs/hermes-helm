# The Session pane and the live task plan

The **Session** pane sits in the right sidebar, next to *Files*. It describes the chat you're focused on.

- **Plan**: the bot's own task list, shown as *Plan · 3 of 5*.
- **Session**: bot, model, folder, branch, messages, tool calls, tokens, cost and how much of the context window is used.
- **Crew**: your other bots and what each is doing.
- **Scheduled jobs**: how many there are and which one runs next.

## Reading the plan

| Mark | Meaning |
|---|---|
| ✓ | Done |
| ● · now | The step the bot is working on |
| ○ | Still to do |
| – (struck through) | Dropped |

Sub-steps are indented under their parent step.

## Where the plan comes from

The plan isn't something helm guesses. It comes from the bot's own `todo_list` tool, which bots use to track multi-step work. Each time the bot updates its list, Hermes emits a tool event, and helm redraws the plan from it.

## Why a chat can show "No plan yet"

- **The bot hasn't made a plan.** Short tasks often don't use the todo list at all.
- **The chat was already running before this window opened, and the bot hasn't touched its plan since.** On the newer shared Hermes gateway, plugins can't read old transcripts. helm sees the plan from the bot's next update.
- **The chat is running somewhere else**, such as a Telegram conversation. helm only sees events from this window's gateway. See [Needs you](needs-you.md#what-helm-can-and-cant-see).

On older gateways that still allow it, helm also reads the focused chat's history (`session.history`) to rebuild the plan. It keeps that in memory and never stores it.
