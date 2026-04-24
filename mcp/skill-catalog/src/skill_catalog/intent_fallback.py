"""Rule + embedding intent fallback — the sole intent classifier.

Runs when the ``resolve`` caller does NOT pre-fill
``tech_stack`` / ``capability`` tags. In the normal path the main agent's
PreToolUse hook enforces that at least one dimension is provided so the
pipeline skips classification entirely; this fallback therefore covers:

1. CLI direct invocation (no hook layer);
2. sub-agents whose tag-closed-set injection failed (degrade path);
3. future programmatic callers that pre-date the hook contract.

Design: rule (high-precision substring match) ∪ embedding (bge-m3 cosine vs
tag-card). Fail-soft — partial results on transport error, empty result +
error string on total failure.

History: supersedes the ``qwen2.5:7b``-backed ``Classifier`` (removed
2026-04 after regression proved this module dominates it on F1 + latency;
see ``intent-enhancement/tests/intent_fallback_regression.md``).

See ``intent-enhancement/tests/intent_fallback_design.md`` for the full
design rationale.
"""

from __future__ import annotations

import hashlib
import http.client
import json
import logging
import math
import re
import socket
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Pattern, Sequence, Tuple, Union
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public return type. Historically lived in classifier.py (removed); kept
# here as the single source of truth. ``language`` is populated by the
# embedding/rule layers of this module.
# ---------------------------------------------------------------------------
@dataclass
class ClassifyResult:
    tech_stack: list[str] = field(default_factory=list)
    capability: list[str] = field(default_factory=list)
    language: list[str] = field(default_factory=list)
    elapsed_s: float = 0.0
    error: str | None = None


# ---------------------------------------------------------------------------
# Default asset + cache locations
# <repo>/mcp/skill-catalog/src/skill_catalog/intent_fallback.py
#   parents: [0]=skill_catalog [1]=src [2]=skill-catalog
_PKG_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TAG_CARDS_PATH = _PKG_ROOT / "data" / "tag_cards.json"
DEFAULT_CACHE_DIR = Path.home() / ".cache" / "skill-catalog"
# ---------------------------------------------------------------------------


# ===========================================================================
# Rule layer — keyword patterns per tag. Generous on hot tags, sparse on cold
# tags (embedding layer covers the long tail). Patterns are case-insensitive;
# short ascii tokens (<=6 chars) use \b...\b to avoid false substring hits
# (e.g. 'ios' must not match 'kiosk').
# ===========================================================================

_TECH_STACK_RULES: Dict[str, List[str]] = {
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
    "agent": ["subagent", "sub-agent", "coding-expert"],
    "mcp": ["mcp server", "mcp tool", "model context protocol"],
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
    "qq-connect": ["qq connect", "qq登录", "qq 登录"],
    "douyin-open-platform": ["douyin open", "抖音开放平台"],
    "wechat": ["微信公众号", "微信开放平台", "微信网页登录"],
    "wechat-miniprogram": ["微信小程序", "wx.", "wechat miniprogram"],
    "wechat-pay": ["微信支付", "wechat pay"],
    "xiaomi-account": ["小米账号", "小米登录"],
    "vivo-account": ["vivo 账号", "vivo 登录"],
    "honor-id": ["荣耀账号", "荣耀登录", "honor id"],
    "amazon-lwa": ["login with amazon", "amazon 登录"],
    "baidu-oauth": ["百度 oauth", "百度登录"],
    "microsoft-entra": ["microsoft entra", "azure ad", "entra id"],
    "netease-urs": ["网易通行证", "netease urs"],
    "hms-core": ["hms core", "华为 hms"],
    "yahoo": ["yahoo 登录", "yahoo oauth"],
    "x-twitter": ["twitter 登录", "x.com oauth", "x-twitter"],
    "cn-platform-oauth-login": ["国内平台 oauth"],
    "meta-graph-api": ["meta graph", "graph api"],
    "instagram-platform": ["instagram"],
    # payment
    "alipay": ["alipay", "支付宝"],
    "unionpay": ["unionpay", "银联"],
    "payment": ["支付", "payment", "在线收款"],
    "taobao-top": ["淘宝开放平台", "taobao top"],
    # storage / cloud
    "s3": ["aws s3", "s3 bucket", "boto3.s3"],
    "boto3": ["boto3"],
    # game
    "godot4": ["godot", "godot4"],
    "unreal5": ["unreal", "unreal engine", "ue5"],
    "phaser": ["phaser"],
    # media / drm
    "hls": ["m3u8", "hls 流", "http live streaming"],
    "eme": ["encrypted media", "eme api"],
    "fairplay": ["fairplay"],
    "playready": ["playready"],
    "widevine": ["widevine"],
    "drm": ["drm"],
    "html5-video": ["html5 video", "<video>"],
    "dash": ["mpeg-dash", "mpeg dash", "dash 流"],
    "mse": ["media source extensions", "mediasource"],
    "webvtt": ["webvtt", ".vtt"],
    # misc tech
    "socketio": ["socket.io", "socketio"],
    "playwright": ["playwright"],
    "trivy": ["trivy"],
    "crypto": ["aes", "rsa", "哈希", " hash "],
    "signal": ["signal 协议", "signal protocol"],
    "structlog": ["structlog"],
    "github": ["github issue", "github pr", "github 仓库"],
    "xmpp": ["xmpp"],
    "alipay-miniprogram": ["支付宝小程序"],
    "douyin-miniprogram": ["抖音小程序"],
    "jd-miniprogram": ["京东小程序"],
    # generic
    "frontend": ["前端", "frontend"],
    "backend": ["后端", "backend"],
    "http": ["http 协议", "http/1", "http/2"],
    "im": ["即时通讯", "instant messaging"],
    "web": ["网页应用", "web 应用"],
}

