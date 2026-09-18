**始终使用中文与我沟通**

## 核心约束清单

> **红线（MUST NOT）**：
> - 未经用户确认，**禁止回滚代码、删除分支**
> - 未经用户允许，**禁止擅自 checkout 任何文件**
> - **禁止直接修改 `node_modules/` 下任何三方依赖的源码**（`pnpm install` 会被覆盖，CI/其他成员环境无法复现）
> - **禁止使用 playwright、chromium 等 Web 自动化测试工具**（开发环
境为 WSL，未经用户明确允许，不得调用）
> - **禁止自动生成前端测试用例（含组件测试、E2E 测试、单测等)、后端测试用例，除非用户明确要求**

> **计划/报告输出**：
> - 计划文档 → `docs/plans/YYYYMMDD_简要描述.md`
> - 报告文档 → `docs/reports/YYYYMMDD_简要描述.md`

---

## 计划、实施与报告

**触发词**：`制定计划`、`生成计划`、`创建计划`、`代码实现` -> 让用
户选择是否使用 **analyzing-code-then-planning** skill

**触发词**：`实施计划`、`执行计划`、`开始执行`、`确认`、`执行` ->
让用户选择是否使用skill(二选一： **executing-plans-with-standards** 、**subagent-driven-plan-execution**)


**触发词**：`评估`、`审查`、`检查`、`分析`、`review` → 生成报告到 `docs/reports/`

---

## 强制任务

### 实施计划完整性（MUST）

每个实施计划文档开头**必须**包含元信息，并跟踪计划状态：

```markdown
---
创建时间: YYYY-MM-DD HH:MM
状态: [待开始|进行中|已完成|已暂停]
---
```

计划执行步骤：
1. 更新设计文档（仅当涉及架构/API/DB变更时）
2. 清理无用、重复代码
3. 执行任务
4. 更新进度表与元信息状态为"已完成"

### 状态同步（MUST）

- 开始执行：`待开始` → `进行中`
- 暂停执行：`进行中` → `已暂停`
- 恢复执行：`已暂停` → `进行中`
- 全部完成：`进行中` → `已完成`

### 自我进化（SKILL: proactive-self-improving-agent-v2）

**触发词**：`总结、学习、进化、提交、commit → 使用 **`proactive-self-improving-agent-v2`** skill 自动捕获经验并安全进化。

- 命令失败 → 记录到 ERRORS
- 用户纠正 → 记录到 LEARNINGS
- 任务完成 → 回顾有新经验则记入
- 同一经验 ≥3 次 → 晋升到 AGENTS.md 或 TOOLS.md

## 联网搜索

当需要扩展外部知识、查询实时资讯或验证文档外的信息时，使用 **mmx**
命令进行联网搜索（基于 MiniMax 检索能力）。

> 完整能力列表与参数见 `mmx -h`；各子命令帮助见 `mmx <resource> <command> --help`。

**核心命令**：

```bash
# 联网搜索（返回最多 10 条结果，不支持分页，需细化 --q 调整查询）
mmx search query --q "<查询词>"

# 以 JSON 格式输出，便于程序化处理
mmx search query --q "<查询词>" --output json

# 非交互/CI 模式（禁用交互式提示）
mmx search query --q "<查询词>" --non-interactive
```

**说明**：
- 搜索结果单次最多 10 条，且不支持分页；如需不同结果，应细化或调整
`--q` 查询词。
- 其余常用资源：`text`（文本生成/对话）、`image`（图像生成）、`vision`（图像理解）、`speech`（语音合成）等，均可通过 `mmx -h` 查看。

# DeepSeek Harness (dsh) 插件开发

> 详细文档（核心包 / 事件 / 轮次流程 / seam / 扩展点速查）：[`wiki/guide.md`](./wiki/guide.md)

## 三步创建插件

### 1. 写插件源码

```ts
// scratch-plugin/src/my-plugin.ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-plugin'

export function apply(ctx: Context) {
  // 通过 ctx 注册能力
  ctx.on('ready', () => console.log('plugin ready'))
}
```

### 2. 用 patch 挂载（绝对路径）

```yaml
# scratch-plugin/cordis.yml
- insert:
    - id: my-plugin
      name: '/absolute/path/to/deepseek-harness/scratch-plugin/src/my-plugin.ts'
```

### 3. 启动并验证

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml   # 启动 Web UI
dsh --profile web --dump-config                    # 打印实际配置树
```

## 关键约束

- **`name` 必须为绝对路径**（patch 不改变 loader 的 profile 目录）
- **依赖显式声明**：`export const inject = ['tools', 'llm']`
- **优先自动清理**：通过 `ctx` 注册的一切副作用卸载时撤销；外部资源用 `ctx.effect(() => () => cleanup)`
- **patch 按 `id` 替换整个 `config`**

## 速查

| 想做的事 | 在哪里做 |
|---|---|
| 加模型 | `ctx.llm` |
| 加工具 | `ctx.tools` |
| 加用户命令 | `ctx.commands` |
| 拦截/改写提示词或工具 | 监听 `agent/pre-step`、`tools/pre-execute` 等 waterfall 事件 |
| 终止轮次 | `agent/turn-stopping` |
| fork 会话 | `ctx.sessions.fork(source, boundary?, childSessionId?)` |
| 单 agent 作用域 | 用 `agent.ctx`，不用全局 `ctx` |

完整速查表与扩展点索引见 [`wiki/guide.md`](./wiki/guide.md)。
