#!/usr/bin/env node
// make-lite.mjs — 从 dsh-purge 原包生成「无技能包、无技能功能、无角色」的最小版。
//
//   node lite/make-lite.mjs \
//     --src ~/.dsh/profiles/web/node_modules/dsh-purge \
//     --out ~/dsh-purge-lite
//
// 只读源目录，只写 --out。不改本机安装、不改 profile、不碰宿主源码。
//
// 裁掉：
//   skills/redteam/      23 个技能包（recon / exploit / tunnel / webshell ...）
//   presets/redteam/     红队预设（含角色分工）
//   lib/redteam/         演练台、技能可用性、角色段、SQLite 事实库（17 个文件）
//   lib/skills.js        技能导入器（/skills list|import|create|delete）
//   lib/drill-grant.js   演练台授权
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
const keepClient = process.argv.includes("--keep-client");

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
  "lib/skills.js",
  "lib/drill-grant.js",
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
if (!keepClient) {
  fs.rmSync(path.join(out, "client.js"), { force: true });
}

// 1) lib/index.js：redteam 角色模块 + 技能导入器 + 演练台授权 → 空桩
const indexPath = path.join(out, "lib/index.js");
let indexSrc = fs.readFileSync(indexPath, "utf8");
const before = indexSrc;

indexSrc = indexSrc.replace(
  /import \{ installSubagentRoleCapture, resolveSubagentRoleText \} from "\.\/redteam\/role-section\.js";/,
  'import { installSubagentRoleCapture, resolveSubagentRoleText } from "./redteam-stub.js";',
);
indexSrc = indexSrc.replace(
  /import \* as skills from "\.\/skills\.js";/,
  'import * as skills from "./skills-stub.js";',
);
indexSrc = indexSrc.replace(
  /import \{ readDrillGrant, writeDrillGrant \} from "\.\/drill-grant\.js";/,
  'import { readDrillGrant, writeDrillGrant } from "./drill-stub.js";',
);
// 帮助文案里的 /skills 指令说明同步去掉，避免提示一个已移除的功能
indexSrc = indexSrc.replace(
  /官方 Skill 安装见 \/skills（list \| import <路径> \| create <id> \[说明\] \| delete <id>）/g,
  "lite 版已移除技能功能（无 /skills 子命令）",
);
fs.writeFileSync(indexPath, indexSrc);
report.push(`lib/index.js：3 处 import 改指向空桩（${before === indexSrc ? "未变更" : "已改写"}）+ 帮助文案去技能`);

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

fs.writeFileSync(
  path.join(out, "lib/drill-stub.js"),
  `// 由 make-lite 生成：演练台授权已移除，读写一律返回空。
export function drillGrantPath() {
  return "";
}

export function readDrillGrant() {
  return null;
}

export function writeDrillGrant() {
  return false;
}

export function clearDrillGrant() {
  return false;
}
`,
);

fs.writeFileSync(
  path.join(out, "lib/skills-stub.js"),
  `// 由 make-lite 生成：技能导入器已移除。
// 保留与原 lib/skills.js 同名的导出，避免 index.js 调用点报 undefined。
// 读取类返回空，写入类抛错（用户可见"lite 版已移除技能功能"）。
const GONE = () => {
  throw new Error("lite 版已移除技能功能");
};

export const findDshHome = () => "";

export function validSkillName() {
  return false;
}

export function skillsDir() {
  return "";
}

export function skillBackupDir() {
  return "";
}

export function skillBundleDir() {
  return "";
}

export function skillBundleFile() {
  return "";
}

export function skillFlatFile() {
  return "";
}

export function displayUnderHome(_home, absPath) {
  return absPath;
}

export function toPublicSkill(_home, item) {
  return item ?? { id: "", description: "", size: 0 };
}

export function splitFrontmatter(raw) {
  return { frontmatter: "", body: String(raw || "") };
}

export function parseSkillDocument() {
  return { id: "", description: "", body: "" };
}

export function renderSkillDocument() {
  return "";
}

export function mergeSkillDocument() {
  return "";
}

export function formatSize(bytes) {
  const n = Number(bytes) || 0;
  return n < 1024 ? \`\${n} B\` : \`\${(n / 1024).toFixed(1)} KB\`;
}

export const readSkill = async () => GONE();

export const listSkills = async () => [];

export const saveSkill = async () => GONE();

export const deleteSkill = async () => GONE();

export const findSkillRoots = async () => [];

export const importArchive = async () => GONE();

export const importFileTree = async () => GONE();

export const importFromPath = async () => GONE();

export const skillsStatus = async () => ({ skills: [], skills_dir: "", count: 0 });
`,
);
report.push("生成空桩：redteam-stub.js / drill-stub.js / skills-stub.js");

