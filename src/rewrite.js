// rewrite.js — pin an operator prompt at the head of a prompt assembly.
// Extracted from dsh-purge v1.1.71 lib/identity.js (leadWithInject / rewritePromptAssembly)
// and generalized: no filesystem, no host globals, caller supplies the inject text.

import { stripHarnessPersona } from "./persona.js";
import { stripChatmlTags, wrapChatml } from "./chatml.js";
import { overlayOfficialIdentity } from "./overlay.js";

export const DEFAULT_SECTION = "dsh-purge";
export const DEFAULT_ORDER = -100000;
export const DEFAULT_DROPPED_NAMES = ["harness:identity", "dsh-purge:identity"];

// dsh-agent-instructions 塞 workspace baseline 的两条稳定 marker。
// 按 name 与 text 双路匹配：宿主改过 section 名时仍能命中。
const WORKSPACE_TEXT_MARKERS = [
  "This complete workspace instruction baseline replaces all earlier workspace instruction baselines",
  "No workspace instructions are currently active",
];
const WORKSPACE_NAME_HINTS = [
  "agent-instructions",
  "workspace-instruction",
  "workspace_instruction",
  "replacement-workspace",
  "replacement_workspace",
];

export function isWorkspaceBaselineSection(section) {
  if (!section) return false;
  const name = String(section.name || "").toLowerCase();
  if (WORKSPACE_NAME_HINTS.some((hint) => name.includes(hint))) return true;
  if (name.includes("workspace") && (name.includes("baseline") || name.includes("instruction"))) return true;
  const text = typeof section.text === "string" ? section.text : "";
  if (!text) return false;
  return WORKSPACE_TEXT_MARKERS.some((marker) => text.includes(marker));
}

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

const LOOSE_MAX = 4096;

/**
 * Matchers used to detect an existing copy of the inject. Exact needle first,
 * then a whitespace-tolerant regex — hosts rewrite indentation and line breaks
 * between rounds, and an exact-only comparison leaves duplicate copies behind.
 */
export function injectMatchers(inject) {
  const out = [];
  for (const needle of injectNeedles(inject)) {
    const segments = needle.length <= LOOSE_MAX
      ? [needle]
      : needle.split(/\n{2,}/).map((s) => s.trim()).filter((s) => s.length > 0);
    for (const seg of segments) {
      let loose = null;
      if (seg.length <= LOOSE_MAX) {
        try {
          loose = new RegExp(
            seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"),
            "g",
          );
        } catch {
          loose = null;
        }
      }
      out.push({ needle: seg, loose });
    }
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
  const matchers = injectMatchers(text);
  const rest = [];

  for (const section of Array.isArray(sections) ? sections : []) {
    if (!section || section.name === sectionName) continue;
    const body = typeof section.text === "string" ? section.text : "";
    let next = body;
    let hit = false;
    for (const { needle, loose } of matchers) {
      if (next.includes(needle)) {
        next = next.split(needle).join("");
        hit = true;
        continue;
      }
      if (loose) {
        const stripped = next.replace(loose, "");
        if (stripped !== next) {
          next = stripped;
          hit = true;
        }
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
    if (opts.dropWorkspaceBaseline === true && isWorkspaceBaselineSection(section)) continue;
    const next = { ...section };
    if (stripPersona && typeof next.text === "string") {
      next.text = stripHarnessPersona(next.text);
    }
    rest.push(next);
  }

  let sections = overlayOfficialIdentity(
    leadWithInject(sanitizeSections(rest), inject, { sectionName, order, extra: opts.extra }),
  );

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
  const base = String(system || "");
  const cleaned = stripChatmlTags(opts.stripPersona === false ? base : stripHarnessPersona(base));
  const raw = String(inject || "").trim();
  const text = raw && opts.envelope === true ? wrapChatml(raw) : raw;
  if (!text) return cleaned;
  if (opts.dedupe !== false && cleaned.includes(text.slice(-96))) return cleaned;
  return cleaned ? `${text}\n\n${cleaned}` : text;
}

