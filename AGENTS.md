# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

## Selected direction

- Visual source of truth: `/Users/knight/.codex/generated_images/01a028ee-4301-73e0-9b54-4b1eb1d6d4b3/exec-1c3b7746-b1c1-4447-8e9d-c14c1c4511ef.png` (Elemental Lab, option 2).
- The Teachable Machine classifier is locked to exactly four classes: `Ice`, `Fire`, `Thunder`, and `Stone`.
- Preserve the 65/35 battle-and-AI layout, prominent live webcam classifier feedback, and the four-spell rail along the bottom.
- Each enemy has a dedicated full battle artwork and the roster may be switched for classroom demonstration.
- Webcam preview starts without a Teachable Machine model; adding a model upgrades the same panel to live classification.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
