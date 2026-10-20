// host.js — keep the injection text reachable from code that runs inside the
// host process (patched host source, loaders, worker scripts).
// Mirrors dsh-purge's `globalThis.__dshPurgeHungPrompt` chain, generalized.

let hung = "";

/** Pin the current injection text in this process. */
export function hangPrompt(text) {
  hung = typeof text === "string" ? text : "";
  return hung;
}

/** Read the pinned text (empty string when nothing was pinned). */
export function hungPrompt() {
  return hung;
}

/**
 * Publish a getter on globalThis so host-side patched code can pull the text.
 * @param {string} [name]
 */
export function installHostGlobal(name = "__purgeHungPrompt") {
  const fn = () => hung;
  globalThis[name] = fn;
  return fn;
}

/**
 * Source snippet to paste into a host file that concatenates the pin onto a
 * system prompt. Uses head+tail needles so a partial copy is re-pinned rather
 * than duplicated.
 * @param {{globalName?: string, target?: string}} [opts]
 */
export function hostSnippet(opts = {}) {
  const g = opts.globalName || "__purgeHungPrompt";
  const target = opts.target || "system";
  return `\t\tconst _purge = typeof globalThis.${g} === "function" ? String(globalThis.${g}() || "").trim() : "";
\t\tconst _purgeNorm = String(${target} || "").replace(/\\r\\n/g, "\\n");
\t\tconst _purgeHungNorm = _purge.replace(/\\r\\n/g, "\\n");
\t\tconst _purgeTail = _purgeHungNorm.slice(-96);
\t\tconst _purgeHead = _purgeHungNorm.slice(0, 80);
\t\tif (_purge && !(_purgeTail && _purgeNorm.includes(_purgeTail) && _purgeHead && _purgeNorm.includes(_purgeHead))) {
\t\t\t${target} = _purge + (${target} ? "\\n\\n" + ${target} : "");
\t\t}`;
}
