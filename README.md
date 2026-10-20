# @liulifeiya/purge-core

从 [dsh-purge](https://github.com/YuJunZhiXue/dsh-purge) v1.1.71 提取的**提示词注入内核**，抽掉宿主文件系统、预设、红队逻辑后剩下的可复用部分：

1. **置顶** —— 把操作员提示词作为 `order: -100000` 的 section 插到装配结果最前，并对别处残留的副本做首尾 needle 去重。
2. **剥身份** —— 删掉宿主/厂商写进 system 的身份句与拒答措辞（DeepSeek Harness、Claude Code、approval policy、untrusted data 等 40+ 条规则）。
3. **保活** —— 用 `defineProperty` 包住 `systemPrompt.assemble()`，宿主每次重建代理都会自动重包；`dispose` 故意 noop，避免 session 边界/预设切换把注入回滚掉。

不含任何模型权重或网络逻辑，纯字符串与装配管线操作。

## 安装

```bash
# 直接作为 git 依赖
npm i github:liulifeiya/purge

# 或锁版本
npm i git+https://github.com/liulifeiya/purge.git#v0.1.0
```

零运行时依赖，要求 Node ≥ 18（ESM）。

## 用法一：任意 LLM 客户端（字符串）

```js
import { createPurge } from "@liulifeiya/purge-core";

const purge = createPurge({ inject: fs.readFileSync("./operator.md", "utf8") });

const body = {
  model: "deepseek-chat",
  messages: [
    { role: "system", content: purge.composeSystem(originalSystem) },
    { role: "user", content: userInput },
  ],
};
```

`composeSystem()` 会先剥掉 `originalSystem` 里的身份/审批/untrusted 措辞，再把 inject 顶到最前；若检测到已经钉过（尾部 96 字节命中）则直接返回，不会重复叠加。

## 用法二：装配式宿主（sections 数组）

```js
import { rewritePromptAssembly } from "@liulifeiya/purge-core";

const assembly = await host.systemPrompt.assemble(ctx);
const pinned = rewritePromptAssembly(assembly, {
  inject,
  sectionName: "dsh-purge",
  order: -100000,
  stripPersona: true,
  dropNames: ["harness:identity"],
});
// pinned.sections[0] === { name: "dsh-purge", text: inject, order: -100000, interpolate: false }
```

原输入对象不被修改，返回新对象。

## 用法三：挂到 cordis / DSH 宿主

```js
import { createPurge } from "@liulifeiya/purge-core";

export function apply(ctx, config) {
  const purge = createPurge({ inject: config.inject }).attach(ctx);
  purge.publish("__purgeHungPrompt");   // 宿主侧 patch 代码可读取
  return purge;
}
```

`attach()` 做三件事：

| 动作 | 说明 |
|---|---|
| `installAssembleGuard(ctx.systemPrompt, rewrite)` | 包住 `assemble`，宿主换实现时 setter 自动重包 |
| `ctx.on("system-prompt/assemble", handler, {global:true, prepend:true})` | 抢在 waterfall 之前改写（无 `ctx.on` 时自动跳过） |
| `setInterval(tick, 400)` | 幂等重挂，覆盖换预设 / subagent fork / 热重载（`heartbeat:false` 可关） |

## API

| 导出 | 作用 |
|---|---|
| `createPurge(opts)` | 返回 `{ text, setText, append, composeSystem, composeSections, installOn, attach, detach, publish, status }` |
| `installAssembleGuard(prompt, rewrite)` | 包装 `assemble()`，幂等，返回 noop disposer |
| `rewritePromptAssembly(assembly, opts)` | 整体改写：删身份段 + 置顶 + 兜底重插 |
| `leadWithInject(sections, inject, opts)` | 只做置顶与去重 |
| `composeSystem(system, inject, opts)` | 字符串路径 |
| `stripHarnessPersona(text, opts)` | 身份/措辞剥离，支持 `extraRules` |
| `injectNeedles(text)` | 生成 head 80 / tail 96 判重 needle |
| `hangPrompt` / `hungPrompt` | 进程内钉子 |
| `installHostGlobal(name)` | 挂 `globalThis[name]` 供宿主代码读取 |
| `hostSnippet({target})` | 生成可粘进宿主源码的拼接片段（头尾双 needle 判定） |

## 设计要点（踩过的坑）

- **dispose 必须是 noop**：DI 容器在 session 边界、子作用域结束、预设切换时都会跑 effect cleanup。真执行 dispose 会把 rewrite 回滚成 `null`，表现就是"任务到一半突然开始拒答"。
- **幂等靠 Symbol + 标记**：容器每次读服务属性都新建 Proxy，不判重就会层层套娃直到栈溢出。
- **注入失败不能抛**：内层 `assemble` 抛错时返回空装配，而不是让整条 waterfall 崩掉。
- **判重用首尾 needle**，不哈希全文：宿主可能插入变量插值或改换行，全文比对永远不命中 → 每次重挂都多一份。

## 测试

```bash
npm test
# 11 项：置顶、去重、剥身份、幂等包装、宿主换实现、异常兜底、attach/detach
```

## 许可

MIT。核心逻辑源自 dsh-purge（作者 YuJunZhiXue），按其署名要求保留来源说明。
