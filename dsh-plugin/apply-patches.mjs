#!/usr/bin/env node
// Apply / revert the six host-side patches (#55 #66 #72 #74 #87 #88).
//
//   node apply-patches.mjs --check         只报告每条 patch 是否命中，不写文件
//   node apply-patches.mjs --apply         写入（先备份 .purge.bak）
//   node apply-patches.mjs --revert        从 .purge.bak 还原
//   node apply-patches.mjs --apply --root /path/to/@deepseek-ai
//
// 默认 root 从 dsh 可执行文件推断：
//   <nvm>/versions/node/<v>/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai

import fs from "node:fs";
import path from "node:path";
import { HOST_PATCHES, applyHostPatch, isPatched } from "@liulifeiya/purge-core";

const FILE_MAP = {
  "agent-loop": ["dsh-agent-loop/lib/index.js"],
  "system-prompt": ["dsh-system-prompt/lib/index.js", "dsh-system-prompt-nested/lib/index.js"],
  "system-prompt-nested": ["dsh-system-prompt-nested/lib/index.js"],
  "llm-deepseek": ["dsh-llm-deepseek/lib/index.js"],
};

function argOf(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? fallback : fallback;
}

function detectRoot() {
  const fromEnv = process.env.DSH_BASE || process.env.PURGE_HOST_ROOT;
  if (fromEnv) return fromEnv;
  const bin = process.env.PATH.split(":").map((p) => path.join(p, "dsh")).find((p) => fs.existsSync(p));
  if (bin) {
    const real = fs.realpathSync(bin);
    const marker = "/node_modules/@deepseek-ai/dsh/";
    const at = real.indexOf(marker);
    if (at > 0) {
      const guess = path.join(real.slice(0, at), "node_modules", "@deepseek-ai", "dsh", "node_modules", "@deepseek-ai");
      if (fs.existsSync(guess)) return guess;
    }
  }
  return null;
}

const root = argOf("--root") || detectRoot();
if (!root || !fs.existsSync(root)) {
  console.error("找不到宿主 @deepseek-ai 目录，用 --root 指定");
  process.exit(2);
}

const mode = process.argv.includes("--apply") ? "apply"
  : process.argv.includes("--revert") ? "revert" : "check";

const targets = new Set();
for (const p of HOST_PATCHES) {
  for (const key of [].concat(p.file || [])) {
    for (const rel of FILE_MAP[key] || []) targets.add(rel);
  }
}

for (const rel of targets) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.log(`SKIP  ${rel}  (不存在)`);
    continue;
  }
  const bak = abs + ".purge.bak";
  if (mode === "revert") {
    if (!fs.existsSync(bak)) { console.log(`SKIP  ${rel}  (无备份)`); continue; }
    fs.copyFileSync(bak, abs);
    console.log(`REVERT ${rel}`);
    continue;
  }
  let src = fs.readFileSync(abs, "utf8");
  let changed = 0;
  for (const p of HOST_PATCHES) {
    const keys = [].concat(p.file || []);
    if (!keys.some((k) => (FILE_MAP[k] || []).includes(rel))) continue;
    const r = applyHostPatch(src, p);
    if (r.changed) {
      src = r.text;
      changed += 1;
      console.log(`${mode === "apply" ? "PATCH" : "HIT  "} ${rel}  #${p.id} ${p.name}`);
    } else if (isPatched(src, p)) {
      console.log(`OK    ${rel}  #${p.id} ${p.name}  (已打)`);
    } else {
      console.log(`MISS  ${rel}  #${p.id} ${p.name}  (${r.reason || "no_change"})`);
    }
  }
  if (mode === "apply" && changed > 0) {
    if (!fs.existsSync(bak)) fs.copyFileSync(abs, bak);
    fs.writeFileSync(abs, src);
    console.log(`WRITE ${rel}  (${changed} 处，备份 ${path.basename(bak)})`);
  }
}

console.log(`\n模式: ${mode}  根目录: ${root}`);
if (mode === "apply") console.log("重启 dsh 后生效；回滚: node apply-patches.mjs --revert");
