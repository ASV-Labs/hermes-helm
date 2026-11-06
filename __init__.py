# SPDX-License-Identifier: MIT
"""Hermes Agent compatibility entrypoint for helm, a Desktop-only plugin.

Everything helm does happens in desktop/plugin.js inside Hermes Desktop.
This module exists so the unified package loads under the Agent's plugin
contract; it registers no tools, hooks, commands or settings.
"""


def register(ctx):
    """Satisfy the Agent plugin contract without registering anything."""
    del ctx
