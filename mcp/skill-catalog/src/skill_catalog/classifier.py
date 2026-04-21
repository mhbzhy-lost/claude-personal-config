"""LLM-powered tech_stack / capability classifier backed by a local ollama daemon.

Uses stdlib ``http.client`` only (no new runtime deps). All failures are
soft-degraded to ``ClassifyResult(error=...)`` so the caller can fall back to
an empty-tag pipeline.
"""

from __future__ import annotations

import http.client
import json
import socket
import time
from dataclasses import dataclass, field
from urllib.parse import urlparse


SYSTEM_PROMPT = """你是技术栈和能力域分类器。任务：根据用户需求 + workspace 指纹，从给定的合法 tag 闭集中选出相关 tag。输出纯 JSON，两个字段：tech_stack、capability。

## 基本规则

- tech_stack 只能从"合法 tech_stack"列表中选；capability 只能从"合法 capability"列表中选
- 禁止生造 tag；不确定宁可返回空数组
- 纯后端逻辑 / 文档 / 配置类任务允许返回 tech_stack=[]
- 用户原始意图优先于 workspace 指纹（"我想写 Next.js" 压过没有 package.json）
- **只保留与当前任务意图直接相关的 tag**；workspace 指纹里与本次意图无关的栈必须剔除
  例：monorepo 有 django + react，用户说"做个 React 弹窗"，tech_stack 只保留 react/antd，不带 django

## Capability 速查表（中文意图关键词 → capability key）

UI 呈现/交互类：
- 弹窗 / 浮层 / Modal / Drawer / Popover / Tooltip / Dropdown → **ui-overlay**
- 表单 / FormItem / 提交流程 → **ui-form**
- 输入框 / 选择器 / 上传 / Cascader / Switch / Slider / DatePicker → **ui-input**
- 按钮 / 操作触发 / FloatButton → **ui-action**
- 列表 / 表格 / 卡片 / 标签 / Badge / Descriptions / Statistic → **ui-display**
- Toast / 消息提示 / Progress / Spin / Alert / Result → **ui-feedback**
- 菜单 / 面包屑 / Tabs / 分页 / 步骤条 / Anchor → **ui-navigation**
- 布局 / 栅格 / 分栏 / Space / Divider → **ui-layout**

数据/网络/认证类：
- 校验 / rules / Yup / Zod → **form-validation**
- 登录 / Token / JWT / OAuth / session / 身份认证 → **auth**
- 权限 / RBAC / 授权 → **permission**
- HTTP / axios / fetch / REST → **http-client**
- WebSocket / socket.io / 长连接 → **websocket**
- IM / 聊天 / 在线协作 → **realtime-messaging**
- 路由 / 页面跳转 / 深链接 → **routing**
- 状态管理 / Zustand / Redux / Pinia / Context → **state-management**
- 数据获取 / SWR / TanStack Query → **data-fetching**
- 异步任务 / 定时任务 / Celery / APScheduler / cron → **task-scheduler**

后端/基础设施类：
- Web 框架 / 路由 / 中间件 → **web-framework**
- ORM / 数据库访问 → **orm**
- REST / GraphQL 接口 / 序列化 → **api-design**
- 上传 / 分片 / 断点续传 → **file-upload**

## 示例

示例 1：
用户需求：用 Cascader 做一个地址三级联动
workspace 指纹：web/package.json → react, antd
输出：{"tech_stack":["react","antd"], "capability":["ui-input"]}

示例 2：
用户需求：给 web 前端加一个 HITL 决策弹窗，展示 pending 任务详情和接受/拒绝按钮
workspace 指纹：pyproject.toml → fastapi, langgraph；web/package.json → react, antd
输出：{"tech_stack":["react","antd"], "capability":["ui-overlay","ui-display","ui-action"]}
（弹窗→ui-overlay，详情→ui-display，接受/拒绝按钮→ui-action；后端栈与本次 UI 任务无关不纳入）

示例 3：
用户需求：写一个 Celery 异步订单处理任务
workspace 指纹：pyproject.toml → django, celery
输出：{"tech_stack":["django","celery"], "capability":["task-scheduler"]}

示例 4：
用户需求：做一个带校验的 JWT 登录表单
workspace 指纹：web/package.json → react, antd
输出：{"tech_stack":["react","antd"], "capability":["ui-form","ui-input","form-validation","auth"]}
"""


