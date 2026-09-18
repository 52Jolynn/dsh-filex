# DeepSeek Harness (dsh) 插件开发指南（完整版）

> 本文档基于 [dsh 开发基础](https://deepseek-harness.github.io/deepseek-harness/develop/basic/) 与
> [dsh 架构参考](https://deepseek-harness.github.io/deepseek-harness/reference/) 提炼，
> 面向需要为 dsh 编写或扩展插件的开发者。
>
> 📌 想看概要与索引？回到 [AGENTS.md](../AGENTS.md)。

---

## 1. 核心心智模型

- **dsh 是 Cordis 框架之上的产品**，所有功能（模型适配器、工具注册表、会话日志、agent loop）都是插件。
- **不存在需要打补丁的特权内核**：扩展 dsh 的方式是把插件挂载到其他插件旁边；注册都是副作用，会在插件卸载时自动撤销。
- **运行时是一棵插件树**，由启动时按序叠加的多层组合而成（profile / bundle / patch）。

> 改动 `packages/` 之前，先读懂本文；尚未了解 Cordis 时，先看入门或教程。

---

## 2. 插件是什么

一个 dsh 插件 = **一个 TypeScript 模块**，框架加载时调用其 `apply`，传入 `ctx`（Cordis 上下文）。所有能力都通过 `ctx` 注册：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-plugin'

export function apply(ctx: Context) {
  // 通过 ctx 注册事件、工具、命令等能力
}
```

---

## 3. 最小插件上手流程

### 3.1 在仓库根目录创建临时项目
```sh
mkdir -p scratch-plugin/src
```

### 3.2 编写插件源码 `scratch-plugin/src/my-plugin.ts`
```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-plugin'

export function apply(ctx: Context) {
  // 依赖就绪后才执行到此处
  console.log('[hello-plugin] plugin loaded!')
}
```

### 3.3 用 `cordis.yml` 覆盖层挂载插件
绝对路径替换后写入 `scratch-plugin/cordis.yml`：

```yaml
- insert:
    - id: hello
      name: '/absolute/path/to/deepseek-harness/scratch-plugin/src/my-plugin.ts'
```

> ⚠️ **插件路径必须是绝对路径**。patch 文件只贡献配置，不会改变 loader 解析模块路径时使用的 profile 目录。

### 3.4 启动 Web UI 并应用覆盖层
```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```
访问 <http://127.0.0.1:3080>，启动期终端会打印 `[hello-plugin] plugin loaded!`。

### 3.5 查看实际启动的配置树
```sh
dsh --profile web --dump-config
```
打印出的任何条目都可被自己的 patch 替换。

---

## 4. 插件的三种形态

按需选择，**大多数情况下函数形式就够了**；需要向其他插件提供服务时用类形式。

### 4.1 函数形式（默认）
```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-plugin'

export function apply(ctx: Context) {
  // ...
}
```

### 4.2 对象形式
```ts
import type { Context } from '@deepseek-ai/cordis'

export default {
  name: 'my-plugin',
  inject: ['tools'],
  apply(ctx: Context) {
    // ...
  },
}
```

### 4.3 类形式（暴露 `Service`，供其它插件注入）
```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export default class MyService extends Service {
  static inject = ['tools']

  constructor(ctx: Context) {
    super(ctx, 'myService')
    // 在构造器中执行同步初始化
  }
}
```

---

## 5. 依赖声明：`inject`

需要使用其他服务（如 `tools`、`llm`）时，用 `inject` 数组声明：

```ts
export const name = 'my-tool-plugin'
export const inject = ['tools']

export function apply(ctx: Context) {
  // ctx.tools 在此就绪
  ctx.tools.register(/* ... */)
}
```

框架会保证所声明依赖就绪后才调用 `apply`，所以**无需自行做空判断或等待**。

---

## 6. 自动清理与手动清理

### 6.1 自动清理（首选）
通过 `ctx` 注册的任何东西——事件监听、工具、定时器——在插件卸载时**都会被自动撤销**。
不需要手动 `removeListener` 或 `clearInterval`。

### 6.2 手动清理（持有"ctx 之外"的资源）
例如一个网络连接：用 `ctx.effect()` 返回清理函数。

```ts
export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => console.log('heartbeat'), 5000)
    // 返回的函数会在插件卸载时执行
    return () => clearInterval(timer)
  })
}
```

---

## 7. Profile 与组合包（装配模型）

运行中的 dsh 是一棵**按序叠加**的插件树。

| 概念 | 含义 |
|---|---|
| **profile** | 存放在 Harness home 中的具名组装；列出组合包、树外插件、自己的 `cordis.patch.yml` |
| **组合包 (bundle)** | Cordis 配置项 + 挂载代码的分发格式；可被上层 patch 覆盖 |
| **`dsh.profile`** | 在 `package.json` 中声明 profile 包含哪些组合包 |
| **`dsh.bundle`** | 在 `package.json` 中声明组合包的 patch 文件 |

### 7.1 三个核心组合包
- **`dsh-base`**：每个 profile 的第一层——模型适配器、工具、持久化、沙箱与审批策略、设置、凭据、遥测。
- **`dsh-web-app`**：在 `dsh-base` 之上增加浏览器应用。
- **`dsh-headless`**：在 `dsh-base` 之上增加一次性运行器（无服务器）。

### 7.2 叠加顺序（从底向上）
1. 空条目列表
2. 按 profile 列出的顺序应用每个组合包
3. profile 自己的 `cordis.patch.yml`
4. home 级 patch
5. 任意 `--patch` overlay

### 7.3 patch 语义
- 一条 patch 按 `id` 定位某个条目，**替换其整个 `config`**，或插入新条目。
- 任意被 dump 出的条目都可由自己的 patch 替换。

---

## 8. 核心包与 `ctx` 键

下列包向 Cordis 树贡献内容，是大多数插件需要对接的入口：

| 包 | 职责 | ctx 键 |
|---|---|---|
| `core/session` | 仅追加的 `SessionEvent` 日志与内存存储 | `ctx.sessions` |
| `core/system-prompt` | 提示词片段与工具 schema 的组装 | `ctx.systemPrompt` |
| `core/tools` | 作用域化的工具注册表 + 带把关的执行流水线 | `ctx.tools` |
| `core/agent` | `Agent` 接口、活跃 agent 注册表、`agent/*` 事件 | `ctx.agents` |
| `core/agent-loop` | 实现 `Agent` 接口的默认驱动器 | `ctx.agentLoop` |
| `core/scope` | 按 agent 划分作用域的注册原语库，无 ctx 键 | — |
| `llm/llm` | 消息与流式词汇表、适配器 seam | `ctx.llm` |

> 若要把注册项限定到单个 agent，使用该 agent 的 `agent.ctx`，而非全局 `ctx`。

---

## 9. 事件：最重要的扩展点

> **选对事件域是大多数改动的第一个决定。**

| 事件域 | 用途 | 何时使用 |
|---|---|---|
| **会话事件**（`SessionEventMap`） | 持久事实，追加到日志并通过 `session/event` 广播 | 当某个事实在**重新加载后仍要存在** |
| **Agent 事件**（`agent/*`） | 携带活跃 Agent（inbox、步骤、状态、请求、验证、续跑） | 要**观察或拦截进行中的工作** |
| **能力事件**（`fs/*`、`tools/*`、`telemetry/*` 等） | 无需导入循环即可向某个 seam 附加策略和适配器 | **跨插件解耦**地扩展某项能力 |

### 9.1 Waterfall 与 serial 事件
- **Waterfall 事件**（监听器必须 `next()` 才能委托下去）：
  `agent/pre-step`、`agent/request`、`llm/stream`、`tools/pre-execute`、`tools/execute`、`tools/post-execute`
- **Serial 事件**（无 `next()`）：
  `agent/turn-stopping` —— 调用它就停止轮次。

---

## 10. 轮次与步骤流程

> **一个步骤 = 一次模型请求 + 它调用的工具。**
> **一个轮次 = 零个或多个步骤**：在领取首条输入前打开，不再欠工作时关闭。

```
turn/start
  ├─ claim next-step input + one queued message
  ├─ assemble prompt sections + tool schemas
  └─ agent/pre-step  ──reject──► 关闭无步骤的轮次
        │
        ▼ enter(messages)
step/start
  ├─ append entered messages as user/message
  ├─ derive model history from log
  ├─ agent/request → llm/stream → assistant/chunk* → assistant/message
  └─ tool/call* → tools/pre-execute → tools/execute → tools/post-execute → tool/result*
step/end
  └─ 若仍欠工作或又有 next-step 输入 → claim → 下一步
                  └─ agent/turn-stopping → 终止轮次
turn/end
```

要点：
- `turn/*`、`step/*`、`user/message`、`assistant/*`、`tool/*` 是**持久会话事件**。
- `agent/pre-step` 决定模型看到什么；监听器可改写或拒绝消息。
- 输入通过同一个 **inbox** 到达驱动器：即时消息立即唤醒；注入的上下文留在 inbox 中，直到另一条消息将其唤醒。

---

## 11. 会话日志 = 模型上下文的真源

- `deriveMessages()` 从日志投影出模型历史。
- 原始 `assistant/chunk` 事件保证回放与 UI 保真。
- **模型可见即已记录**：抵达模型请求的一切都必须能从日志重建（运行时不变量）。
- 派生自事件流的能力：fork、恢复、transcript、遥测、持久化。

> ⚠️ 新增一项模型可见输入 = **新增一个会话事件**：扩展 `SessionEventMap` 并让日志渲染它。

---

## 12. 能力 seam（可替换能力的最小设计单元）

一个 seam = 三种角色，必须**一并设计**：

1. **Service Definition**：声明接口
2. **Service Provider**：实现该接口
3. **Consumer**：使用该能力（通常是面向模型的工具）

> 一个包可以同时承担多个角色，但单一角色本身不是 seam。

### seam 的威力
替换一个提供方就能改变整个产品。例如把本地文件系统/进程提供方指向远程沙箱，就把 Bash、PTY、LSP **一并**搬过去了——无需提供方专用 fork。subagent 提供方同理：从新建子 agent，到把一个轮次委派给另一个产品。

---

## 13. 新行为归属速查表

> 把新行为附加到**已有文档记录的扩展点**，不要绕开。改动循环本身时本表随之更新。

| 想做的事 | 在哪里做 |
|---|---|
| 添加模型提供方 | 在 `ctx.llm` 上注册适配器 |
| 添加面向模型的能力 | 在 `ctx.tools` 上注册；其 schema 加入提示词组装 |
| 让某会话拥有不同能力集合 | 组装一个 agent preset；其中的服务行需要 `isolate` realm |
| 添加 shell 执行 | 注册 `ctx.shell` 后端；本地后端通过 `ctx.subprocess` spawn 进程 |
| 添加持久化终端执行 | 注册 `ctx.terminals` 后端和 `dsh-tool-terminal` |
| 添加用户命令 | 在 `ctx.commands` 上注册（无需模型轮次即可分派） |
| 添加后台工作 | 在 `ctx.jobs` 上注册；`job_*` 工具负责收集或停止 |
| 添加文件系统访问/策略 | 注册 `ctx.fs` 提供方，或监听 `fs/*` 事件 |
| 限制所启动的进程 | 使用 `ctx.sandbox` 后端；消费方在启动进程前包装 argv |
| 拦截请求、工具或轮次 | 使用相应的 `agent/*` 或 `tools/*` 事件；`agent/turn-stopping` 停止轮次 |
| 添加模型可见上下文 | 调用 `agent.inject()`；落到下一次获准的请求中 |
| 添加 UI/编辑器集成 | 驱动 `ctx.agents` 并从 `session/event` 渲染 |
| 添加 Web Client Chat 节点 | 注册 `ConversationNodeDefinition` + keyed renderer |
| 添加持久会话状态 | 扩展 `SessionEventMap`；从日志渲染与回放 |
| 生成会话标题 | 注册唯一的 `ctx.sessionTitle` 提供方 |
| 管理同会话目标 | 使用 `ctx.goals`；通过 `agent/*` 续跑 |
| Fork 活跃会话 | `ctx.sessions.fork(source, boundary?, childSessionId?)` |
| 把注册项限定到单个 agent | 使用该 agent 的 `agent.ctx` |

---

## 14. 实操原则与红线

1. **最小可用原则**：先用函数形式；只在必须暴露服务给其它插件时才升级到类形式（`Service`）。
2. **依赖声明必须显式**：用 `inject`，不要假设加载顺序。
3. **优先自动清理**：通过 `ctx` 注册一切副作用；只有持有 ctx 之外的资源时再用 `ctx.effect()`。
4. **绝对路径注册**：patch 里的 `name` 必须为绝对路径，否则 loader 解析不到。
5. **改 `packages/` 之前先读架构**：避免破坏 profile 叠加或事件流语义。
6. **模型可见输入 ⇔ 会话事件**：二者在运行时不变量上互相约束，新增时**成对**扩展。
7. **patch 替换的是整个 config**：用 `id` 精准定位，避免误伤上层条目。
8. **使用 `--dump-config` 验证**：任何改完后都应 dump 一遍，看配置树是否符合预期。

---

## 15. 进一步阅读

- [dsh 开发基础](https://deepseek-harness.github.io/deepseek-harness/develop/basic/) —— 第一个插件、依赖、清理
- [dsh 架构参考](https://deepseek-harness.github.io/deepseek-harness/reference/) —— 包、ctx、事件、轮次流程、seam
- **下一步建议**：开发一个工具（了解工具定义 DSL）、插件配置（让插件接受用户配置）、Cordis 框架教程（底层插件框架动手实践）
