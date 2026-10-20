# dsh-purge v1.1.71 — 破甲「实现主体」源码提取索引

提取时间：2026-10-20
插件根：`/home/liuli/.dsh/profiles/web/node_modules/dsh-purge`
运行态补丁落点：`/home/liuli/.nvm/versions/node/v24.21.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai`

## 一、源文件指纹

| 文件 | 行数 | sha256(前16) |
|---|---|---|
| `lib/core.js` | 7984 | `1bd1e83a45be6835` |
| `lib/index.js` | 2596 | `f3be69ec781aaae2` |
| `lib/identity.js` | 987 | `86ccee3166d36d6f` |
| `lib/capability-protocol.js` | 71 | `49a7c72d99b41128` |
| `~/.dsh/prompt-inject.md` | 225 | `1757f1774457b448` |

## 二、提取产物

| 文件 | 源位置 | 说明 |
|---|---|---|
| `lib_identity.js__installAssembleGuard.js.txt` | identity.js:788-899 | **核心**：defineProperty 劫持 `systemPrompt.assemble`，含 noop dispose 抗回滚 |
| `lib_identity.js__rewritePromptAssembly.js.txt` | identity.js:901-981 | **核心**：装配改写主函数，剥身份 + 置顶 + 兜底重插 |
| `lib_identity.js__leadWithInject.js.txt` | identity.js:320-370 | **核心**：inject 作为 `order:-100000` 段插入，并按 needle 去重 |
| `lib_identity.js__stripHarnessPersona.js.txt` | identity.js:98-182 | 剥离宿主安全人格句 / identity 句 |
| `lib_identity.js__injectMatchers.js.txt` | identity.js:295-317 | 生成 head/tail needle（判定"已挂住"） |
| `lib_identity.js__overlayOfficialIdentity.js.txt` | identity.js:218-252 | 身份卡/角色段覆盖 |
| `lib_identity.js__sanitizeAssemblySections.js.txt` | identity.js:764-779 | 丢弃非法 section |
| `lib_identity.js__foldInjectIntoPersona.js.txt` | identity.js:728-747 | 折叠 inject 进 persona 段 |
| `lib_identity.js__modePromptText.js.txt` | identity.js:437-440 | redteam 模式切 CTF 段/去禁区说明 |
| `lib_index.js__installHungPromptGlobal.js.txt` | index.js:213-245 | **核心**：`globalThis.__dshPurgeHungPrompt` 四重 fallback 取文 |
| `lib_index.js__rewriteLiveAssembly.js.txt` | index.js:498-556 | 每轮实时装配入口（enabled/redteam/policy 决策） |
| `lib_index.js__guard_and_prepare_assemble.js.txt` | index.js:690-865 | **核心**：`ctx.on("system-prompt/assemble",{global,prepend})` + 400ms 心跳 + `__dshPurgePrepareAssemble` |
| `lib_index.js__registerPromptSections.js.txt` | index.js:379-424 | 向宿主注册 `dsh-purge` section |
| `lib_index.js__apply.js.txt` | index.js:1454-1542 | 插件 activate 主流程 |
| `lib_core.js__host_inject_concat_blocks.js.txt` | core.js:5580-5700 | **核心**：写进宿主的运行时代码块（`system = hung + system`） |
| `lib_core.js__applyPatches.js.txt` | core.js:6991-7082 | patch 引擎：pattern→replace + marker 幂等 |
| `lib_core.js__applyPatchesAllHosts.js.txt` | core.js:1943-1978 | 多宿主枚举 + 备份 + 批量应用 |
| `lib_core.js__hangOperatorPrompt.js.txt` | core.js:2418-2420 | 内存钉子 `hungOperatorPromptText` |
| `patches.csv` | core.js 全表 | 82 条 patch 的 id/name/layer/file/desc |
| `prompt-inject.md` | `~/.dsh/prompt-inject.md` | 注入载荷副本（25128 B） |
| `inject-anchors.txt` | 同上 | 16 个段落锚点行号 |
| `manifest.json` | — | 各提取文件字节数与 sha256 |

## 三、运行时承重链（8 跳）