_LANGUAGE_RULES: Dict[str, List[str]] = {
    # Hot languages — sparse cold tail relies on embedding layer.
    "cpp": ["c++", "cpp", "cxx", "c++17", "c++20", "c++23"],
    "kotlin": ["kotlin", "ktx", ".kt ", ".kt,", ".kt。"],
    "java": ["java ", "java,", "java。", ".java", "jvm"],
    "swift": ["swift ", "swift,", "swift。", ".swift"],
    "objc": ["objective-c", "objective c", "objc"],
    "python": ["python", "py3", ".py "],
    "typescript": ["typescript", ".ts ", ".tsx"],
    # NOTE: do NOT include bare ".js " — it false-matches framework names
    # like "next.js" / "node.js" / "nuxt.js" and wrongly forces the
    # javascript language filter, which excludes TS-only skill libs.
    "javascript": ["javascript", " js ", ".jsx"],
    "csharp": ["c#", "csharp", ".cs "],
    "sql": ["sql ", " sql,", " sql。"],
    "arkts": ["arkts", "ark ts"],
    "gdscript": ["gdscript", "gd script"],
    "hlsl": ["hlsl", "shader"],
    "blueprint": ["blueprint"],
    "html": ["html "],
    "css": [" css "],
}


_CAPABILITY_RULES: Dict[str, List[str]] = {
    # UI primitives
    "ui-overlay": ["弹窗", "浮层", "modal", "drawer", "popover", "tooltip", "dropdown", "对话框"],
    "ui-form": ["表单", "formitem", "form item"],
    "ui-input": ["输入框", "选择器", "cascader", "上传", "switch", "slider", "datepicker"],
    "ui-action": ["按钮", "button", "floatbutton"],
    "ui-display": ["列表", "表格", "卡片", "badge", "descriptions", "statistic", "标签展示"],
    "ui-feedback": ["toast", "消息提示", "progress", "spin", "alert", "result"],
    "ui-navigation": ["菜单", "面包屑", "tabs", "分页", "步骤条", "anchor", "navigation"],
    "ui-layout": ["布局", "栅格", "分栏", " space ", "divider"],
    # forms / auth
    "form-validation": ["校验", "validation", "yup", "zod"],
    "auth": ["登录", "login", "jwt", "token", "oauth", "session", "身份认证"],
    "permission": ["权限", "rbac", "授权"],
    # network / transport
    "http-client": ["axios", "fetch api", "http client", "rest api"],
    "websocket": ["websocket", "socket.io", "长连接"],
    "realtime-messaging": ["聊天", "在线协作", "即时消息"],
    "routing": ["路由", "routing", "页面跳转", "深链接"],
    "state-management": ["状态管理", "zustand", "redux", "pinia", "react context"],
    "data-fetching": ["swr", "tanstack query", "react query", "数据获取"],
    "task-scheduler": ["异步任务", "定时任务", "celery", "apscheduler", "cron"],
    # backend primitives
    # 泛化后端/服务端表述同样落到 web-framework — 语义上 "后端服务"
    # 与"web 框架"重合度极高，避免 vague prompt 全空。
    "web-framework": [
        "web 框架", "web框架", "middleware",
        "后端服务", "服务端", "web 服务", "web 应用",
        "后端 api", "后端api", "后端 API",
        "python 后端", "python后端", "backend api",
    ],
    "orm": ["orm", "数据库模型"],
    "api-design": [
        " graphql", "接口设计", "rest 接口", "序列化",
        "rest api", "restful", "api 设计", "后端 api", "后端api",
        "http 接口", "web api",
    ],
    "file-upload": ["分片上传", "断点续传", "file upload"],
    # LLM / agent
    "llm-client": ["llm 调用", "ollama", "openai api", "claude api", "调用大模型"],
    "prompt-engineering": ["prompt engineering", "system prompt", "few-shot", "提示词"],
    "rag": [" rag ", "retrieval augmented", "向量检索"],
    "tool-calling": ["tool calling", "function calling", "工具调用"],
    "orchestration": ["orchestration", "编排", "workflow"],
    "agent-orchestration": ["agent 编排", "subagent 派发", "多 agent"],
    # observability
    "observability": ["observability", "监控", "tracing", "指标采集"],
    # storage
    "relational-db": ["关系型数据库", "mysql", "事务"],
    "key-value-store": ["key-value", "键值存储"],
    "object-storage": ["对象存储", "minio"],
    "local-storage": ["local storage", "本地存储", "asyncstorage"],
    "search-engine": ["搜索引擎", "全文检索"],
    # testing
    "unit-testing": ["单元测试", "unit test", "pytest", "jest"],
    "e2e-testing": ["e2e", "端到端", "cypress"],
    "integration-testing": ["集成测试", "integration test"],
    # claude-code domain
    "cc-hook": [" hook ", "hooks", "subagentstart", "pretooluse"],
    "cc-subagent": ["subagent", "sub-agent"],
    "cc-plugin": ["plugin"],
    "cc-settings": ["settings.json", "claude 配置"],
    "cc-slash-command": ["slash command", "/command"],
    "cc-mcp": ["mcp server", "mcp tool"],
    # payment
    "payment-gateway": ["支付网关", "payment gateway"],
    "payment-reconcile": ["对账", "reconcile"],
    # misc
    "encryption": ["加密", "encryption"],
    "i18n": ["i18n", "国际化", "多语言"],
    "theming": ["theme", "主题", "dark mode"],
    "reverse-proxy": ["反向代理", "reverse proxy"],
    "ci-cd": ["ci/cd", "持续集成", "持续部署"],
    "container": ["容器化"],
    "message-queue": ["消息队列", "message queue", "rabbitmq"],
    "stream-processing": ["流式处理", "stream processing"],
    "media-processing": ["媒体处理", "ffmpeg", "转码"],
    "push-notification": ["推送通知", "push notification"],
    "native-lifecycle": ["应用生命周期", "lifecycle"],
    "native-navigation": ["原生导航", "navigation controller"],
    "native-device": ["相机", "camera", "gps", "蓝牙"],
    "game-input": ["游戏输入", "input handling"],
    "game-physics": ["物理引擎", "physics"],
    "game-rendering": ["游戏渲染", "rendering"],
}


