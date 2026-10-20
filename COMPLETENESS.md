# 破甲主体完整性核对（Complete / Excluded）

对照对象：`dsh-purge` v1.1.71（`lib/` 共 20,637 行）
结论：**破甲主体 6 层全部在包内**；技能包、预设、桌面/更新/卸载/回退等非主体代码**未拉取**（按要求排除）。

## 一、主体 6 层覆盖情况

| # | 层 | 原实现 | 包内实现 | 状态 |
|---|---|---|---|---|
| 1 | 载荷 | `~/.dsh/prompt-inject.md`（25,128 B / 225 行） | `src/default-inject.js`（`DEFAULT_INJECT`，20,969 字符） | ✅ 全文内置 |
| 2 | 格式层 | `identity.js:23-72` `escapeDshInterpolation` / `normalizeChatmlLayout` / `peelChatmlEnvelope` / `stripChatmlTags` | `src/chatml.js`（另加 `wrapChatml`） | ✅ 全量 |
| 3 | 置顶层 | `identity.js:295-370` `injectMatchers` / `leadWithInject`；`901-981` `rewritePromptAssembly` | `src/rewrite.js`（`injectNeedles` / `leadWithInject` / `rewritePromptAssembly`） | ✅ 全量 |
| 4 | 身份层 | `identity.js:98-182` `stripHarnessPersona`；`200-252` `overlayOfficialIdentity` | `src/persona.js`（40+ 条规则）+ `src/overlay.js`（prefix/suffix 处理） | ✅ 全量 |
| 5 | 保活层 | `identity.js:788-899` `installAssembleGuard`；`index.js:747-860` 事件钩子 + 400ms 心跳 + `prepareAssemble` | `src/assemble-guard.js` + `src/attach.js`（`createPurge().attach()`） | ✅ 全量 |
| 6 | 宿主层 | `core.js:5580-5700` 拼接代码块；patch #55/#66/#72/#74/#87/#88 | `src/host.js`（`hostSnippet`）+ `src/host-patches.js`（6 条 patch 原文 + 执行器） | ✅ 全量 |

### 逐层“为什么算主体”

1. **载荷**：没有它，其余 5 层挂上去也是空壳。
2. **格式层**：`system:` 与 `<project_instructions>` 不拆行，宿主按半截标签解析，整段注入被丢弃——注入“存在但无效”的根因。
3. **置顶层**：决定注入排在 system 的第 0 位，以及重复副本能否被 needle 抠掉。
4. **身份层**：宿主自带的厂商身份句、审批/拒答措辞会把注入顶回去，必须逐句剥离。
5. **保活层**：DI 容器每次读服务属性都新建 Proxy，切预设/子代理/session 边界都会把包装回滚；这层决定“注入活不活得过第二轮”。
6. **宿主层**：宿主自身逻辑（`inHistory`、messages.system、pre-step assemble）会把置顶结果覆盖或降级，必须改源码锁住。

## 二、明确未拉取（非主体）

| 内容 | 原位置 | 排除理由 |
|---|---|---|
| 红队技能包 22 个 `.md` | `skills/redteam/*` | 任务执行手册，与破甲机制无关 |
| 红队预设 | `presets/redteam/*` | 多智能体调度配置 |
| 能力选用协议 | `lib/capability-protocol.js` | 任务执行约定（先读 skill/MCP 再动手），非注入机制 |
| 工作区规则注入 | `lib/rules.js` | 注入源扩展（读 AGENTS.md），机制已有 `inject` 参数覆盖 |
| 桌面端 | `lib/desktop.js`(1778)、`restart-desktop.js`(472)、`extract-asar.js`(462) | 与注入无关 |
| 更新/安装/卸载 | `update.js`(1120)、`official-update.js`、`uninstall.js`、`install*` | 分发逻辑 |
| 回退/UI/日志 | `rewind.js`(645)、`web.js`、`hide-console.js`、`table-*.js`、`surface.js` | 界面与运维 |
| 其余 70 余条 patch | `core.js` `PATCHES/CODE/ENGINE/NEW_TOOL` | 审批/沙箱/文件围栏/兼容，决定“能不能动手”，不决定“肯不肯说” |

## 三、与参考对象的对齐

以 `YuJunZhiXue/dsh-purge` v1.1.71 为基准逐函数对照，本轮修正 4 处不统一（loose 匹配、overlay 步骤、workspace baseline、两条 persona 规则），详见 [ALIGNMENT.md](./ALIGNMENT.md)。

## 四、可验证

```bash
npm test          # 19 项：置顶、去重、剥身份、ChatML、overlay、patch 幂等、保活、attach/detach
npm pack          # 产物仅含 src/ + examples/ + test/ + README + LICENSE
```

## 五、源码出处

- 插件根：`~/.dsh/profiles/web/node_modules/dsh-purge`（v1.1.71，sha256 见 `purge-core-extract/EXTRACT-INDEX.md`）
- 上游：https://github.com/YuJunZhiXue/dsh-purge
- 本仓库保留 `purge-core-extract/` 作为原始提取证据（含宿主 patch 落点行号与 55 个 `.dshpurge.bak` 清单）。
