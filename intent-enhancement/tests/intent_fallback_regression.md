# IntentFallback 回归报告

> 对比新兜底 (rule ∪ embedding) 与旧 qwen2.5:7b classifier，在 intent_eval_dataset.json 45 样本上的 F1 对比。

## 总体对比 (tech_f1 / cap_f1)

| 系统 | tech_f1 | cap_f1 | tech_P | tech_R | cap_P | cap_R | elapsed(s) |
|---|---|---|---|---|---|---|---|
| IntentFallback | 0.647 | 0.530 | 0.615 | 0.817 | 0.554 | 0.683 | 0.231 |
| qwen2.5:7b | 0.525 | 0.427 | 0.594 | 0.781 | 0.476 | 0.509 | 2.857 |

## 分 source 对比

| source | fb_tech_f1 | llm_tech_f1 | fb_cap_f1 | llm_cap_f1 | n |
|---|---|---|---|---|---|
| real | 0.455 | 0.217 | 0.272 | 0.133 | 20 |
| synthetic | 0.800 | 0.772 | 0.737 | 0.663 | 25 |

## 分 difficulty 对比

| diff | fb_tech_f1 | llm_tech_f1 | fb_cap_f1 | llm_cap_f1 | n |
|---|---|---|---|---|---|
| L1 | 0.682 | 0.480 | 0.502 | 0.402 | 17 |
| L2 | 0.499 | 0.452 | 0.514 | 0.238 | 14 |
| L3 | 0.562 | 0.794 | 0.611 | 0.667 | 6 |
| L4 | 0.892 | 0.546 | 0.558 | 0.633 | 8 |

## IntentFallback 回归（旧系统正确、新系统漏/错） (top 3)

### intent_real_011 (L1)
- user_prompt: `prompt caching 实测`
- gt: tech=['claude-code'] cap=['observability']
- fallback: tech=['agent', 'claude-code'] cap=['auth', 'cc-hook', 'cc-subagent', 'prompt-engineering'] (f1=0.333)
- llm: tech=['claude-code'] cap=['orm', 'task-scheduler'] (f1=0.5)

### intent_real_014 (L3)
- user_prompt: `我认为你上面提到的都很重要，我再补充一点：对于harmonyos和android，与c++的混编，以及相应的工程配置方法，都需要蒸馏标准实践，有时编写代码并不难，配置工程才复杂，尤其是如何将cmake与ohpm/gradle结合起来。`
- gt: tech=['android', 'harmonyos'] cap=[]
- fallback: tech=['android', 'harmonyos', 'swiftui'] cap=['ui-navigation'] (f1=0.4)
- llm: tech=['android', 'harmonyos'] cap=['cc-plugin'] (f1=0.5)

### intent_real_017 (L1)
- user_prompt: `自动注入机制目前是怎样工作的`
- gt: tech=['claude-code'] cap=['cc-hook']
- fallback: tech=['agent', 'claude-code', 'mcp'] cap=['auth', 'cc-hook', 'cc-mcp', 'cc-settings', 'cc-subagent', 'llm-client', 'prompt-engineering', 'tool-calling'] (f1=0.361)
- llm: tech=[] cap=['cc-hook'] (f1=0.5)

## IntentFallback 领先（新系统正确、旧系统崩） (top 5)

### intent_real_002 (L1)
- user_prompt: `我发现“!”也是claude code 关键按键，需要换一个，用“#”吧。`
- gt: tech=['claude-code'] cap=['cc-hook', 'cc-slash-command']
- fallback: tech=['agent', 'claude-code', 'mcp'] cap=['cc-hook', 'cc-mcp', 'cc-settings', 'cc-slash-command', 'cc-subagent', 'unit-testing'] (f1=0.5)
- llm: tech=[] cap=[] (f1=0.0)

### intent_real_003 (L1)
- user_prompt: `值得注意的是项目级agents也引用了自己的coding-expert-rules.md，claude code的加载机制是否会导致其与全局的coding-expert-rules.md被重复载入两份`
- gt: tech=['agent', 'claude-code'] cap=['cc-subagent']
- fallback: tech=['agent', 'claude-code'] cap=['cc-subagent'] (f1=1.0)
- llm: tech=['claude-code'] cap=['cc-plugin'] (f1=0.333)

### intent_real_019 (L2)
- user_prompt: `@../../init_claude.sh 初始化脚本也要更新一下`
- gt: tech=['claude-code', 'mcp'] cap=['cc-mcp']
- fallback: tech=['claude-code', 'mcp'] cap=['cc-mcp'] (f1=1.0)
- llm: tech=['claude-code'] cap=['tool-calling'] (f1=0.333)

### intent_syn_011 (L2)
- user_prompt: `加一下上面提到的那个缓存`
- gt: tech=['redis'] cap=['key-value-store']
- fallback: tech=['redis'] cap=['key-value-store'] (f1=1.0)
- llm: tech=['django', 'redis'] cap=['data-fetching'] (f1=0.333)

### intent_syn_014 (L3)
- user_prompt: `给 Android 端加一个本地数据库缓存商品列表`
- gt: tech=['android', 'room'] cap=['local-storage', 'ui-display']
- fallback: tech=['android', 'coredata', 'ios', 'room', 'swiftui'] cap=['ui-display'] (f1=0.619)
- llm: tech=['android', 'compose', 'room'] cap=['orm'] (f1=0.4)

