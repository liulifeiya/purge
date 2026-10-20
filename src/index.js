// @liulifeiya/purge-core
// Prompt-injection core extracted from dsh-purge v1.1.71.
//
// Two call styles:
//   1. plain string   → purge.composeSystem(system)      (any LLM client)
//   2. assembly-based → purge.attach(ctx) / installOn()  (cordis / DSH hosts)

export { createPurge } from "./attach.js";
export { installAssembleGuard, ASSEMBLE_GUARD_SYMBOL } from "./assemble-guard.js";
export {
  rewritePromptAssembly,
  leadWithInject,
  composeSystem,
  injectNeedles,
  sanitizeSections,
  DEFAULT_SECTION,
  DEFAULT_ORDER,
  DEFAULT_DROPPED_NAMES,
} from "./rewrite.js";
export { stripHarnessPersona, PERSONA_RULES } from "./persona.js";
export { hangPrompt, hungPrompt, installHostGlobal, hostSnippet } from "./host.js";

export { createPurge as default } from "./attach.js";
