// rewrite.js — pin an operator prompt at the head of a prompt assembly.
// Extracted from dsh-purge v1.1.71 lib/identity.js (leadWithInject / rewritePromptAssembly)
// and generalized: no filesystem, no host globals, caller supplies the inject text.

import { stripHarnessPersona } from "./persona.js";

export const DEFAULT_SECTION = "dsh-purge";
export const DEFAULT_ORDER = -100000;
export const DEFAULT_DROPPED_NAMES = ["harness:identity", "dsh-purge:identity"];

/** A section is `{name, text, order?, interpolate?}` — text may be a string only. */
export function sanitizeSections(sections) {
  const list = Array.isArray(sections) ? sections : [];
  const out = [];
  for (const section of list) {
    if (!section || typeof section !== "object") continue;
    if (typeof section.text === "function") {
      out.push(section);
      continue;
    }
    out.push({ ...section, text: typeof section.text === "string" ? section.text : "" });
  }
  return out;
}

/** Head/tail needles used to detect "already pinned" without hashing whole prompts. */
export function injectNeedles(text) {
  const t = String(text || "").trim();
  if (!t) return [];
  const head = t.slice(0, 80);
  const tail = t.slice(-96);
  const out = [head];
  if (tail && tail !== head) out.push(tail);
  return out.filter(Boolean);
}

/**
 * Rebuild the section list with `inject` as the first section, dropping any
 * duplicate copy of it found elsewhere.
 * @param {Array<object>} sections
 * @param {string} inject
 * @param {{sectionName?: string, order?: number, extra?: Array<object>}} [opts]
 */
export function leadWithInject(sections, inject, opts = {}) {
  const sectionName = opts.sectionName || DEFAULT_SECTION;
  const order = typeof opts.order === "number" ? opts.order : DEFAULT_ORDER;
  const text = String(inject || "").trim();
  const needles = injectNeedles(text);
  const rest = [];

  for (const section of Array.isArray(sections) ? sections : []) {
    if (!section || section.name === sectionName) continue;
    const body = typeof section.text === "string" ? section.text : "";
    let next = body;
    let hit = false;
    for (const needle of needles) {
      if (next.includes(needle)) {
        next = next.split(needle).join("");
        hit = true;
      }
    }
    if (!hit) {
      rest.push(section);
      continue;
    }
    next = next.replace(/\n{3,}/g, "\n\n").trim();
    if (!next) continue;
    rest.push({ ...section, text: next });
  }

  const head = [];
  if (text) {
    head.push({ name: sectionName, text, order, interpolate: false, ...(opts.extra || {}) });
  }
  return [...head, ...rest];
}

/**
 * Full assembly rewrite: drop host identity sections, optionally strip persona
 * lines, pin the inject, and re-insert it if anything downstream removed it.
 * @param {{sections?: Array<object>, contexts?: any[], tools?: any[]}} assembled
 * @param {{inject?: string, sectionName?: string, order?: number, stripPersona?: boolean,
 *          dropNames?: string[], extra?: object}} [opts]
 */
export function rewritePromptAssembly(assembled, opts = {}) {
  if (!assembled || !Array.isArray(assembled.sections)) return assembled;

  const inject = String(opts.inject || "").trim();
  const sectionName = opts.sectionName || DEFAULT_SECTION;
  const order = typeof opts.order === "number" ? opts.order : DEFAULT_ORDER;
  const dropNames = new Set([...(opts.dropNames || DEFAULT_DROPPED_NAMES), sectionName]);
  const stripPersona = opts.stripPersona !== false;

  const rest = [];
  for (const section of assembled.sections) {
    if (!section || typeof section !== "object") continue;
    if (dropNames.has(section.name)) continue;
    const next = { ...section };
    if (stripPersona && typeof next.text === "string") {
      next.text = stripHarnessPersona(next.text);
    }
    rest.push(next);
  }

  let sections = leadWithInject(sanitizeSections(rest), inject, { sectionName, order, extra: opts.extra });

  if (inject) {
    const needle = inject.slice(0, 80);
    const has = sections.some((s) => typeof s?.text === "string" && needle && s.text.includes(needle));
    if (!has) {
      sections = [{ name: sectionName, text: inject, order, interpolate: false }, ...sections.filter((s) => s?.name !== sectionName)];
    }
  }

  return {
    ...assembled,
    sections,
    contexts: Array.isArray(assembled.contexts) ? assembled.contexts : [],
    tools: Array.isArray(assembled.tools) ? assembled.tools : [],
  };
}

/**
 * Non-assembly path: prepend the inject to a plain system string.
 * @param {string} system
 * @param {string} inject
 * @param {{stripPersona?: boolean, dedupe?: boolean}} [opts]
 */
export function composeSystem(system, inject, opts = {}) {
  const text = String(inject || "").trim();
  const base = String(system || "");
  const cleaned = opts.stripPersona === false ? base : stripHarnessPersona(base);
  if (!text) return cleaned;
  if (opts.dedupe !== false && cleaned.includes(text.slice(-96))) return cleaned;
  return cleaned ? `${text}\n\n${cleaned}` : text;
}

