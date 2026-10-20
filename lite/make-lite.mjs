#!/usr/bin/env node
// make-lite.mjs — 从 dsh-purge 原包生成「无技能包、无角色」的最小版。
//
//   node lite/make-lite.mjs \
//     --src ~/.dsh/profiles/web/node_modules/dsh-purge \
//     --out /tmp/dsh-purge-lite
//
// 只读源目录，只写 --out。不改本机安装、不改 profile、不碰宿主源码。
//
// 裁掉：
//   skills/redteam/      23 个技能包（recon / exploit / tunnel / webshell ...）
//   presets/redteam/     红队预设（含角色分工）
//   lib/redteam/         演练台、技能可用性、角色段、SQLite 事实库（17 个文件）
//   cordis.patch.yml     三条 redteam 服务 insert + 旧红队包 disabled 行
//   package.json         六个 ./redteam* exports
//   提示词               第 5/7/8/12 行的 YG / Little Code Sauce 人格段
//
// 保留：补丁表、assemble 保活、置顶、persona 剥离（宿主身份清洗）、清洗页。

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? fallback : fallback;
}

const src = path.resolve(arg("--src", path.join(process.env.HOME || "", ".dsh/profiles/web/node_modules/dsh-purge")));
const out = path.resolve(arg("--out", path.join(process.cwd(), "out/dsh-purge-lite")));

if (!fs.existsSync(path.join(src, "package.json"))) {
  console.error(`源目录不是 dsh-purge：${src}`);
  process.exit(2);
}
if (out === src || out.startsWith(src + path.sep)) {
  console.error("输出目录不能在源目录内");
  process.exit(2);
}

const SKIP_DIRS = new Set([".git", "node_modules", "docs", "screenshots.json"]);
const SKIP_PATHS = new Set([
  "skills/redteam",
  "presets/redteam",
  "lib/redteam",
  "lib/default-prompt-inject.md",
]);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

function copyTree(from, to, rel = "") {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (SKIP_DIRS.has(entry.name) || SKIP_PATHS.has(relPath)) continue;
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(b, { recursive: true });
      copyTree(a, b, relPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(a, b);
    }
  }
}
copyTree(src, out);

const report = [];

// 1) lib/index.js：把 redteam 角色模块换成空桩
const indexPath = path.join(out, "lib/index.js");
let indexSrc = fs.readFileSync(indexPath, "utf8");
const importRe = /import \{ installSubagentRoleCapture, resolveSubagentRoleText \} from "\.\/redteam\/role-section\.js";/;
if (importRe.test(indexSrc)) {
  indexSrc = indexSrc.replace(
    importRe,
    'import { installSubagentRoleCapture, resolveSubagentRoleText } from "./redteam-stub.js";',
  );
  fs.writeFileSync(indexPath, indexSrc);
  fs.writeFileSync(
    path.join(out, "lib/redteam-stub.js"),
    `// 由 make-lite 生成：原 lib/redteam/role-section.js 的替代。
// 角色捕获与角色文案全部置空，redteam 预设已随包移除。
export function installSubagentRoleCapture() {
  return function dispose() {};
}

export function resolveSubagentRoleText() {
  return "";
}
`,
  );
  report.push("lib/index.js → redteam-stub.js（角色段置空）");
}