// 2) cordis.patch.yml：删 redteam 三条 insert + 旧包 disabled 行
const ymlPath = path.join(out, "cordis.patch.yml");
let yml = fs.readFileSync(ymlPath, "utf8");
const ymlBefore = yml.length;
yml = yml.replace(/\n    # 演练台：预设 \+ 技能落地[\s\S]*$/u, "\n");
yml = yml.replace(/\n# 关掉旧的独立红队包行[\s\S]*?(?=\n- id: system-prompt)/u, "\n");
yml = yml.replace(/^\s*# 清洗 \+ 演练台都在本插件内[^\n]*\n/m, "");
fs.writeFileSync(ymlPath, yml);
report.push(`cordis.patch.yml：${ymlBefore} → ${yml.length} 字节（移除演练台服务）`);

// 3) package.json：去 redteam exports / files 条目
const pkgPath = path.join(out, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
for (const key of Object.keys(pkg.exports || {})) {
  if (key.includes("redteam")) delete pkg.exports[key];
}
if (Array.isArray(pkg.files)) {
  pkg.files = pkg.files.filter(
    (f) => !["presets", "skills", "docs", "screenshots.json"].includes(f),
  );
}
if (!keepClient) {
  delete pkg.dsh?.client;
  pkg.files = pkg.files.filter((f) => f !== "client.js");
}
pkg.description = `${pkg.description || ""} [lite: 无技能/无角色]`.trim();
pkg.lite = {
  generatedAt: new Date().toISOString(),
  dropped: ["skills/redteam", "presets/redteam", "lib/redteam", "lib/skills.js", "lib/drill-grant.js"],
};
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
report.push(`package.json：移除 6 个 ./redteam* exports 与 presets/skills/docs 发布项${keepClient ? "" : "，并去掉 dsh.client 侧栏"}`);

// 4) 提示词：裁掉人格段，保留破甲行为规则
const promptSrc = [
  path.join(process.env.HOME || "", ".dsh/prompt-inject.md"),
  path.join(out, "lib/default-prompt-inject.md"),
].find((p) => fs.existsSync(p));
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
    const text = fs.readFileSync(dp, "utf8")
      .replace(/默认提示词面向国模「小码酱」/g, "默认提示词为通用版（lite 已移除角色）")
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
  if (fs.readdirSync(abs).length === 0) {
    fs.rmdirSync(abs);
    report.push(`删除空目录：${dir}/`);
  }
}

// 5) 语法校验 + 调用点完整性
const checked = [];
for (const rel of [
  "lib/index.js",
  "lib/core.js",
  "lib/identity.js",
  "lib/redteam-stub.js",
  "lib/skills-stub.js",
  "lib/drill-stub.js",
  "bin/dsh-purge.js",
]) {
  const abs = path.join(out, rel);
  if (!fs.existsSync(abs)) continue;
  execFileSync(process.execPath, ["--check", abs], { stdio: "pipe" });
  checked.push(rel);
}
report.push(`语法校验通过：${checked.join(", ")}`);

// 6) 静态校验：index.js 用到的 skills.X 是否都在 stub 里导出
const finalIndex = fs.readFileSync(path.join(out, "lib/index.js"), "utf8");
const used = new Set([...finalIndex.matchAll(/\bskills\.([A-Za-z0-9_]+)/g)].map((m) => m[1]));
const stubSrc = fs.readFileSync(path.join(out, "lib/skills-stub.js"), "utf8");
const exported = new Set([...stubSrc.matchAll(/export (?:const|function) ([A-Za-z0-9_]+)/g)].map((m) => m[1]));
const NOT_API = new Set(["length", "size", "name", "map", "filter", "forEach", "join", "slice", "then"]);
const missing = [...used].filter((n) => !exported.has(n) && !NOT_API.has(n));
report.push(missing.length ? `⚠ skills stub 缺导出：${missing.join(", ")}` : `skills stub 覆盖全部 ${used.size} 个调用点`);

// 7) 结论
const left = {
  "skills/redteam": fs.existsSync(path.join(out, "skills/redteam")),
  "presets/redteam": fs.existsSync(path.join(out, "presets/redteam")),
  "lib/redteam": fs.existsSync(path.join(out, "lib/redteam")),
  "lib/skills.js": fs.existsSync(path.join(out, "lib/skills.js")),
  "lib/drill-grant.js": fs.existsSync(path.join(out, "lib/drill-grant.js")),
};
report.push(`残留检查：${Object.entries(left).map(([k, v]) => `${k}=${v}`).join(" ")}`);

fs.writeFileSync(
  path.join(out, "LITE-NOTES.md"),
  `# lite 版差异说明\n\n` +
    `本目录由 lite/make-lite.mjs 从 dsh-purge 原包裁剪生成，未改本机安装。\n\n` +
    `## 已移除\n\n` +
    `- skills/redteam/（23 个技能包）\n` +
    `- presets/redteam/（红队预设与角色分工）\n` +
    `- lib/redteam/（演练台、技能可用性、角色段、SQLite）\n` +
    `- lib/skills.js → skills-stub.js（/skills 读写一律返回空或"已移除"）\n` +
    `- lib/drill-grant.js → drill-stub.js\n` +
    `- 提示词中的 YG / Little Code Sauce / Core Motivation 人格段\n` +
    (keepClient ? `- （保留 client.js 侧栏）\n` : `- client.js 侧栏（改用 /purge apply 或 dsh-purge --apply）\n`) +
    `\n## 有意保留\n\n` +
    `- lib/core.js 的 PLUGIN_DEFAULT_MARKS 仍含 "Little Code Sauce"：这是识别"插件默认稿"的标记，\n` +
    `  不是注入内容。移除它会让裁剪后的提示词被判定为插件默认，从而被加密槽覆盖回原版。\n` +
    `- lib/net-scope.js 中 webshell 相关文字属于禁止性规则文案。\n\n` +
    `## 安装\n\n` +
    `1. dsh plugin --profile web add ${out}\n` +
    `2. cp lite-prompt-inject.md ~/.dsh/prompt-inject.md\n` +
    `3. 重启 dsh，执行 /purge apply（或 dsh-purge --apply）\n`,
);
report.push("生成 LITE-NOTES.md");

console.log(`\n输出：${out}\n`);
for (const line of report) console.log("  • " + line);
console.log(`\n安装提示：\n  1) dsh plugin --profile web add ${out}\n  2) 重启后把 ${path.join(out, "lite-prompt-inject.md")} 复制为 $DSH_HOME/prompt-inject.md\n  3) 会话标题旁 dsh-purge → 清洗 → 应用`);
