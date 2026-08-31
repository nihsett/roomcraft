# RoomCraft

Collaborative room design where humans and AI agents work on the same canvas.
Built for the [WebMCP Challenge](https://webmcp.devpost.com/).

## How It Works

RoomCraft registers 15+ WebMCP tools (15 static plus 4 selection-dependent) that let any AI agent manipulate a 2D room layout.
The human drags furniture directly. The agent calls structured tools. Both see the same
live canvas.

```js
await document.modelContext.registerTool({
  name: 'move_items',
  description: 'Move multiple items simultaneously in one atomic batch...',
  inputSchema: { /* ... */ },
  execute: async ({ moves }) => { /* ... */ },
});
```

## Try It

**ChatGPT Desktop:** Open the deployed RoomCraft URL in the ChatGPT browser, then ask
"rearrange this room for a dinner party."

**Chrome 149+:** Enable `chrome://flags/#enable-webmcp-testing`, open the deployed URL,
then use Chrome's agent features.

## Architecture

- **Pull-based journal pattern:** The agent cannot observe UI events directly. Every human
  action (drag, rotate, delete) is logged to a journal. Tool responses include a delta of
  human actions since the agent's last tool call, so it stays aware of what changed.

- **Atomic batch moves:** `move_items` validates all moves before applying any. One
  simultaneous animation enables full room rearrangements in a single tool call.

- **Dynamic tool registration:** Selection-dependent tools (`rotate_selected`,
  `nudge_selected`, and others) register/unregister via `AbortController` as items are
  selected or deselected.

- **Clearance engine:** BFS pathfinding on a 10cm grid with obstacle dilation for
  configurable corridor width (standard 80cm, wheelchair 90cm+).

## Tech Stack

React · Zustand · Vite · Tailwind CSS · SVG canvas · No backend

## License

MIT
