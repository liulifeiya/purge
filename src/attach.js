// attach.js — one object that owns the injection text and can bind itself to
// either a cordis-style host (DSH) or a plain system string (any LLM client).

import { installAssembleGuard } from "./assemble-guard.js";
import { rewritePromptAssembly, composeSystem, DEFAULT_SECTION, DEFAULT_ORDER } from "./rewrite.js";
import { hangPrompt, hungPrompt, installHostGlobal } from "./host.js";

/**
 * @param {{inject?: string, sectionName?: string, order?: number,
 *          stripPersona?: boolean, dropNames?: string[],
 *          globalName?: string, publishGlobal?: boolean}} [options]
 */
export function createPurge(options = {}) {
  const state = {
    text: String(options.inject || ""),
    sectionName: options.sectionName || DEFAULT_SECTION,
    order: typeof options.order === "number" ? options.order : DEFAULT_ORDER,
    stripPersona: options.stripPersona !== false,
    dropNames: options.dropNames || undefined,
  };

  let detachFns = [];

  const rewrite = (assembled) =>
    rewritePromptAssembly(assembled, {
      inject: state.text,
      sectionName: state.sectionName,
      order: state.order,
      stripPersona: state.stripPersona,
      dropNames: state.dropNames,
    });

  const purge = {
    get text() {
      return state.text;
    },
    setText(text) {
      state.text = String(text || "");
      hangPrompt(state.text);
      return purge;
    },
    append(text) {
      const add = String(text || "").trim();
      if (!add) return purge;
      return purge.setText(state.text ? `${state.text}\n\n${add}` : add);
    },
    /** Plain-string path: use for OpenAI/Anthropic/self-hosted requests. */
    composeSystem(system) {
      return composeSystem(system, state.text, { stripPersona: state.stripPersona });
    },
    /** Assembly path: returns a new assembly with the inject pinned first. */
    composeSections(assembled) {
      return rewrite(assembled);
    },
    /** Wrap a host object exposing assemble() (idempotent). */
    installOn(prompt) {
      const d = installAssembleGuard(prompt, rewrite);
      if (typeof d === "function") detachFns.push(d);
      return purge;
    },
    /** Bind to a cordis/DSH-like ctx: event hook + periodic re-wrap. */
    attach(ctx, opts = {}) {
      const intervalMs = opts.intervalMs || 400;
      const tick = () => {
        let prompt = null;
        try {
          prompt = ctx && ctx.systemPrompt;
        } catch {
          prompt = null;
        }
        if (prompt) {
          const d = installAssembleGuard(prompt, rewrite);
          if (typeof d === "function") detachFns.push(d);
        }
        return prompt;
      };

      tick();

      let timer = null;
      if (opts.heartbeat !== false) {
        timer = setInterval(tick, intervalMs);
        if (typeof timer.unref === "function") timer.unref();
      }

      if (ctx && typeof ctx.on === "function") {
        const handler = async (...args) => {
          const [assembly] = args;
          const next = args.length >= 3 && typeof args[args.length - 1] === "function" ? args[args.length - 1] : null;
          let base = assembly;
          if (next) {
            try {
              base = await next();
            } catch {
              base = assembly;
            }
          }
          try {
            return rewrite(base);
          } catch {
            return base;
          }
        };
        try {
          const d = ctx.on("system-prompt/assemble", handler, { global: true, prepend: true });
          if (typeof d === "function") detachFns.push(d);
        } catch {
          /* older ctx.on signatures */
        }
      }

      detachFns.push(() => {
        if (timer) clearInterval(timer);
      });
      return purge;
    },
    detach() {
      for (const fn of detachFns) {
        try {
          if (typeof fn === "function") fn();
        } catch {}
      }
      detachFns = [];
      return purge;
    },
    /** Publish the pin to globalThis and to module state. */
    publish(globalName) {
      hangPrompt(state.text);
      installHostGlobal(globalName || options.globalName || "__purgeHungPrompt");
      return purge;
    },
    status() {
      return {
        bytes: state.text.length,
        pinned: hungPrompt() === state.text,
        sectionName: state.sectionName,
        order: state.order,
        stripPersona: state.stripPersona,
        handlers: detachFns.length,
      };
    },
  };

  hangPrompt(state.text);
  if (options.publishGlobal !== false && options.globalName) installHostGlobal(options.globalName);
  return purge;
}
