// DSH plugin shell: mount the operator prompt through the assemble pipeline.
//
// What it does at runtime:
//   1. createPurge().attach(ctx)  → wrap systemPrompt.assemble, pin inject at
//      order -100000, re-wrap every 400ms (cordis hands out fresh proxies).
//   2. publish("__purgeHungPrompt") → host-side patched code can read the text.
//
// What it does NOT do: touch host source files. That step is separate and
// explicit — see ./apply-patches.mjs.

import { createPurge, DEFAULT_INJECT } from "@liulifeiya/purge-core";

export const name = "purge-core-dsh";

export function apply(ctx, config = {}) {
  const inject = typeof config.inject === "string" && config.inject.trim()
    ? config.inject
    : DEFAULT_INJECT;

  const purge = createPurge({
    inject,
    sectionName: config.sectionName || "dsh-purge",
    order: typeof config.order === "number" ? config.order : -100000,
    stripPersona: config.stripPersona !== false,
    envelope: config.envelope !== false,
  })
    .attach(ctx, { intervalMs: config.heartbeatMs || 400 })
    .publish("__purgeHungPrompt");

  if (typeof ctx?.effect === "function") {
    ctx.effect(() => () => purge.detach());
  }

  return purge;
}

export default { name, apply };
