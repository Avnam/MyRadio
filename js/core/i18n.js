// Loads a language file and provides t(key, params). Every piece of shown text
// must go through here (C-10e) so adding a language later means adding one file.

let strings = {};

export async function loadLanguage(code) {
  const res = await fetch(`lang/${code}.json`);
  if (!res.ok) throw new Error(`Could not load language '${code}'`);
  const data = await res.json();
  strings = data.strings ?? {};
}

export function t(key, params) {
  let text = strings[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, v);
    }
  }
  return text;
}
