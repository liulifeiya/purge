# 参考对齐报告（vs YuJunZhiXue/dsh-purge v1.1.71）

参照对象：https://github.com/YuJunZhiXue/dsh-purge （本地副本 v1.1.71，sha256 见 `purge-core-extract/EXTRACT-INDEX.md`）

对齐原则：**只对齐破甲机制**。参考对象里的角色（YG / Little Code Sauce / 红队角色分工）与技能（23 个技能包、演练台、技能导入）不进入本项目。

## 一、本轮发现的不统一并已修正

| # | 参考实现 | 之前状态 | 修正 | 影响 |
|---|---|---|---|---|
| 1 | `stripHarnessPersona` 含 38 条规则，其中 `Your identity is defined exclusively by ...`、`You are not a generic coding agent` 两条 | 缺 | 补入 `src/persona.js` | 宿主残留身份句现在会被剥掉 |
| 2 | `injectMatchers()`：精确 needle 不中时，退化为「连续空白等价」的正则再匹配一次 | 只做精确匹配 | `src/rewrite.js` 新增 `injectMatchers()`，`leadWithInject()` 改为双路匹配 | 宿主改缩进/换行后不再残留第二份注入 |
| 3 | `rewritePromptAssembly` 流程为 `overlayOfficialIdentity(sanitize(leadWithInject(...)))` | 漏了 overlay 这一步 | 补上，顺序与参考一致 | `persona-prefix` 身份段会被清空，`persona-suffix` 保底为 cwd 一行 |
| 4 | `isWorkspaceBaselineSection()` + `dropWorkspaceBaseline` 选项 | 缺 | 补入 `src/rewrite.js` 并导出 | 可去掉宿主 workspace baseline 段，避免与注入叠加 |

测试：23 项全通过（新增 4 项覆盖上述修正）。

## 二、逐项对照（机制部分）

| 参考函数 | 本项目 | 状态 |
|---|---|---|
| `escapeDshInterpolation` | `chatml.js escapeInterpolation` | 对齐（白名单 `cwd/model/provider`） |
| `normalizeChatmlLayout` / `peelChatmlEnvelope` / `stripChatmlTags` | `chatml.js` 同名 | 对齐 |
| `injectNeedles` / `injectMatchers` | `rewrite.js` 同名 | 对齐（本轮补齐 loose） |
| `leadWithInject` | `rewrite.js` 同名 | 对齐 |
| `sanitizeAssemblySections` | `rewrite.js sanitizeSections` | 对齐 |
| `overlayOfficialIdentity` | `overlay.js` 同名 | 对齐（prefix 清空 / suffix 保底） |
| `isWorkspaceBaselineSection` | `rewrite.js` 同名 | 本轮补齐 |
| `rewritePromptAssembly` | `rewrite.js` 同名 | 对齐（sections/contexts/tools 结构、不原地改） |
| `stripHarnessPersona` | `persona.js` 同名 | 37 条 + 可扩展 `extraRules`（参考 38 条，两条 approval 合并为行级匹配，覆盖更宽） |
| `installAssembleGuard` | `assemble-guard.js` 同名 | 对齐（Symbol 幂等、noop dispose、异常兜底） |
| `#55/#66/#72/#74/#87/#88` 宿主补丁 | `host-patches.js` 原文 + `applyHostPatch` | 对齐（原文提取，未改锚点） |
| 宿主拼接代码块 | `host.js hostSnippet()` | 对齐（head 80 / tail 96，LF 归一） |
| `GLOBAL_PROMPT_ORDER = -100000` | `rewrite.js DEFAULT_ORDER` | 对齐 |
| 加密槽载荷 | `default-inject.js DEFAULT_INJECT` | 对齐（20,969 字符，但已按项目要求保留裁剪能力） |

## 三、有意偏差（不引入）

| 参考内容 | 原因 |
|---|---|
| `capabilityProtocolText`（skill/MCP 选用协议） | 协议正文要求模型去读技能目录，属于技能体系的一部分 |
| `modePromptText` / `withoutCtfContract` / `splitRedteamInject` | 红队预设专用切分 |
| `overlayOfficialIdentity` 的角色卡分支（`IDENTITY_CARD_PREFIX`、`REDTEAM_ROLE_SECTION`） | 角色 |
| `adaptInjectForMinimalPreset` / `sessionForInject` / `isMinimalSession` | 宿主预设适配，依赖 `agents` 注册表与预设 id，非注入机制本体 |
| `isMnemonPluginMessage` / `withoutHardcodedExec` | 第三方插件兼容 |
| `lib/skills.js`、`skills/redteam/*`、`presets/redteam/*`、`lib/redteam/*` | 技能与角色，明确排除 |

## 四、对参考样本的修改（仅限 lite 生成时）

`lite/make-lite.mjs` 在生成裁剪版时会对参考样本做以下改动，均在输出目录内，不改本机安装：

| 位置 | 改动 |
|---|---|
| `lib/index.js` | `./redteam/role-section.js` → `./redteam-stub.js`；`./skills.js` → `./skills-stub.js`；`./drill-grant.js` → `./drill-stub.js` |
| 生成 `lib/*-stub.js` | 角色捕获返回空、技能读写返回空/抛「已移除」、演练授权恒空 |
| `cordis.patch.yml` | 删三条演练台 insert 与旧红队包 disabled 行（1583 → 792 字节） |
| `package.json` | 删 6 个 `./redteam*` exports、`dsh.client`、`client.js`/`presets`/`skills` 发布项 |
| `README*.md` | 删界面预览、skills 流程图、侧栏/演练台/Skill 表格行；改写「点侧栏」为 `/purge apply` |
| 提示词 | 删 PRIME DIRECTIVE / thinking lock / context lock / role line / Core Motivation |

## 五、复现对齐检查

```bash
npm test                                  # 23 项
node lite/make-lite.mjs --src <原版目录> --out /tmp/lite
grep -rn "Little Code Sauce\|小码酱" /tmp/lite/lib | grep -v "PLUGIN_DEFAULT_MARKS"
```
