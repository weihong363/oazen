# Oazen Long-Term Roadmap

## 1. Strategic Direction

Oazen should evolve from a lightweight local memory runtime into a safe, flexible memory layer for multiple coding agents.

The product should stay:

* local-first
* low-friction
* inspectable
* layered
* safe by default

The roadmap below is organized by the level of product maturity, not by feature hype.

---

## 2. 0-6 Months: Make Oazen Reliable

### Objective

Ship a stable core that actually improves real agent workflows.

### What to build

* CLI stability
* recall / writeback / review / promote / reject
* merge and dedupe
* compress and forget
* layered memory lifecycle
* scope support for global / project / repo
* Codex adapter workflow

### Exit criteria

* Oazen can run end-to-end without manual patching
* memory quality is predictable
* users can see where memories came from and where they went
* the system does not feel like a toy

### Product mindset

This phase is about proving that memory can be useful without becoming a burden.

---

## 3. 6-12 Months: Make Oazen Multi-Agent Aware

### Objective

Support multiple agents without mixing their memory in a confusing way.

### What to build

* agent identity
* agent profile
* private agent memory
* shared memory
* handoff memory between agents
* adapter layer for Codex, Claude Code, and future agents
* policy for shared vs private memory

### Exit criteria

* two agents can use Oazen in the same project without stepping on each other
* shared memory is explicit, not accidental
* agent-specific behavior can be isolated when needed

### Product mindset

The future is not one agent, but many specialized agents cooperating with bounded context.

---

## 4. 12-24 Months: Make Oazen Safe at Scale

### Objective

Prevent memory pollution, leakage, and sensitive-data retention as usage grows.

### What to build

* sensitive information masking before writeback
* secret detection and blocking
* project-level isolation rules
* conflict detection across scopes
* memory trust levels
* policy-based promotion/retention
* better recall ranking using scope, recency, access frequency, and stability

### Exit criteria

* memory can be filtered before long-term storage
* secret-like content is not casually persisted
* project boundaries are respected
* users can trust Oazen not to spread private context everywhere

### Product mindset

Once memory becomes durable, safety and boundaries matter more than raw recall power.

---

## 5. 24 Months and Beyond: Make Oazen a Memory Runtime Platform

### Objective

Turn Oazen into a reusable memory substrate for agent workflows.

### What to build

* richer adapter ecosystem
* optional desktop shell
* agent-driven UI integration
* distributed or shared memory modes when explicitly enabled
* advanced compression strategies
* optional semantic retrieval augmentation
* policy packs for different agent types or project classes

### Exit criteria

* Oazen can support many workflows without becoming heavy
* the same core can serve CLI users, desktop users, and future agent UI layers
* users can stay in control even as the system becomes more capable

### Product mindset

The platform should grow underneath the user, not in front of them.

---

## 6. What Not to Sacrifice

Even as Oazen grows, these principles should stay fixed:

* no unnecessary UI
* no configuration overload
* no hidden memory mutations without traceability
* no weak project boundaries
* no automatic promotion of sensitive content
* no forced learning curve

---

## 7. Recommended Sequence

If execution has to stay lean, the order should be:

1. stabilize the core pipeline
2. add scope isolation
3. add multi-agent awareness
4. add safety and secret filtering
5. expand adapters
6. add desktop UI only if it helps, not because it is available
