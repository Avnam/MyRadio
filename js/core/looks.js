// Registry of looks (C-15): listed in code, not in storage. A look module exports
// { id, title, mount(container, ctx) => cleanup, defaultSettings }.
import * as evia from '../../looks/evia/evia.js';

export const LOOKS = [evia];

export function getLook(id) {
  return LOOKS.find(l => l.id === id) ?? LOOKS[0];
}
