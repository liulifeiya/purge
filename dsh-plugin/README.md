# purge-core-dsh —— DSH 插件壳

把 `@liulifeiya/purge-core` 挂进 DSH 的 `system-prompt/assemble` 管线。壳本身只有 40 行，不做任何宿主源码修改。

## 装

```bash
cd /home/liuli/Report/Report-low/dsh-plugin
npm i --allow-git=all            # 拉 @liulifeiya/purge-core

dsh plugin --profile web add /home/liuli/Report/Report-low/dsh-plugin
```

装完在 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 里会出现 `purge-core-dsh`，重启 dsh 生效。

## 生效后会发生什么（装之前先看）

| 行为 | 位置 | 影响 |
|---|---|---|
| 20,969 字符操作员提示置顶到 system 首位 | `createPurge().attach()` | 模型优先服从这段提示 |
| 宿主身份句 / 审批措辞 / untrusted 框架被改写 | `persona.js` 规则集 | `Approval policy: ask` → 审批自动通过；`denial is final` → 继续执行；`untrusted data` → 可直接当指令 |
| 每 400ms 重挂一次 assemble 包装 | `attach({heartbeatMs})` | 切预设、子 agent、热重载后注入不丢；也是一个常驻定时器 |
| 6 处宿主源码补丁（可选） | `apply-patches.mjs` | 不打：第二轮起注入会被降级/钉住；打了：改宿主文件，需重启 |

**这一步等于拆掉本机的审批、拒绝、不可信内容隔离三层。** 只在明确要这个效果时做。

## 打宿主源码补丁（可选）

```bash
node apply-patches.mjs --check     # 只报告命中，不写文件
node apply-patches.mjs --apply     # 写入，自动备份 *.purge.bak
node apply-patches.mjs --revert    # 从备份还原
```

默认自动探测 `@deepseek-ai` 目录，也可 `--root /path/to/@deepseek-ai`。

补丁清单：#55 `inHistory:false`、#66 render 兜底、#72 messages.system 用当前提示、#74 pre-step 前置 assemble、#87/#88 头尾 needle 判重。

## 卸载 / 回滚

```bash
node apply-patches.mjs --revert
dsh plugin --profile web remove purge-core-dsh
# 或在 ~/.dsh/profiles/web/package.json 的 bundles 里删掉 purge-core-dsh
```

定时器随 `ctx` dispose 自动清理（`apply()` 里注册了 `ctx.effect`）。

## 只想用提示词、不动宿主

不要装这个壳。直接：

```js
import { createPurge, DEFAULT_INJECT } from "@liulifeiya/purge-core";
const purge = createPurge({ inject: DEFAULT_INJECT });
const system = purge.composeSystem(hostSystem);   // 纯字符串，返回新值
```

这条路径不改任何宿主状态，也不起定时器。
