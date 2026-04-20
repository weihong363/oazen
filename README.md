# Oazen

**A local memory runtime for coding agents.**

**面向代码代理的本地记忆运行时。**

<details>
<summary>🌐 Language / 语言切换</summary>

- [English](#english)
- [中文](#chinese)

</details>

---

<a id="english"></a>

# English Version

Oazen helps coding agents remember the right things, forget the wrong things, and keep context useful over time.

It is designed to be:

* local-first
* low-friction
* layered
* inspectable
* safe by default

---

## Why Oazen

Coding agents often:

* forget useful context
* repeat mistakes
* mix unrelated project knowledge together
* make it hard to manage long-term memory cleanly

Oazen acts as an external memory layer that can:

* recall relevant memory before a task
* write back useful learnings after a task
* merge similar memories
* compress memory into denser summaries
* decay or forget stale information

---

## Current Features

* CLI-based local memory runtime
* memory writeback from session logs
* recall before task execution
* scope-aware recall and writeback
* layered memory structure
* inbox / session / fact / core lifecycle
* memory merge and deduplication
* memory compression
* memory decay and forgetting
* review / promote / reject flow
* sensitive-data screening before persistence
* adapter-style integration path for coding agents
* fixture-based benchmark runner for recall quality and token savings

---

## Minimal Workflow

```bash
oazen recall "fix parser retries" --format codex
oazen writeback --file sessions/run.txt --cwd /path/to/project
oazen review
oazen approve <memory-id>
oazen promote <memory-id>
```

## Benchmark Workflow

Use the built-in fixture benchmark to validate project precision, contamination, and token savings:

```bash
npm run test:benchmark
npm run test:benchmark:strict
```

See [docs/BENCHMARKS.md](docs/BENCHMARKS.md) for metric definitions and benchmark design.

Writeback scope defaults to `auto`, which resolves from the working directory:

* `project`: nearest `package.json`
* `repo`: nearest `.git`
* `global`: fallback when no project/repo root is found

---

## Memory Model

Oazen uses a layered memory system:

* **inbox**: raw extracted candidates, not yet trusted
* **session**: short-term working memory
* **fact**: stable and reusable knowledge
* **core**: rare, durable, high-confidence memory

Memories can move through this lifecycle:

`inbox -> session -> fact -> core`

Or they can be:

* rejected
* archived
* compressed into a new memory
* forgotten over time

---

## Roadmap

### Phase 1: Foundation

Make Oazen reliable:

* stabilize the CLI
* finish recall / writeback / review / promote / reject
* add merge, compress, forget
* support global / project / repo scope
* ship the first Codex adapter workflow

### Phase 2: Multi-Agent Support

Make Oazen multi-agent aware:

* agent identity
* shared vs private memory
* handoff memory
* adapters for Codex, Claude Code, and more

### Phase 3: Scale & Safety

Make Oazen safe at scale:

* sensitive information masking
* project isolation
* conflict detection
* trust levels
* better recall ranking

### Beyond

Evolve Oazen into a reusable memory runtime platform:

* richer adapters
* optional desktop shell
* agent-driven UI support
* advanced compression
* optional semantic retrieval

---

## Principles

* Keep the core small.
* Keep interaction minimal.
* Keep memory inspectable.
* Keep project boundaries clear.
* Keep sensitive data protected.
* Avoid unnecessary UI and configuration.

---

## Vision

Oazen is not trying to be a giant agent platform.

It is trying to be the quiet, reliable memory layer underneath agent workflows.

> remember what matters, forget what does not, and stay out of the way.

---

## Comparison

| Product            | Memory mechanism (short)                                                                                                                                                                                              | Typical storage / surface         | Compared with Oazen                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Codex**          | When Memories are enabled, eligible prior threads are turned into local memory files; `AGENTS.md` is read before work and layered from global to project scope. ([OpenAI开发者][1])                                      | `~/.codex/memories/`, `AGENTS.md` | Oazen only selectively recalls the current project’s memories instead of automatically turning history into a larger memory pool. |
| **Kiro**           | Built around steering files; foundation steering files are included by default in every interaction, with workspace/global steering support, and `AGENTS.md` is picked up automatically. ([Kiro][2])                  | Steering files, `AGENTS.md`       | Oazen acts more like a project-memory filter: it only brings current-project memories into context.                               |
| **Cursor**         | Persistent context is mainly delivered through Project / Team / User Rules plus `AGENTS.md`; rules are treated as static, always-on project instructions. ([Cursor][3])                                               | Rules, `AGENTS.md`                | Oazen does not define rules; it retrieves and compresses memory within project boundaries.                                        |
| **GitHub Copilot** | Has repository-level persistent memory; it is used by Copilot cloud agent, code review, and Copilot CLI; repo owners can view/delete memories, and stale memories are auto-removed. ([GitHub Docs][4])                | Repo memory, custom instructions  | Oazen is narrower: it focuses on the current project rather than a broader repo memory layer.                                     |
| **Claude Code**    | `CLAUDE.md`, `CLAUDE.local.md`, and rules files load in the current session; `auto memory` can be toggled on/off and edited or deleted. Skills are a separate layer and load only when needed. ([Claude API Docs][5]) | `CLAUDE.md`, auto memory, Skills  | Oazen is closer to a project-scoped recall runtime than a chat assistant that accumulates session memory.                         |
| **TRAE**           | Generated memories appear in the chat flow; it also has `Rules & Skills` and supports both Global and Project skills. ([TRAE][6])                                                                                     | Chat memories, Rules, Skills      | Oazen does not surface chat memories; it serves as an external, project-scoped recall layer.                                      |

[1]: https://developers.openai.com/codex/memories "Memories – Codex | OpenAI Developers"
[2]: https://kiro.dev/docs/steering/ "Steering - IDE - Docs - Kiro"
[3]: https://cursor.com/docs/rules?utm_source=chatgpt.com "Rules | Cursor Docs"
[4]: https://docs.github.com/en/copilot/concepts/agents/copilot-memory "About agentic memory for GitHub Copilot - GitHub Docs"
[5]: https://docs.anthropic.com/en/docs/claude-code/memory?utm_source=chatgpt.com "How Claude remembers your project - Claude Code Docs"
[6]: https://docs.trae.ai/ide/memories?utm_source=chatgpt.com "Memories - Documentation"

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<a id="chinese"></a>

# 中文版本

**面向代码代理的本地记忆运行时。**

Oazen是帮助代码代理记住有用的内容、遗忘无关的信息,并让上下文长期保持有效。

它的设计理念是:

* 本地优先
* 低摩擦
* 分层结构
* 可审查
* 默认安全

---

## 为什么选择Oazen

代码代理经常面临以下问题:

* 遗忘有用的上下文
* 重复犯错
* 将不相关的项目知识混在一起
* 难以清晰地管理长期记忆

Oazen作为外部记忆层,可以:

* 在任务执行前回忆相关记忆
* 在任务完成后回写有价值的经验
* 合并相似的记忆
* 将记忆压缩为更紧凑的摘要
* 让过时的信息衰减或遗忘

---

## 当前功能

* 基于 CLI 的本地记忆运行时
* 从会话日志回写记忆
* 任务执行前的记忆召回
* 感知作用域的召回和回写
* 分层记忆结构
* inbox / session / fact / core 生命周期
* 记忆合并与去重
* 记忆压缩
* 记忆衰减与遗忘
* 审查 / 提升 / 拒绝流程
* 持久化前的敏感数据筛查
* 适配器风格的代码代理集成路径
* 基于测试用例的基准测试运行器,用于评估召回质量和 Token 节省

---

## 最小工作流

```
oazen recall "修复解析器重试逻辑" --format codex
oazen writeback --file sessions/run.txt --cwd /path/to/project
oazen review
oazen approve <memory-id>
oazen promote <memory-id>
```

## 基准测试工作流

使用内置的测试用例基准测试来验证项目精度、污染率和 Token 节省:

```
npm run test:benchmark
npm run test:benchmark:strict
```

查看 [docs/BENCHMARKS.md](docs/BENCHMARKS.md) 了解指标定义和基准测试设计。

回写作用域默认为 `auto`,根据工作目录自动解析:

* `project`: 最近的 `package.json` 所在目录
* `repo`: 最近的 `.git` 所在目录
* `global`: 当找不到项目/仓库根目录时的回退选项

---

## 记忆模型

Oazen采用分层记忆系统:

* **inbox**: 原始提取的候选记忆,尚未被信任
* **session**: 短期工作记忆
* **fact**: 稳定且可复用的知识
* **core**: 罕见、持久、高置信度的记忆

记忆可以在以下生命周期中流转:

`inbox -> session -> fact -> core`

或者被:

* 拒绝
* 归档
* 压缩为新记忆
* 随时间遗忘

---

## 路线图

### 阶段一：基础建设

让Oazen变得可靠:

* 稳定 CLI
* 完成 recall / writeback / review / promote / reject
* 添加 merge、compress、forget
* 支持 global / project / repo 作用域
* 发布首个 Codex 适配器工作流

### 阶段二：多代理支持

让Oazen支持多代理:

* 代理身份
* 共享与私有记忆
* 交接记忆
* 适配 Codex、Claude Code 等更多代理

### 阶段三：扩展与安全

让Oazen在大规模下保持安全:

* 敏感信息脱敏
* 项目隔离
* 冲突检测
* 信任级别
* 更好的召回排序

### 未来

将Oazen演进为可复用的记忆运行时平台:

* 更丰富的适配器
* 可选的桌面客户端
* 代理驱动的 UI 支持
* 高级压缩
* 可选的语义检索

---

## 设计原则

* 保持核心精简
* 保持交互最小化
* 保持记忆可审查
* 保持项目边界清晰
* 保护敏感数据
* 避免不必要的 UI 和配置

---

## 愿景

Oazen并不想成为庞大的代理平台。

它致力于成为代理工作流之下无侵入、可靠的记忆层。

> 记住重要的,忘掉无关的,让工作更丝滑。

---

## 产品对比

| 产品                 | 记忆机制（精简）                                                                                                                                | 典型载体                             | 和 Oazen 的对比                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------- |
| **Codex**          | 启用 Memories 后，会把符合条件的历史线程转成本地 memory files；`AGENTS.md` 会在工作前被读取，并按全局 → 项目层叠加。([OpenAI开发者][1])                                           | `~/.codex/memories/`、`AGENTS.md` | Oazen 只做当前 project 的选择性召回，不把历史线程自动沉淀成更大的记忆池。            |
| **Kiro**           | 以 steering files 为核心，foundation steering files 默认会进每次交互；同时支持 workspace / global steering，`AGENTS.md` 也会自动拾取。([Kiro][2])                 | Steering files、`AGENTS.md`       | Oazen 更偏“项目记忆过滤器”，只负责把当前项目相关的记忆拉进上下文。                   |
| **Cursor**         | 主要靠 Project / Team / User Rules + `AGENTS.md` 提供持续上下文，规则被当作静态、always-on 的项目指令。([Cursor][3])                                             | Rules、`AGENTS.md`                | Oazen 不负责写规则，而是负责按项目边界检索和压缩记忆。                          |
| **GitHub Copilot** | 有 repository-level 的 persistent memory；用于 Copilot cloud agent、code review 和 Copilot CLI；仓库 owner 可查看、删除，且记忆会自动清理过期内容。([GitHub Docs][4]) | Repo memory、custom instructions  | Oazen 更聚焦“只读当前项目”，而不是维护一个更广义的仓库记忆层。                     |
| **Claude Code**    | `CLAUDE.md`、`CLAUDE.local.md` 和 rules files 会在当前 session 加载；`auto memory` 可开关，用户可编辑或删除。Skills 是独立层，按需加载。([Claude API Docs][5])          | `CLAUDE.md`、auto memory、Skills   | Oazen 更像 project-scoped recall runtime，而不是会自己积累会话记忆的助手。 |
| **TRAE**           | Chat 流里会显示 generated memories；同时有 `Rules & Skills`，并支持 Global / Project 两种 skill。([TRAE][6])                                            | Chat memories、Rules、Skills       | Oazen 不做聊天内记忆展示，而是做项目外置的精确召回层。                          |

[1]: https://developers.openai.com/codex/memories "Memories – Codex | OpenAI Developers"
[2]: https://kiro.dev/docs/steering/ "Steering - IDE - Docs - Kiro"
[3]: https://cursor.com/docs/rules?utm_source=chatgpt.com "Rules | Cursor Docs"
[4]: https://docs.github.com/en/copilot/concepts/agents/copilot-memory "About agentic memory for GitHub Copilot - GitHub Docs"
[5]: https://docs.anthropic.com/en/docs/claude-code/memory?utm_source=chatgpt.com "How Claude remembers your project - Claude Code Docs"
[6]: https://docs.trae.ai/ide/memories?utm_source=chatgpt.com "Memories - Documentation"

---

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件。
