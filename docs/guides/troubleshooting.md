# Troubleshooting

Start with **Helm: diagnostics**. Open the command palette with `⌘K`, run it, and helm posts a one-line report of what it can see.

## Helm: diagnostics

Example:

```
helm 1.0.1 · inbox: 12 live chats (primary), 1 waiting, 1 approvals, 0 questions · plan: 0 transcript rows, 4 steps for local-3f9c…
```

| Part | Meaning |
|---|---|
| `12 live chats` | Chats that this window's gateway is running right now. If it says 0 while bots are working, the chats are running on another gateway. See [Needs you](needs-you.md#what-helm-can-and-cant-see). |
| `(primary)` | helm reached the gateway with one store-wide call. If it says `(none, <error>)`, that call failed and helm asked each bot separately. Only bots this gateway serves can answer that way. |
| `waiting / approvals / questions` | What *Needs you* is showing. |
| `plan: N transcript rows, M steps` | How the plan for the focused chat was built. `0 transcript rows` with steps means the plan came from live events. This is normal on the shared gateway. `error not_found` means the gateway doesn't serve old transcripts to plugins. The plan still appears on the bot's next update. |

## The Bots board shows flat robots

**Cause:** the rendered robots come from helm's backend, which the gateway mounts only when it starts.

**Fix:**

1. Quit Hermes and open it again.
2. If the robots are still flat, the gateway backend may be running as a background service that survived the restart. Run:
   ```
   hermes serve --stop
   ```
   Then open Hermes again. It starts a fresh backend that includes helm's routes.

## A bot shows a classic face in Hermes's Bots tab, not its robot

**Cause:** there are four possible causes.

- **The bot was made with Hermes's own New bot dialog.** Bot Mode saved the classic face first and keeps that answer in memory until the app quits. helm replaces the face with the robot within about 20 seconds; quit and reopen Hermes Desktop to see it.
- **The bot has a picture you uploaded.** helm never replaces your own picture. To use the robot, remove the picture in *Bot Mode → Edit*, then press **Done** in the robot's Look editor on the Bots board.
- **Robots as Hermes avatars is off.** Turn it on in *Customize look → On the desk*.
- **An older Hermes build saved the classic face as the bot's picture.** Bot Mode keeps that hidden picture and never looks at the robot, and its Edit dialog doesn't offer to remove it. Upload the robot instead:
  1. Right-click the bot in the Bots tab and choose **Edit**.
  2. Open the **Upload** tab and press **Choose an image…**.
  3. Press **⌘⇧G**, paste `~/.hermes/profiles/<profile>/assets/avatar.png` (for the default bot, `~/.hermes/assets/avatar.png`), press **Return**, then **Open**.
  4. Press **Save**. That file is helm's robot, so the Bots tab shows it right away.

## The Desk's Today list says "Couldn't read scheduled jobs"

Today reads each bot's scheduled jobs through the gateway's public `cron.manage` call (`list`; the Bot view's routine switches use `pause` / `resume`, never add or remove). This is the same call Hermes's own Bots tab makes.

- The message means the gateway didn't answer that call. helm retries every 30 seconds.
- If it persists, check that **Scheduled jobs** opens in the app itself. If it doesn't, the problem is the gateway, not helm.
- On Hermes older than 0.22.1, the per-bot listing isn't available. helm requires 0.22.1 or newer.

## Something is waiting, but Needs you is empty

- **Is the chat running on another gateway?** A conversation with your bot in Telegram, for example, runs on the messaging gateway. Its approvals show in that conversation, not in this window. See [what helm can and can't see](needs-you.md#what-helm-can-and-cant-see).
- **Was it just answered elsewhere?** Approvals clear the moment Hermes settles or cancels them.
- **Run Helm: diagnostics.** If it shows `0 live chats` while a chat is clearly running in this window, [open an issue](https://github.com/ASV-Labs/hermes-helm/issues/new/choose) and include the diagnostics line.

## The Session pane says "No plan yet"

This is usually expected. See [why a chat can show "No plan yet"](task-plan.md#why-a-chat-can-show-no-plan-yet).

## The Desk didn't open at launch

- helm opens the Desk only in the **main** window. HUD, pop-out and peer windows are left alone on purpose.
- Check *Customize look → On the desk → Open the Desk at launch*.
- You can always open it with `⌘⌥0` or from **Desk** in the sidebar.

## A shortcut does nothing

Another app may own that key combination. The same commands are always in `⌘K`:

- *Helm: Desk*
- *Helm: Bots board*
- *Helm: Customize look*

## Part of the look reverted after a Hermes update

A Hermes release probably renamed one of the component slots that helm's theme CSS targets. That one rule stops applying, and everything else stays. See [After a Hermes update](customize-look.md#after-a-hermes-update).

[Open an issue](https://github.com/ASV-Labs/hermes-helm/issues/new/choose) with a screenshot of the spot.

## I want the stock Hermes look back

Pick any non-helm theme in **Settings → Appearance**. To remove helm entirely, run `hermes plugins remove helm`. See [Uninstall](getting-started.md#uninstall).

## Still stuck?

[Open an issue](https://github.com/ASV-Labs/hermes-helm/issues/new/choose). Include:

- your Hermes version (`hermes --version`)
- your OS
- the **Helm: diagnostics** line

Never paste API keys, `.env` contents or auth files into an issue. helm never needs them.