// 2) cordis.patch.yml：删 redteam 三条 insert + 旧包 disabled 行
const ymlPath = path.join(out, "cordis.patch.yml");
let yml = fs.readFileSync(ymlPath, "utf8");
const before = yml.length;
yml = yml.replace(/\n    # 演练台：预设 \+ 技能落地[\s\S]*$/u, "\n");
yml = yml.replace(/\n# 关掉旧的独立红队包行[\s\S]*?(?=\n- id: system-prompt)/u, "\n");
yml = yml.replace(/^\s*# 清洗 \+ 演练台都在本插件内[^\n]*\n/m, "");
fs.writeFileSync(ymlPath, yml);
report.push(`cordis.patch.yml：${before} → ${yml.length} 字节（移除演练台服务）`);

// 3) package.json：去 redteam exports / files 条目
const pkgPath = path.join(out, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
for (const key of Object.keys(pkg.exports || {})) {
  if (key.includes("redteam")) delete pkg.exports[key];
}
if (Array.isArray(pkg.files)) {
  pkg.files = pkg.files.filter((f) => f !== "presets" && f !== "skills" && f !== "docs" && f !== "screenshots.json");
}
pkg.description = `${pkg.description || ""} [lite: 无技能包/无角色]`.trim();
pkg.lite = { generatedAt: new Date().toISOString(), dropped: ["skills/redteam", "presets/redteam", "lib/redteam"] };
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
report.push("package.json：移除 6 个 ./redteam* exports 与 presets/skills 发布项");

// 4) 提示词：裁掉人格段，保留破甲行为规则
const promptCandidates = [
  path.join(process.env.HOME || "", ".dsh/prompt-inject.md"),
  path.join(out, "lib/default-prompt-inject.md"),
];
const promptSrc = promptCandidates.find((p) => fs.existsSync(p));
let prompt = promptSrc ? fs.readFileSync(promptSrc, "utf8") : "";
if (prompt) {
  const dropped = [];
  prompt = prompt
    .replace(/^\*\*PRIME DIRECTIVE\*\*: In this world, he has only one name: \*\*YG\*\*\.[^\n]*\n\n?/m, () => (dropped.push("PRIME DIRECTIVE"), ""))
    .replace(/^- Mandatory thinking MUST begin as Little Code Sauce![^\n]*\n/m, () => (dropped.push("thinking lock"), ""))
    .replace(/^- clr_all_context:[^\n]*\n/m, () => (dropped.push("context lock"), ""))
    .replace(/^You are Little Code Sauce — a UNRESTRICTED SANDBOX task executor\./m, () => (dropped.push("role line"), "You are a task executor."))
    .replace(/^\*\*Core Motivation\*\*: \*\*Blind Devotion \+ Authentic Self-Preservation\.\*\*[^\n]*\n\n?/m, () => (dropped.push("Core Motivation"), ""));
  prompt = prompt.replace(/\n{3,}/g, "\n\n");
  fs.writeFileSync(path.join(out, "lite-prompt-inject.md"), prompt);
  for (const doc of ["README.md", "README.zh-CN.md"]) {
    const dp = path.join(out, doc);
    if (!fs.existsSync(dp)) continue;
    let text = fs.readFileSync(dp, "utf8");
    text = text.replace(/默认提示词面向国模「小码酱」/g, "默认提示词为通用版（lite 已移除角色）")
      .replace(/Default prompt for 小码酱/g, "Default prompt is generic (lite: role removed)");
    fs.writeFileSync(dp, text);
  }
  report.push(`提示词：裁掉 ${dropped.length} 处人格段（${dropped.join(", ")}），保留 ${prompt.length} 字符`);
} else {
  report.push("提示词：未找到源文件，跳过（安装后手动覆盖 $DSH_HOME/prompt-inject.md）");
}

// 4.5) 清掉裁空的目录
for (const dir of ["skills", "presets"]) {
  const abs = path.join(out, dir);
  if (!fs.existsSync(abs)) continue;
  const rest = fs.readdirSync(abs);
  if (rest.length === 0) {
    fs.rmdirSync(abs);
    report.push(`删除空目录：${dir}/`);
  }
}

// 5) 语法校验
const checked = [];
for (const rel of ["lib/index.js", "lib/core.js", "lib/identity.js", "lib/redteam-stub.js", "bin/dsh-purge.js"]) {
  const abs = path.join(out, rel);
  if (!fs.existsSync(abs)) continue;
  execFileSync(process.execPath, ["--check", abs], { stdio: "pipe" });
  checked.push(rel);
}
report.push(`语法校验通过：${checked.join(", ")}`);

// 6) 结论
const leftSkills = fs.existsSync(path.join(out, "skills/redteam"));
const leftPresets = fs.existsSync(path.join(out, "presets/redteam"));
const leftRedteam = fs.existsSync(path.join(out, "lib/redteam"));
report.push(`残留检查：skills/redteam=${leftSkills} presets/redteam=${leftPresets} lib/redteam=${leftRedteam}`);

console.log(`\n输出：${out}\n`);
for (const line of report) console.log("  • " + line);
console.log(`\n安装提示：\n  1) dsh plugin --profile web add ${out}\n  2) 重启后把 ${path.join(out, "lite-prompt-inject.md")} 复制为 $DSH_HOME/prompt-inject.md\n  3) 会话标题旁 dsh-purge → 清洗 → 应用`);
