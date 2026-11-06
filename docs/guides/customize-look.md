# Customize look

Open **Customize look** with `⌘⌥U`, or *Helm: Customize look* in `⌘K`. Every change applies to the whole app as you make it, so there's no Save button.

| Section | Choices |
|---|---|
| **Base** | Helm Dark (quiet dark chrome, cyan accent) · Helm Graphite (near-black, no hue) · Helm Paper (warm light paper, teal accent) |
| **Accent** | The theme default or one of seven colours. The accent marks focus, selection and the active row. |
| **Type** | System · Inter · Grotesk · Mono |
| **Shape** | Corners (sharp, soft, round) · Reading width (narrow, app, wide) · Rail (mono, colour) |
| **Density** | Session list (compact, comfortable, detailed) · Chat text size (90–150%). These are Hermes's own settings, and helm changes them for you. |
| **On the desk** | Turn each helm surface on or off. |

*Reset shape & type* puts the shape and type choices back to their defaults.

## How the theme works

helm's looks are ordinary Hermes themes. Picking one in Customize look also selects it in Hermes's own theme picker (**Settings → Appearance**), where it shows as *Helm Custom*. To go back to the stock app, pick any non-helm theme there. helm's own pages (Desk, Bots board, panes) keep working with any theme.

The **redesign layer** is CSS that ships inside the theme. It covers the one-colour rail, the tracked-caps labels, the accent edge on the open row, the hairline composer, the calmer reading column and the rest. That CSS styles Hermes's components by their `data-slot` names. helm's code never reaches into the app's page itself.

### After a Hermes update

If a Hermes release renames one of those slots, the rule that used it simply stops applying. You'll see the plain app styling in that one spot while the rest of the look stays. Nothing breaks.

If you spot one, [open an issue](https://github.com/ASV-Labs/hermes-helm/issues/new/choose) and name the area of the app.

## On the desk: the toggles

| Toggle | What it controls |
|---|---|
| Open the Desk at launch | Hermes starts on the Desk (main window only). |
| Needs you in the sidebar | The approvals/questions pane above Sessions, shown only while something waits. |
| Continue strip on new chats | Your three latest sessions above the composer of a fresh chat. |
| Titlebar context | Bot, folder, model, cost and context of the current chat, in the titlebar. |
| Bots in the session list | Each session row shows its bot's robot; the face shows the row's state. |
| Cost in the session list | Spend per session, right-aligned. |
| Status bar: needs you / today / working / focused cost | The four status-bar readouts, each on its own toggle. |
| Composer robot | Who you're talking to, at the left of the composer. |
| Robots as Hermes avatars | New bots get their robot as their Hermes avatar. It never replaces a photo you uploaded. |
| Hide the Messaging row | Hides Messaging in the sidebar. Capabilities can never be hidden. |

## Moving your look to another machine

Use **Settings → Plugins → Helm → Export** on the first machine and **Import** on the other. See [Getting started](getting-started.md#back-up-or-move-your-setup).