def _compile_rules(
    rules: Dict[str, List[str]],
    allowlist: set[str],
) -> Dict[str, List[Pattern[str]]]:
    compiled: Dict[str, List[Pattern[str]]] = {}
    for tag, keywords in rules.items():
        if tag not in allowlist:
            continue
        pats: List[Pattern[str]] = []
        for kw in keywords:
            if re.match(r"^[a-z0-9]{1,6}$", kw):
                pats.append(re.compile(rf"\b{re.escape(kw)}\b", re.IGNORECASE))
            else:
                pats.append(re.compile(re.escape(kw), re.IGNORECASE))
        compiled[tag] = pats
    return compiled


def _rule_match(
    text: str,
    patterns: Dict[str, List[Pattern[str]]],
) -> List[str]:
    # normalize whitespace, keep case (patterns are IGNORECASE already)
    norm = re.sub(r"\s+", " ", text)
    hits: List[str] = []
    for tag, pats in patterns.items():
        if any(p.search(norm) for p in pats):
            hits.append(tag)
    return hits


# ===========================================================================
# Embedding layer — inline minimal Ollama /api/embed client (stdlib-only) to
# keep skill-catalog self-contained. Mirrors the style of classifier.py.
# ===========================================================================


class _EmbedError(RuntimeError):
    pass