_RESPONSE_FORMAT = {
    "type": "object",
    "properties": {
        "tech_stack": {"type": "array", "items": {"type": "string"}},
        "capability": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["tech_stack", "capability"],
}


@dataclass(frozen=True)
class ClassifierConfig:
    host_url: str
    model: str = "qwen3:4b"
    timeout_s: float = 5.0
    num_ctx: int = 4096


@dataclass
class ClassifyResult:
    tech_stack: list[str] = field(default_factory=list)
    capability: list[str] = field(default_factory=list)
    elapsed_s: float = 0.0
    error: str | None = None


def _build_user_prompt(
    user_prompt: str,
    fingerprint_summary: str,
    available_tech_stack: list[str],
    available_capability: list[str],
) -> str:
    return (
        f"合法 tech_stack: {json.dumps(available_tech_stack, ensure_ascii=False)}\n"
        f"合法 capability: {json.dumps(available_capability, ensure_ascii=False)}\n"
        "\n"
        "workspace 指纹:\n"
        f"{fingerprint_summary}\n"
        "\n"
        "用户需求:\n"
        f"{user_prompt}"
    )


class Classifier:
    def __init__(self, config: ClassifierConfig) -> None:
        self.config = config
        parsed = urlparse(config.host_url)
        self._host = parsed.hostname or "127.0.0.1"
        self._port = parsed.port or 11435
        self._scheme = parsed.scheme or "http"

    def classify(
        self,
        user_prompt: str,
        fingerprint_summary: str,
        available_tech_stack: list[str],
        available_capability: list[str],
    ) -> ClassifyResult:
        payload = {
            "model": self.config.model,
            "stream": False,
            "think": False,
            "options": {"temperature": 0, "num_ctx": self.config.num_ctx},
            "format": _RESPONSE_FORMAT,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": _build_user_prompt(
                        user_prompt,
                        fingerprint_summary,
                        available_tech_stack,
                        available_capability,
                    ),
                },
            ],
        }
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

        t0 = time.monotonic()

        if self._scheme == "https":
            conn_cls = http.client.HTTPSConnection
        else:
            conn_cls = http.client.HTTPConnection
        conn = conn_cls(self._host, self._port, timeout=self.config.timeout_s)
        try:
            conn.request(
                "POST",
                "/api/chat",
                body=body,
                headers={"Content-Type": "application/json"},
            )
            resp = conn.getresponse()
            raw = resp.read()
            if not (200 <= resp.status < 300):
                return ClassifyResult(
                    elapsed_s=time.monotonic() - t0,
                    error=f"http {resp.status}: {raw[:200].decode('utf-8', 'replace')}",
                )
        except (
            ConnectionRefusedError,
            socket.timeout,
            TimeoutError,
            OSError,
            http.client.HTTPException,
        ) as e:
            return ClassifyResult(
                elapsed_s=time.monotonic() - t0,
                error=f"transport: {type(e).__name__}: {e}",
            )
        finally:
            try:
                conn.close()
            except Exception:
                pass

        try:
            outer = json.loads(raw.decode("utf-8", "replace"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            return ClassifyResult(
                elapsed_s=time.monotonic() - t0,
                error=f"outer json: {e}",
            )

        content = (outer or {}).get("message", {}).get("content")
        if not isinstance(content, str):
            return ClassifyResult(
                elapsed_s=time.monotonic() - t0,
                error="missing message.content",
            )

        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as e:
            return ClassifyResult(
                elapsed_s=time.monotonic() - t0,
                error=f"inner json: {e}",
            )

        if not isinstance(parsed, dict):
            return ClassifyResult(
                elapsed_s=time.monotonic() - t0,
                error="inner not object",
            )

        ts_raw = parsed.get("tech_stack", [])
        cap_raw = parsed.get("capability", [])
        if not isinstance(ts_raw, list) or not isinstance(cap_raw, list):
            return ClassifyResult(
                elapsed_s=time.monotonic() - t0,
                error="schema: fields must be arrays",
            )

        ts_allowed = set(available_tech_stack)
        cap_allowed = set(available_capability)

        tech_stack = [str(t) for t in ts_raw if isinstance(t, str) and t in ts_allowed]
        capability = [str(c) for c in cap_raw if isinstance(c, str) and c in cap_allowed]

        # de-dup while preserving order
        tech_stack = list(dict.fromkeys(tech_stack))
        capability = list(dict.fromkeys(capability))

        return ClassifyResult(
            tech_stack=tech_stack,
            capability=capability,
            elapsed_s=time.monotonic() - t0,
            error=None,
        )
