"""System A · Rule-based tech_stack / capability extractor.

Matches tag closed-set by keyword/pattern lookup. No semantic reasoning, no
reverse-exclusion — failures here are by design the baseline for what rule
can/can't do.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Dict, List, Pattern, Sequence, Tuple


# ---------------------------------------------------------------------------
# Rule book — hand-written keyword patterns per tag.
# Coverage is deliberately generous on frequent tags, sparse on cold tags.
# Each pattern list: exact substrings (case-insensitive) + optional regex.
# ---------------------------------------------------------------------------

TECH_STACK_RULES: Dict[str, List[str]] = {
    # frontend frameworks
    "react": ["react", "jsx", "usestate", "useeffect", "react hooks"],
    "nextjs": ["next.js", "nextjs", "next app", "app router", "getserversideprops"],
    "antd": ["antd", "ant design", "ant-design"],
    "shadcn-ui": ["shadcn", "shadcn/ui", "shadcn-ui"],
    "tailwindcss": ["tailwind", "tailwindcss", "tailwind css"],
    "daisyui": ["daisyui", "daisy ui"],
    "headlessui": ["headless ui", "headlessui", "@headlessui"],
    "taro": ["taro", "@tarojs"],
    "uni-app": ["uni-app", "uniapp", "uni app"],

    # backend frameworks
    "django": ["django"],
    "fastapi": ["fastapi", "fast api"],
    "celery": ["celery", "celery beat", "celery worker"],
    "sqlalchemy": ["sqlalchemy"],
    "sqlmodel": ["sqlmodel"],
    "prisma": ["prisma"],
    "langchain": ["langchain"],
    "langgraph": ["langgraph", "lang graph"],

    # claude ecosystem
    "claude-code": ["claude code", "claude-code", ".claude/", "claude cli"],
    "agent": ["subagent", "sub-agent", "agent ", "coding-expert"],
    "mcp": ["mcp", "mcp server", "mcp tool", "model context protocol"],

    # infra / devops
    "docker": ["docker", "dockerfile"],
    "kubernetes": ["kubernetes", "k8s", "kubectl"],
    "nginx": ["nginx"],
    "kafka": ["kafka"],
    "redis": ["redis"],
    "postgresql": ["postgres", "postgresql", "psql"],
    "elasticsearch": ["elasticsearch", "elastic search"],
    "github-actions": ["github actions", "github-actions", ".github/workflows"],
    "gitlab": ["gitlab", "gitlab-ci"],
    "argocd": ["argocd", "argo cd"],
    "fluxcd": ["fluxcd", "flux cd"],
    "cilium": ["cilium"],
    "calico": ["calico"],
    "prometheus": ["prometheus"],
    "grafana-loki": ["grafana loki", "grafana-loki", "loki"],
    "opentelemetry": ["opentelemetry", "otel"],

    # mobile / native
    "ios": ["ios ", "ios,", "ios。", "ios项目", "xcode"],
    "android": ["android"],
    "swiftui": ["swiftui", "swift ui"],
    "compose": ["jetpack compose", "compose ui"],
    "harmonyos": ["harmonyos", "harmony os", "鸿蒙"],
    "kingfisher": ["kingfisher"],
    "sdwebimage": ["sdwebimage"],
    "coil": ["coil"],
    "coredata": ["core data", "coredata"],
    "swiftdata": ["swiftdata", "swift data"],
    "room": ["room database", "androidx.room"],
    "datastore": ["datastore", "data store"],
    "retrofit": ["retrofit"],
    "foundation": ["foundation framework"],
    "mobile-native": ["mobile native", "原生 ios", "原生 android"],

    # auth / oauth
    "oauth2": ["oauth2", "oauth 2"],
    "oidc": ["oidc", "openid connect"],
    "oauth-social-login": ["社交登录", "social login", "三方登录", "第三方登录"],
    "apple-auth": ["sign in with apple", "apple auth"],
    "facebook": ["facebook login", "facebook sdk"],
    "qq-connect": ["qq connect", "qq登录"],
    "douyin-open-platform": ["douyin open", "抖音开放平台"],

    # payment
    "alipay": ["alipay", "支付宝"],
    "unionpay": ["unionpay", "银联"],
    "payment": ["支付", "payment"],

    # storage / cloud
    "s3": ["s3", "boto3.s3", "aws s3"],
    "boto3": ["boto3"],

    # game
    "godot4": ["godot", "godot4"],
    "unreal5": ["unreal", "unreal engine", "ue5"],
    "phaser": ["phaser"],

    # media / drm
    "hls": ["hls", "m3u8"],
    "eme": ["eme", "encrypted media"],
    "fairplay": ["fairplay"],
    "playready": ["playready"],
    "drm": ["drm"],
    "html5-video": ["html5 video", "<video>"],

    # generic
    "frontend": ["前端", "frontend"],
    "backend": ["后端", "backend"],
    "http": ["http ", "http,"],
    "im": [" im ", "即时通讯", "instant messaging"],
}

CAPABILITY_RULES: Dict[str, List[str]] = {
    # UI primitives
    "ui-overlay": ["弹窗", "浮层", "modal", "drawer", "popover", "tooltip", "dropdown", "对话框"],
    "ui-form": ["表单", "form ", "formitem", "form item"],
    "ui-input": ["输入框", "选择器", "cascader", "上传", "switch", "slider", "datepicker"],
    "ui-action": ["按钮", "button", "floatbutton"],
    "ui-display": ["列表", "表格", "卡片", "badge", "descriptions", "statistic", "标签"],
    "ui-feedback": ["toast", "消息提示", "progress", "spin", "alert", "result"],
    "ui-navigation": ["菜单", "面包屑", "tabs", "分页", "步骤条", "anchor", "navigation"],
    "ui-layout": ["布局", "栅格", "分栏", "space", "divider"],

    # forms / auth
    "form-validation": ["校验", "rules", "yup", "zod", "validation"],
    "auth": ["登录", "login", "jwt", "token", "oauth", "session", "身份认证"],
    "permission": ["权限", "rbac", "授权"],

    # network / transport
    "http-client": ["axios", "fetch api", "http client", "rest api"],
    "websocket": ["websocket", "socket.io", "长连接"],
    "realtime-messaging": ["聊天", "im ", "在线协作", "即时消息"],
    "routing": ["路由", "routing", "页面跳转", "深链接"],
    "state-management": ["状态管理", "zustand", "redux", "pinia", "react context"],
    "data-fetching": ["swr", "tanstack query", "react query", "数据获取"],
    "task-scheduler": ["异步任务", "定时任务", "celery", "apscheduler", "cron"],

    # backend primitives
    "web-framework": ["web 框架", "web框架", "中间件", "middleware"],
    "orm": ["orm", "sqlalchemy", "prisma", "数据库模型"],
    "api-design": ["rest ", "graphql", "接口设计", "序列化"],
    "file-upload": ["上传", "分片", "断点续传", "file upload"],

    # LLM / agent
    "llm-client": ["llm", "ollama", "openai", "claude api", "调用大模型"],
    "prompt-engineering": ["prompt", "system prompt", "few-shot", "提示词"],
    "rag": ["rag", "retrieval augmented", "向量检索"],
    "tool-calling": ["tool calling", "function calling", "工具调用"],
    "orchestration": ["orchestration", "编排", "workflow"],

    # observability
    "observability": ["observability", "监控", "tracing", "metrics"],

    # storage
    "relational-db": ["关系型数据库", "postgres", "mysql"],
    "key-value-store": ["key-value", "redis"],
    "object-storage": ["对象存储", "s3", "minio"],
    "local-storage": ["local storage", "本地存储", "asyncstorage"],
    "search-engine": ["搜索引擎", "elasticsearch"],

    # testing
    "unit-testing": ["单元测试", "unit test", "pytest", "jest"],
    "e2e-testing": ["e2e", "端到端", "playwright", "cypress"],
    "integration-testing": ["集成测试", "integration test"],

    # claude-code domain
    "cc-hook": ["hook", "hooks", "subagentstart"],
    "cc-subagent": ["subagent", "sub-agent"],
    "cc-plugin": ["plugin"],
    "cc-settings": ["settings.json", "claude 配置"],
    "cc-slash-command": ["slash command", "/command"],
    "cc-mcp": ["mcp server", "mcp tool"],

    # payment
    "payment-gateway": ["支付网关", "payment gateway"],
    "payment-reconcile": ["对账", "reconcile"],

    # misc
    "encryption": ["加密", "encryption", "crypto"],
    "i18n": ["i18n", "国际化", "多语言"],
    "theming": ["theme", "主题", "dark mode"],
    "reverse-proxy": ["反向代理", "reverse proxy", "nginx"],
    "ci-cd": ["ci/cd", "持续集成", "持续部署"],
    "container": ["容器", "docker"],
    "message-queue": ["消息队列", "message queue", "kafka", "rabbitmq"],
    "stream-processing": ["流式处理", "stream processing"],
    "media-processing": ["媒体处理", "ffmpeg", "转码"],
    "push-notification": ["推送通知", "push notification"],
    "native-lifecycle": ["应用生命周期", "lifecycle"],
    "native-navigation": ["原生导航", "navigation controller"],
    "native-device": ["相机", "camera", "gps", "蓝牙"],
    "game-input": ["游戏输入", "input handling"],
    "game-physics": ["物理引擎", "physics"],
    "game-rendering": ["rendering", "渲染"],
}


@dataclass
class RuleResult:
    tech_stack: List[str] = field(default_factory=list)
    capability: List[str] = field(default_factory=list)
    elapsed_s: float = 0.0


def _build_patterns(rules: Dict[str, List[str]]) -> Dict[str, List[Pattern[str]]]:
    compiled: Dict[str, List[Pattern[str]]] = {}
    for tag, keywords in rules.items():
        pats: List[Pattern[str]] = []
        for kw in keywords:
            # For short english tokens add word boundary; otherwise simple substring (case-insensitive)
            if re.match(r"^[a-z0-9]{1,6}$", kw):
                pats.append(re.compile(rf"\b{re.escape(kw)}\b", re.IGNORECASE))
            else:
                pats.append(re.compile(re.escape(kw), re.IGNORECASE))
        compiled[tag] = pats
    return compiled


class RuleBasedExtractor:
    def __init__(
        self,
        available_tech_stack: Sequence[str],
        available_capability: Sequence[str],
    ) -> None:
        self._allowed_tech = set(available_tech_stack)
        self._allowed_cap = set(available_capability)
        # keep only rules whose tag is in the allowlist
        self._tech_patterns = {
            tag: pats
            for tag, pats in _build_patterns(TECH_STACK_RULES).items()
            if tag in self._allowed_tech
        }
        self._cap_patterns = {
            tag: pats
            for tag, pats in _build_patterns(CAPABILITY_RULES).items()
            if tag in self._allowed_cap
        }

    def extract(self, text: str) -> RuleResult:
        t0 = time.monotonic()
        tech: List[str] = []
        cap: List[str] = []
        for tag, pats in self._tech_patterns.items():
            if any(p.search(text) for p in pats):
                tech.append(tag)
        for tag, pats in self._cap_patterns.items():
            if any(p.search(text) for p in pats):
                cap.append(tag)
        return RuleResult(
            tech_stack=sorted(tech),
            capability=sorted(cap),
            elapsed_s=time.monotonic() - t0,
        )
