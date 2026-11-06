# Needs you: approvals and questions

When a bot needs your permission to run a command, or asks you a question, helm shows it in one place for every bot. You don't have to open each chat to find it.

## Where it shows up

- **On the Desk**, in the **Needs you** section, with a count.
- **In the sidebar**, in a small pane above Sessions. The pane exists only while something is waiting and disappears once nothing is. To turn it off, go to *Customize look → On the desk → Needs you in the sidebar*.
- **In the status bar**, as *N need you*.
- **In the command palette**, as *Helm: what needs me*.

## Approvals

An approval row shows:
- what kind of action it is, such as *Shell command*;
- which bot is asking;
- the exact command;
- which chat it came from.

| Button | What it sends | Effect |
|---|---|---|
| **Approve** | `approval.respond` with `choice: once` | Runs this one command. |
| **Allow session** | `choice: session` | Allows this kind of command for the rest of that chat. The button appears only when Hermes offers that option, and it is hidden on narrow layouts. |
| **Deny** | `choice: deny` | Refuses the command. |
| **Open** | — | Jumps to the chat so you can see the context first. |

These are the same calls Hermes's own approval card makes. helm adds no approval logic of its own.

**helm never answers anything by itself.** Nothing is approved, denied or answered unless you click. Once you answer, the row leaves helm immediately. The chat shows the result as usual.

## Questions

When a bot asks you something (Hermes calls this *clarify*):
- If the bot offered choices, they appear as buttons.
- **Answer** opens a text box for a free-form reply. **Send** delivers it with `clarify.respond`.

## Unread replies

Chats with a reply you haven't read also appear here. **Reply** opens the chat with your text drafted in the composer, not sent.

## What helm can and can't see

helm watches the same event stream as the Hermes Desktop window it runs in.

- **Covered:** any approval or question from chats that this window's gateway is running. That includes chats started from the Desk, the sidebar or any bot's *New chat*.
- **Not covered:** approvals raised inside a chat running on a **different gateway**. One example is a conversation with your bot in Telegram, which the messaging gateway runs. Answer those where they were asked.
- **Older Hermes gateways:** helm also polls the live session list (`session.active_list` → `approval.pending`):
  - every 4 seconds while something is running or waiting;
  - every 15 seconds otherwise.

  On the newer shared gateway, prompts arrive as events, so there's no delay.

If you expect something here and it isn't showing, run **Helm: diagnostics** from `⌘K`. It reports how many live chats helm can see and how many approvals and questions are waiting. See [Troubleshooting](troubleshooting.md#helm-diagnostics).