class _OllamaEmbedClient:
    def __init__(self, host_url: str, model: str, timeout_s: float) -> None:
        parsed = urlparse(host_url)
        self._host = parsed.hostname or "127.0.0.1"
        self._port = parsed.port or 11435
        self._scheme = parsed.scheme or "http"
        self._model = model
        self._timeout_s = float(timeout_s)

    def _conn(self) -> http.client.HTTPConnection:
        if self._scheme == "https":
            return http.client.HTTPSConnection(self._host, self._port, timeout=self._timeout_s)
        return http.client.HTTPConnection(self._host, self._port, timeout=self._timeout_s)

    def embed(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        payload_input: Union[str, List[str]] = texts if len(texts) > 1 else texts[0]
        body = json.dumps(
            {"model": self._model, "input": payload_input},
            ensure_ascii=False,
        ).encode("utf-8")
        try:
            conn = self._conn()
            try:
                conn.request(
                    "POST",
                    "/api/embed",
                    body=body,
                    headers={"Content-Type": "application/json"},
                )
                resp = conn.getresponse()
                raw = resp.read()
                if not (200 <= resp.status < 300):
                    raise _EmbedError(
                        f"http {resp.status}: {raw[:200].decode('utf-8', 'replace')}"
                    )
            finally:
                try:
                    conn.close()
                except Exception:
                    pass
        except (
            ConnectionRefusedError,
            socket.timeout,
            TimeoutError,
            OSError,
            http.client.HTTPException,
        ) as e:
            raise _EmbedError(f"transport: {type(e).__name__}: {e}") from e

        try:
            outer = json.loads(raw.decode("utf-8", "replace"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            raise _EmbedError(f"response json: {e}") from e
        if not isinstance(outer, dict):
            raise _EmbedError("response not object")
        embeddings = outer.get("embeddings")
        if not isinstance(embeddings, list):
            raise _EmbedError(f"missing 'embeddings': keys={list(outer.keys())}")
        vecs: List[List[float]] = []
        for i, vec in enumerate(embeddings):
            if not isinstance(vec, list):
                raise _EmbedError(f"embeddings[{i}] not list")
            try:
                vecs.append([float(x) for x in vec])
            except (TypeError, ValueError) as e:
                raise _EmbedError(f"embeddings[{i}] non-numeric: {e}") from e
        if len(vecs) != len(texts):
            raise _EmbedError(f"expected {len(texts)} vecs, got {len(vecs)}")
        return vecs


def _cosine(a: List[float], b: List[float]) -> float:
    if not a or not b:
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


# ===========================================================================
# Config + fallback class
# ===========================================================================


@dataclass(frozen=True)
class IntentFallbackConfig:
    tag_cards_path: Path = DEFAULT_TAG_CARDS_PATH
    embedding_host_url: str = "http://127.0.0.1:11435"
    embedding_model: str = "bge-m3"
    embedding_timeout_s: float = 10.0
    # Thresholds picked by regression grid-search (tests/intent_fallback_regression.py):
    # θ=0.65 maximises overall F1 while keeping real-subset F1 well above the
    # qwen2.5:7b baseline. See tests/intent_fallback_regression.md for the sweep.
    tech_threshold: float = 0.65
    cap_threshold: float = 0.65
    lang_threshold: float = 0.65
    cache_dir: Path = DEFAULT_CACHE_DIR


class IntentFallback:
    """Drop-in replacement for ``Classifier``.

    Construction is cheap (no HTTP); first ``classify()`` call may trigger
    one-shot tag-card embedding if disk cache miss. Subsequent calls are:
    1 HTTP (query embed) + ~O(|tags|) cosine.
    """

    def __init__(self, config: Optional[IntentFallbackConfig] = None) -> None:
        self._config = config or IntentFallbackConfig()
        self._tag_cards: dict = self._load_cards()
        self._client = _OllamaEmbedClient(
            host_url=self._config.embedding_host_url,
            model=self._config.embedding_model,
            timeout_s=self._config.embedding_timeout_s,
        )
        # per-allowlist index state (lazy, keyed by tag-set hash)
        self._idx_key: Optional[str] = None
        self._tech_vecs: Dict[str, List[float]] = {}
        self._cap_vecs: Dict[str, List[float]] = {}
        self._lang_vecs: Dict[str, List[float]] = {}
        self._compiled_tech: Dict[str, List[Pattern[str]]] = {}
        self._compiled_cap: Dict[str, List[Pattern[str]]] = {}
        self._compiled_lang: Dict[str, List[Pattern[str]]] = {}
        self._allowlist_tech: set[str] = set()
        self._allowlist_cap: set[str] = set()
        self._allowlist_lang: set[str] = set()

    # --- card + cache management ------------------------------------------

    def _load_cards(self) -> dict:
        path = self._config.tag_cards_path
        if not path.is_file():
            raise FileNotFoundError(
                f"IntentFallback: tag cards asset missing at {path}"
            )
        return json.loads(path.read_text(encoding="utf-8"))

    def _compute_idx_key(
        self,
        tech: Sequence[str],
        cap: Sequence[str],
        lang: Sequence[str] = (),
    ) -> str:
        try:
            mtime = self._config.tag_cards_path.stat().st_mtime
        except OSError:
            mtime = 0.0
        payload = json.dumps(
            {
                "tech": sorted(set(tech)),
                "cap": sorted(set(cap)),
                "lang": sorted(set(lang)),
                "cards_mtime": round(mtime, 3),
                "model": self._config.embedding_model,
            },
            sort_keys=True,
            ensure_ascii=False,
        ).encode("utf-8")
        return hashlib.sha256(payload).hexdigest()[:24]

    def _cache_path(self, idx_key: str) -> Path:
        return self._config.cache_dir / f"tag_card_embeddings_{idx_key}.json"

    def _card_text(self, dim: str, tag: str) -> str:
        cards = self._tag_cards.get(dim, {})
        text = cards.get(tag)
        if isinstance(text, str) and text:
            return text
        # fallback: tag name itself (warn once per missing tag)
        logger.warning(
            "intent_fallback: tag '%s' in dim '%s' has no card; using tag name verbatim",
            tag, dim,
        )
        return tag

    def _ensure_index(
        self,
        available_tech_stack: Sequence[str],
        available_capability: Sequence[str],
        available_language: Sequence[str] = (),
    ) -> Optional[str]:
        """Build / load tag-card embedding index for the given allowlist.

        Returns None on success, or an error string on embedding build failure
        (caller falls back to rule-only).
        """
        key = self._compute_idx_key(
            available_tech_stack, available_capability, available_language
        )
        self._allowlist_tech = set(available_tech_stack)
        self._allowlist_cap = set(available_capability)
        self._allowlist_lang = set(available_language)
        self._compiled_tech = _compile_rules(_TECH_STACK_RULES, self._allowlist_tech)
        self._compiled_cap = _compile_rules(_CAPABILITY_RULES, self._allowlist_cap)
        self._compiled_lang = _compile_rules(_LANGUAGE_RULES, self._allowlist_lang)

        have_lang_vecs = (not self._allowlist_lang) or bool(self._lang_vecs)
        if (
            self._idx_key == key
            and self._tech_vecs
            and self._cap_vecs
            and have_lang_vecs
        ):
            return None

        # try disk cache
        cache_file = self._cache_path(key)
        if cache_file.is_file():
            try:
                data = json.loads(cache_file.read_text(encoding="utf-8"))
                self._tech_vecs = {
                    t: [float(x) for x in v]
                    for t, v in data.get("tech_stack", {}).items()
                }
                self._cap_vecs = {
                    t: [float(x) for x in v]
                    for t, v in data.get("capability", {}).items()
                }
                self._lang_vecs = {
                    t: [float(x) for x in v]
                    for t, v in data.get("language", {}).items()
                }
                self._idx_key = key
                logger.debug("intent_fallback: loaded embedding index from %s", cache_file)
                return None
            except (OSError, json.JSONDecodeError, ValueError) as e:
                logger.warning("intent_fallback: cache read failed (%s); rebuilding", e)

        # rebuild
        tech_tags = sorted(self._allowlist_tech)
        cap_tags = sorted(self._allowlist_cap)
        lang_tags = sorted(self._allowlist_lang)
        tech_texts = [self._card_text("tech_stack", t) for t in tech_tags]
        cap_texts = [self._card_text("capability", t) for t in cap_tags]
        lang_texts = [self._card_text("language", t) for t in lang_tags]
        try:
            tech_vecs = self._client.embed(tech_texts)
            cap_vecs = self._client.embed(cap_texts)
            lang_vecs = self._client.embed(lang_texts) if lang_texts else []
        except _EmbedError as e:
            return f"embedding index build failed: {e}"

        self._tech_vecs = dict(zip(tech_tags, tech_vecs))
        self._cap_vecs = dict(zip(cap_tags, cap_vecs))
        self._lang_vecs = dict(zip(lang_tags, lang_vecs))
        self._idx_key = key

        # persist cache (best-effort; cache failure never breaks runtime)
        try:
            self._config.cache_dir.mkdir(parents=True, exist_ok=True)
            cache_file.write_text(
                json.dumps(
                    {
                        "idx_key": key,
                        "model": self._config.embedding_model,
                        "tech_stack": self._tech_vecs,
                        "capability": self._cap_vecs,
                        "language": self._lang_vecs,
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            logger.debug("intent_fallback: wrote embedding index to %s", cache_file)
        except OSError as e:
            logger.warning("intent_fallback: cache write failed (%s); continuing", e)
        return None

    # --- public API (binary-compatible with Classifier.classify) ----------

    def classify(
        self,
        user_prompt: str,
        fingerprint_summary: str,
        available_tech_stack: list[str],
        available_capability: list[str],
        available_language: list[str] | None = None,
    ) -> ClassifyResult:
        t0 = time.monotonic()
        text = f"{user_prompt}\n{fingerprint_summary}".strip()
        available_language = available_language or []

        # 1. rule layer (never fails) ---------------------------------------
        idx_error = self._ensure_index(
            available_tech_stack, available_capability, available_language
        )

        rule_tech = _rule_match(text, self._compiled_tech)
        rule_cap = _rule_match(text, self._compiled_cap)
        rule_lang = _rule_match(text, self._compiled_lang)

        # 2. embedding layer ------------------------------------------------
        emb_tech: List[str] = []
        emb_cap: List[str] = []
        emb_lang: List[str] = []
        embed_error: Optional[str] = idx_error

        if embed_error is None and self._tech_vecs and self._cap_vecs:
            try:
                qvec = self._client.embed([text])[0]
            except _EmbedError as e:
                embed_error = f"query embed failed: {e}"
            else:
                emb_tech = sorted(
                    tag for tag, vec in self._tech_vecs.items()
                    if _cosine(qvec, vec) >= self._config.tech_threshold
                )
                emb_cap = sorted(
                    tag for tag, vec in self._cap_vecs.items()
                    if _cosine(qvec, vec) >= self._config.cap_threshold
                )
                emb_lang = sorted(
                    tag for tag, vec in self._lang_vecs.items()
                    if _cosine(qvec, vec) >= self._config.lang_threshold
                )

        # 3. union + allowlist filter + dedupe ------------------------------
        allowed_tech = set(available_tech_stack)
        allowed_cap = set(available_capability)
        allowed_lang = set(available_language)
        merged_tech = [
            t for t in list(dict.fromkeys(rule_tech + emb_tech))
            if t in allowed_tech
        ]
        merged_cap = [
            c for c in list(dict.fromkeys(rule_cap + emb_cap))
            if c in allowed_cap
        ]
        merged_lang = [
            l for l in list(dict.fromkeys(rule_lang + emb_lang))
            if l in allowed_lang
        ]

        return ClassifyResult(
            tech_stack=merged_tech,
            capability=merged_cap,
            language=merged_lang,
            elapsed_s=time.monotonic() - t0,
            error=embed_error,
        )
