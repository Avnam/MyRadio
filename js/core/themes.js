// Registry of themes (C-15): listed in code, not in storage. A theme module exports
// { id, title, cssHref, mount(container, ctx) => cleanup, defaultSettings }, and may
// optionally export getNextStation(currentId)/getPreviousStation(currentId) to define
// its own next/previous policy (e.g. Evia's skippable stations) — core's plain
// stationsDb.next/previous is the fallback for any theme that doesn't.
import * as evia from '../../themes/evia/evia.js';

export const THEMES = [evia];

export function getTheme(id) {
  return THEMES.find(t => t.id === id) ?? THEMES[0];
}