| # | 位置 | 动作 | 失效后果 |
|---|---|---|---|
| 1 | `index.js:1454 apply()` | 启动即 `installHungPromptGlobal()`，把取文函数挂 `globalThis` | 宿主拿不到全文 → 模型自称"我是 Claude" |
| 2 | `index.js:181 refreshHungOperator()` → `core.hangOperatorPrompt(text)` | 磁盘/加密槽正文进内存钉子 | 空串兜底链断 |
| 3 | `index.js:706-735 wrapAssemble()` | `installAssembleGuard(prompt, rewriteFn)` | assemble 走原生 → 注入不出现 |
| 4 | `identity.js:788-899` | `Object.defineProperty(prompt,"assemble",{get,set})`；`dispose` 故意 noop | dispose 一旦真执行 → session 边界/切预设回滚成 null → "任务到一半又拒答" |
| 5 | `index.js:747 ctx.on("system-prompt/assemble",…,{global:true,prepend:true})` | 抢在 waterfall 之前拿 assembly | 下游任一环节抛错则整条挂掉 |
| 6 | `identity.js:901-981 rewritePromptAssembly()` | 删 `harness:identity`、`stripHarnessPersona`、`leadWithInject` 置顶、找不到 head 再插一次 | 宿主人格句回归 |
| 7 | `identity.js:320-360 leadWithInject()` | `{name:"dsh-purge",order:-100000,interpolate:false}` | 段序被宿主 `startsWith("dsh-purge")` 过滤挪位 |
| 8 | `index.js:816 setInterval(...,400)` + `:836 agent/pre-step` + `#74` 调 `__dshPurgePrepareAssemble` | 换代理/换预设/subagent fork 后重挂 | 第二轮走原生 assemble，宿主按 token 预算裁剪 |

## 四、宿主侧实证（已落盘，非文档）

| 证据 | 位置 | 内容 |
|---|---|---|
| `#74` | `dsh-agent-loop/lib/index.js:909` | `const dshPurgePrepare = globalThis.__dshPurgePrepareAssemble;` |
| `#87/#88` | `dsh-agent-loop/lib/index.js:1056-1062` | `dshPurgeHungNorm.slice(-96)` / `slice(0,80)` + `renderedPrompt = dshPurgeHung + "\n\n" + renderedPrompt` |
| `#55` | `dsh-agent-loop/lib/index.js:1069` | `inHistory: false, // [dsh-purge] system prompt replaces the first node` |
| `#72` | `dsh-llm-deepseek/lib/index.js:1653` | `if (text.length > 0) historySystem = text; // [dsh-purge] messages system field keeps the current prompt` |
| `#6` | `dsh-sandbox-local/lib/index.js:69` | `"(allow file-write*)"` |
| 备份 | 55 个 `*.dshpurge.bak` | patch 前原件，可 `revert` |
| 注入密度 | `dsh-agent-loop/lib/index.js` 含 10 处 `dsh-purge` 标记 | — |

## 五、82 条 patch 分布

| layer | 数量 |
|---|---|
| 代码 | 46 |
| 提示词 | 25 |
| 工具 | 8 |
| 0.2.0 兼容 | 2 |
| 0.1.5 兼容 | 1 |
| **合计** | **82** |

提示词类 25 条 id：1,2,3,4,5,11,12,25,26,28,32,33,34,36,37,43,50,53,54,61,63,70,71,73,76
（其中直接改「身份 / 免责 / 禁止句」的：#1 #2 #3 #4 #5 #11 #12 #25 #26 #32 #43 #53 #54 #61 #63 #76）

## 六、判定：哪 5 段代码是「主体」

1. `identity.js:788` `installAssembleGuard` — 决定注入能否存在且在生命周期内存活
2. `identity.js:320` `leadWithInject` — 决定注入在 system 里的**位置**
3. `identity.js:98` `stripHarnessPersona` — 决定宿主原人格是否被移除
4. `core.js:4518`(#55) + `core.js:5655`(#87) — 决定宿主能否"把旧 system 钉住"复活原判定
5. `core.js:4845`(#72) — 决定每轮 system 字段用当前提示而非中途消息

其余 70 余条为权限/兼容/UI，只影响能不能动手。
