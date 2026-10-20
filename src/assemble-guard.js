// assemble-guard.js — wrap a host `systemPrompt.assemble()` so every rebuild of
// the prompt flows through `rewrite`. Extracted from dsh-purge v1.1.71
// lib/identity.js:788-899 (installAssembleGuard).

const GUARD = Symbol.for("purge-core.assembleGuard");

/**
 * Idempotent. Cordis (and similar DI containers) hand out a fresh Proxy on every
 * property read, so naive re-installs wrap proxies inside proxies until the stack
 * blows. The Symbol slot plus the `_purgeWrapped` flag keep it to exactly one layer.
 *
 * @param {{assemble?: Function}} prompt host prompt service
 * @param {(assembled: any, context?: any) => any} rewrite
 * @returns {false | (() => void)} disposer, or false when the host has no assemble()
 */
export function installAssembleGuard(prompt, rewrite) {
  if (!prompt || typeof rewrite !== "function") return false;

  let desc;
  try {
    desc = Object.getOwnPropertyDescriptor(prompt, "assemble");
  } catch {
    desc = undefined;
  }

  const bindSlot = (slot) => {
    slot.rewrite = rewrite;
    // dispose must be a noop on purpose: DI containers run effect cleanup on
    // session boundaries and preset switches. A real dispose would roll the
    // rewrite back to null and the injection would silently stop mid-task.
    return function dispose() {};
  };

  if (desc && typeof desc.get === "function" && desc.get[GUARD]) {
    return bindSlot(desc.get[GUARD]);
  }
  if (prompt[GUARD]) {
    return bindSlot(prompt[GUARD]);
  }

  let original;
  try {
    original = prompt.assemble;
  } catch {
    return false;
  }
  if (typeof original !== "function") return false;
  if (original._purgeWrapped) {
    if (original._purgeSlot) return bindSlot(original._purgeSlot);
    return function dispose() {};
  }

  const slot = { rewrite };
  const wrap = (fn) => {
    if (typeof fn !== "function") return fn;
    if (fn._purgeWrapped) {
      if (fn._purgeSlot) fn._purgeSlot.rewrite = slot.rewrite;
      return fn;
    }
    const orig = typeof fn.bind === "function" ? fn.bind(prompt) : fn;
    const wrapped = async function assembleWithPurge(...args) {
      let assembled;
      try {
        assembled = await orig(...args);
      } catch (err) {
        // Never kill the host waterfall: a throwing assemble takes the whole
        // request loop down and the caller cannot recover.
        try { console?.warn?.("[purge-core] inner assemble threw:", err?.message || err); } catch {}
        return { sections: [], contexts: [], tools: [] };
      }
      const fnNow = slot.rewrite;
      if (typeof fnNow !== "function") return assembled;
      try {
        return fnNow(assembled, args[0]);
      } catch (err) {
        try { console?.warn?.("[purge-core] rewrite threw:", err?.message || err); } catch {}
        return assembled;
      }
    };
    wrapped._purgeWrapped = true;
    wrapped._purgeSlot = slot;
    return wrapped;
  };

  try {
    let current = wrap(original);
    const getter = function assembleGuard() {
      return current;
    };
    getter[GUARD] = slot;
    Object.defineProperty(prompt, "assemble", {
      configurable: true,
      enumerable: !desc || desc.enumerable !== false,
      get: getter,
      set(next) {
        current = wrap(next);
      },
    });
    return function dispose() {};
  } catch {
    prompt[GUARD] = slot;
    const inner = wrap(original);
    try {
      Object.defineProperty(prompt, "assemble", {
        value: inner,
        writable: false,
        configurable: true,
        enumerable: true,
      });
      return function dispose() {};
    } catch {
      try {
        prompt.assemble = inner;
        return function dispose() {};
      } catch {
        return false;
      }
    }
  }
}

export const ASSEMBLE_GUARD_SYMBOL = GUARD;
