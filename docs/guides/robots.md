# Bots board and robots

## The Bots board

Open it with `⌘⌥R` or *Helm: Bots board* in `⌘K`.

- It lists every bot (Hermes profile) with its robot and its live state: *working*, *reply waiting*, or *idle · 12m ago*. Bots that need you come first.
- Each card shows:
  - the bot's model
  - its skill count
  - its recent spend
  - its latest session
- Each card has three actions:
  - **New chat**
  - **Resume** (the latest session)
  - **Look** (the robot editor)
- The filters at the top are **All**, **Needs you** and **Working**.
- **New bot** creates a real Hermes bot, the same thing the app's Bot Mode does (`profiles.create`).

## Hermes's own New bot dialog

Hermes also has a **New bot** dialog of its own, from its built-in Bots plugin. That dialog uses Hermes's classic face shapes, and helm can't change it: the plugin catalog doesn't allow plugins to replace a built-in plugin's screens.

- To build a bot with a helm robot from the start, use **+ New bot** in the Desk's bot picker, **New bot** on the Bots board, or **Helm: New bot (robot)** in ⌘K.
- A bot made in Hermes's dialog still gets a helm robot. When **Robots as Hermes avatars** is on, helm sets the robot as its avatar within about 20 seconds, unless you uploaded a photo.
- **In Hermes's Bots tab, that robot appears after the next app restart.** The moment Hermes's dialog creates a bot, Bot Mode saves its classic face as the avatar and remembers that, in memory, until the app quits. helm replaces the face with the robot, and the Bots tab picks it up at the next launch. Bots made with helm's own **New bot** get their robot at the moment they are created, so they show it in the Bots tab right away.

## Building a robot

Every robot is put together from layers that were rendered in Blender:

- 10 toppers
- 10 faces
- 8 chest modules
- 6 tools
- 6 things to wear
- 7 colours

The **face changes with state**. It's focused while the bot is working, it asks a question when a reply is waiting, and so on. The same face appears next to that bot's sessions in the sidebar.

## Robots as Hermes avatars

When **Robots as Hermes avatars** is on (*Customize look → On the desk*), each bot's robot becomes its avatar across Hermes. New bots get theirs automatically.

- **The automatic pass never replaces a photo you uploaded.** Before it sets an avatar, helm reads what the bot already has (`profiles.get_asset`). If that's your own image, helm marks the bot as yours and leaves it alone from then on.
- **helm keeps checking.** Once a minute it re-reads each bot's avatar. If Bot Mode's classic face has replaced the robot, helm puts the robot back. If you have uploaded a photo since, helm leaves it alone.
- **Pressing Done in a robot's Look editor is an explicit choice.** It makes that robot the bot's avatar. If Bot Mode still shows a photo you uploaded for that bot, remove the photo in *Bot Mode → Edit* and the robot will show.
- Avatars are saved in each bot's Hermes profile (`profiles.set_asset`), so removing helm doesn't remove them. Change them in the app's bot settings.

## "Showing flat robots"

The rendered layers (191 PNGs) are served by helm's small read-only backend. The Hermes gateway mounts it at `/api/plugins/helm/`, but only when the gateway starts. Until then, the board draws flat placeholder robots and shows a note. Restarting Hermes once after you install fixes it.

If it doesn't, see [Troubleshooting](troubleshooting.md#the-bots-board-shows-flat-robots).

## Rebuilding the renders (optional)

The layers are already in `dashboard/sprites/`. Rebuilding them is only for changing the art.

1. Set up Python 3.13 with Blender's `bpy` 5.2 module, Pillow and NumPy.
2. Run `python3 tools/render/build_all.py dashboard/sprites`. This takes about 7 minutes on an M-series Mac.
3. Run `python3 tools/render/shrink.py dashboard/sprites`.

To preview a single bot, use `tools/render/render_one.py`. Hermes never runs anything in `tools/`.
