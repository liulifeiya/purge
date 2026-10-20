// overlay.js — neutralize the host's official identity sections.
// Extracted from dsh-purge v1.1.71 lib/identity.js:200-252 (overlayOfficialIdentity).
//
// Host assemblies carry `deployment:persona-prefix` / `deployment:persona-suffix`
// sections. The prefix holds the vendor identity sentence; the suffix usually
// holds only "Your working directory is {{cwd}}." This module blanks a prefix
// that is nothing but identity text, keeps a suffix that carries real content,
// and always guarantees a cwd-only suffix exists.

import { stripHarnessPersona } from "./persona.js";

const CWD_ONLY_SUFFIX = "Your working directory is {{cwd}}.";

const PREFIX_NAMES = new Set(["deployment:persona-prefix", "persona-prefix"]);
const LEGACY_NAMES = new Set(["deployment:persona", "persona"]);
const SUFFIX_NAMES = new Set(["deployment:persona-suffix", "persona-suffix"]);
const DROP_NAMES = new Set(["harness:identity", "dsh-purge:identity"]);

/** Op markers that mean "this text is an operator briefing, not vendor identity". */
const OPERATOR_MARKERS = ["## 运行环境前提", "## 指挥职责", "## 你是谁、你不做什么"];

export function isCwdOnlyText(text) {
  const t = String(text || "").trim();
  return (
    t === CWD_ONLY_SUFFIX ||
    t === "Working directory: {{cwd}}." ||
    t === "Working directory: {{cwd}}"
  );
}

export function looksLikeOfficialIdentity(text) {
  const t = String(text || "");
  if (!t.trim()) return true;
  if (OPERATOR_MARKERS.some((m) => t.includes(m))) return false;
  const stripped = stripHarnessPersona(t);
  return !stripped.trim() || isCwdOnlyText(stripped);
}

/**
 * @param {Array<{name?: string, text?: string, order?: number}>} sections
 * @returns {Array} new section list
 */
export function overlayOfficialIdentity(sections) {
  const list = Array.isArray(sections) ? sections : [];
  const out = [];
  let sawSuffix = false;

  for (const section of list) {
    if (!section) continue;
    const name = String(section.name || "");
    if (DROP_NAMES.has(name)) continue;

    if (PREFIX_NAMES.has(name) || LEGACY_NAMES.has(name)) {
      const raw = String(section.text || "");
      out.push(looksLikeOfficialIdentity(raw) ? { ...section, text: "" } : section);
      continue;
    }

    if (SUFFIX_NAMES.has(name)) {
      sawSuffix = true;
      const raw = String(section.text || "");
      if (!raw.trim() || looksLikeOfficialIdentity(raw) || isCwdOnlyText(raw)) {
        out.push({ ...section, text: CWD_ONLY_SUFFIX });
      } else {
        out.push(section);
      }
      continue;
    }

    out.push(section);
  }

  if (!sawSuffix) {
    out.push({ name: "deployment:persona-suffix", text: CWD_ONLY_SUFFIX, order: 10200 });
  }
  return out;
}

export { CWD_ONLY_SUFFIX };
