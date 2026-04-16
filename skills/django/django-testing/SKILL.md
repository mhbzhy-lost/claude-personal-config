---
name: django-testing
description: "Django 测试：TestCase 体系、Client/RequestFactory、断言、fixture、mock 与 coverage"
tech_stack: [django]
language: [python]
---

# Django Testing（测试体系）

> 来源：https://docs.djangoproject.com/en/5.1/topics/testing/
> 版本基准：Django 5.1+

## 用途
编写和运行 Django 项目的自动化测试，覆盖模型、视图、表单、API 等各层级。

## 何时使用
- 模型业务逻辑验证
- 视图请求/响应测试
- 表单验证逻辑测试
- API 端点集成测试
- 权限和认证流程验证
- 数据库查询正确性检查

## 测试类体系

### SimpleTestCase（不使用数据库）

```python
from django.test import SimpleTestCase

class UtilTests(SimpleTestCase):
    def test_slugify(self):
        from django.utils.text import slugify
        self.assertEqual(slugify("Hello World"), "hello-world")

    def test_template_rendering(self):
        response = self.client.get("/static-page/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Welcome")
```

### TestCase（最常用，事务回滚）

```python
from django.test import TestCase
from myapp.models import Article, Author

class ArticleTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        """类级别数据初始化（所有测试方法共享，只执行一次）"""
        cls.author = Author.objects.create(
            username="testuser",
            email="test@example.com",
        )
        cls.article = Article.objects.create(
            title="Test Article",
            content="Test content",
            author=cls.author,
            status="PB",
        )

    def setUp(self):
        """每个测试方法前执行"""
        self.client.force_login(self.author)

    def test_article_str(self):
        self.assertEqual(str(self.article), "Test Article")

    def test_article_list_view(self):
        response = self.client.get("/articles/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Test Article")
        self.assertQuerySetEqual(
            response.context["articles"],
            [self.article],
        )
```

### TransactionTestCase（真实事务提交）

```python
from django.test import TransactionTestCase
from django.db import IntegrityError

class TransactionTests(TransactionTestCase):
    """用于测试事务行为、select_for_update 等"""

    def test_unique_constraint(self):
        Author.objects.create(username="user1", email="a@b.com")
        with self.assertRaises(IntegrityError):
            Author.objects.create(username="user1", email="c@d.com")

    def test_atomic_rollback(self):
        from django.db import transaction
        try:
            with transaction.atomic():
                Article.objects.create(title="Will be rolled back")
                raise ValueError("Force rollback")
        except ValueError:
            pass
        self.assertEqual(Article.objects.count(), 0)
```

**性能排序**：`SimpleTestCase`（最快） > `TestCase`（快） > `TransactionTestCase`（慢）

## Test Client

### 基本请求

```python
class ViewTests(TestCase):
    def test_get_request(self):
        response = self.client.get("/articles/")
        self.assertEqual(response.status_code, 200)

    def test_post_request(self):
        response = self.client.post("/articles/create/", {
            "title": "New Article",
            "content": "Content here",
        })
        self.assertRedirects(response, "/articles/new-article/")

    # Django 5.1 新增：query_params 参数
    def test_query_params(self):
        response = self.client.get(
            "/articles/",
            query_params={"status": "published", "page": 2},
        )
        # 等价于 GET /articles/?status=published&page=2
        self.assertEqual(response.status_code, 200)

    def test_json_request(self):
        response = self.client.post(
            "/api/articles/",
            data={"title": "API Article", "content": "Via API"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["title"], "API Article")

    def test_file_upload(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        file = SimpleUploadedFile("test.txt", b"file content", content_type="text/plain")
        response = self.client.post("/upload/", {"file": file})
        self.assertEqual(response.status_code, 200)
```

### 认证

```python
class AuthenticatedTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="testuser",
            password="testpass123",
        )

    def test_login(self):
        logged_in = self.client.login(username="testuser", password="testpass123")
        self.assertTrue(logged_in)
        response = self.client.get("/dashboard/")
        self.assertEqual(response.status_code, 200)

    def test_force_login(self):
        """跳过认证直接登录（推荐，更快）"""
        self.client.force_login(self.user)
        response = self.client.get("/dashboard/")
        self.assertEqual(response.status_code, 200)

    def test_logout(self):
        self.client.force_login(self.user)
        self.client.logout()
        response = self.client.get("/dashboard/")
        self.assertRedirects(response, "/login/?next=/dashboard/")
```

### Response 对象

```python
def test_response_attributes(self):
    response = self.client.get("/articles/")

    response.status_code         # HTTP 状态码
    response.content             # 响应体（bytes）
    response.json()              # JSON 解析
    response.context             # 模板上下文
    response.templates           # 使用的模板列表
    response.resolver_match      # URL 解析信息
    response.redirect_chain      # 重定向链（follow=True 时）
    response["Content-Type"]     # 响应头
```

## RequestFactory

直接测试视图函数/类，跳过中间件和 URL 路由。

```python
from django.test import RequestFactory, TestCase

class ViewUnitTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.user = User.objects.create_user(username="test", password="pass")

    def test_article_list_view(self):
        request = self.factory.get("/articles/")
        request.user = self.user  # 手动设置用户（无中间件）

        response = ArticleListView.as_view()(request)
        self.assertEqual(response.status_code, 200)

    def test_article_create_view(self):
        request = self.factory.post("/articles/create/", {
            "title": "Test",
            "content": "Content",
        })
        request.user = self.user

        response = ArticleCreateView.as_view()(request)
        self.assertEqual(response.status_code, 302)
```

## 常用断言

### 内容断言

```python
# 检查响应包含/不包含文本
self.assertContains(response, "Expected Text", count=1, status_code=200)
self.assertNotContains(response, "Should Not Appear", status_code=200)

# HTML 片段检查（语义比较，忽略空白差异）
self.assertInHTML("<p>Hello</p>", response.content.decode())
self.assertNotInHTML("<p>Bad</p>", response.content.decode())  # Django 5.1 新增
```

### 重定向断言

```python
self.assertRedirects(
    response,
    "/expected/url/",
    status_code=302,              # 初始响应码
    target_status_code=200,       # 目标页面响应码
    fetch_redirect_response=True, # 是否跟随重定向
)
```

### 模板断言

```python
self.assertTemplateUsed(response, "articles/list.html")
self.assertTemplateNotUsed(response, "articles/detail.html")
```

### 表单断言

```python
# 检查表单字段错误
self.assertFormError(response.context["form"], "title", ["This field is required."])

# 无字段（non_field_errors）
self.assertFormError(response.context["form"], None, ["密码不匹配"])
```

### QuerySet 断言

```python
self.assertQuerySetEqual(
    Article.objects.filter(status="PB"),
    [self.article1, self.article2],
    ordered=False,
)
```

### 数据库查询数量断言

```python
with self.assertNumQueries(2):
    articles = list(Article.objects.select_related("author").all())
    # 确保只有 2 条 SQL
```

### JSON 断言

```python
self.assertJSONEqual(response.content.decode(), {"status": "ok", "count": 5})
```

## 设置覆盖

```python
from django.test import TestCase, override_settings

class SettingsTests(TestCase):
    @override_settings(LOGIN_URL="/custom/login/")
    def test_custom_login_url(self):
        response = self.client.get("/protected/")
        self.assertRedirects(response, "/custom/login/?next=/protected/")

    def test_with_context_manager(self):
        with self.settings(DEBUG=True):
            # DEBUG=True 生效
            pass

    def test_modify_middleware(self):
        with self.modify_settings(MIDDLEWARE={
            "append": "myapp.middleware.TestMiddleware",
            "remove": "django.middleware.csrf.CsrfViewMiddleware",
        }):
            response = self.client.post("/no-csrf/", {"data": "value"})
```

## Mock

```python
from unittest.mock import patch, MagicMock

class ExternalServiceTests(TestCase):
    @patch("myapp.views.send_notification")
    def test_article_publish_sends_notification(self, mock_send):
        self.client.force_login(self.user)
        response = self.client.post(f"/articles/{self.article.slug}/publish/")

        mock_send.assert_called_once_with(self.article)

    @patch("myapp.services.requests.get")
    def test_external_api_call(self, mock_get):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=lambda: {"data": "mocked"},
        )
        result = fetch_external_data()
        self.assertEqual(result["data"], "mocked")

    def test_mock_timezone(self):
        from django.utils import timezone
        from datetime import datetime
        fixed_time = datetime(2024, 1, 15, 12, 0, tzinfo=timezone.utc)

        with patch("django.utils.timezone.now", return_value=fixed_time):
            article = Article.objects.create(title="Test")
            # article.created_at 不受影响（auto_now_add 使用数据库时间）
```

## 测试标签

```python
from django.test import tag

class MyTests(TestCase):
    @tag("fast")
    def test_quick_check(self):
        ...

    @tag("slow", "integration")
    def test_full_flow(self):
        ...
```

```bash
# 按标签运行
python manage.py test --tag=fast
python manage.py test --tag=integration --exclude-tag=slow
```

## 异步测试

```python
class AsyncTests(TestCase):
    async def test_async_view(self):
        response = await self.async_client.get("/async-endpoint/")
        self.assertEqual(response.status_code, 200)

    async def test_async_model_operation(self):
        article = await Article.objects.acreate(
            title="Async Article",
            content="Created asynchronously",
        )
        self.assertIsNotNone(article.pk)
```

## 运行测试

```bash
# 运行所有测试
python manage.py test

# 运行指定 app 测试
python manage.py test myapp

# 运行指定测试类
python manage.py test myapp.tests.ArticleTests

# 运行指定测试方法
python manage.py test myapp.tests.ArticleTests.test_article_list_view

# 并行运行
python manage.py test --parallel

# 详细输出
python manage.py test --verbosity=2

# 快速失败
python manage.py test --failfast

# 保留测试数据库
python manage.py test --keepdb
```

## Coverage

```bash
# 安装
pip install coverage

# 运行覆盖率测试
coverage run --source="." manage.py test
coverage report -m                    # 终端报告
coverage html                         # HTML 报告

# .coveragerc 配置
```

```ini
# .coveragerc
[run]
source = .
omit =
    */migrations/*
    */tests/*
    manage.py
    */wsgi.py
    */asgi.py

[report]
show_missing = True
fail_under = 80
```

## Fixture 与数据工厂

### setUpTestData（推荐）

```python
class ArticleTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        """类级别，所有测试共享，只运行一次"""
        cls.author = Author.objects.create_user(username="author", password="pass")
        cls.articles = [
            Article.objects.create(title=f"Article {i}", author=cls.author)
            for i in range(5)
        ]
```

### Factory 模式（推荐配合 factory_boy）

```python
# pip install factory-boy
import factory
from myapp.models import Article, Author

class AuthorFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Author

    username = factory.Sequence(lambda n: f"user{n}")
    email = factory.LazyAttribute(lambda obj: f"{obj.username}@example.com")
    password = factory.PostGenerationMethodCall("set_password", "testpass123")

class ArticleFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Article

    title = factory.Sequence(lambda n: f"Article {n}")
    content = factory.Faker("paragraph")
    author = factory.SubFactory(AuthorFactory)
    status = "PB"

# 使用
class ArticleTests(TestCase):
    def test_article_creation(self):
        article = ArticleFactory()
        self.assertIsNotNone(article.pk)
        self.assertEqual(article.status, "PB")

    def test_draft_article(self):
        article = ArticleFactory(status="DF")
        self.assertEqual(article.status, "DF")
```

## 常见陷阱

- **setUpTestData 中的可变对象**：共享数据在测试中被修改会影响其他测试，对 QuerySet 结果需在 setUp 中刷新
- **TransactionTestCase 性能**：比 TestCase 慢约 10 倍，仅在测试事务行为时使用
- **忘记 force_login**：直接用 `client.login()` 需要真实密码，`force_login()` 更简洁
- **assertNumQueries 与缓存**：重复运行可能因 QuerySet 缓存导致查询数不同
- **mock patch 路径**：必须 patch 使用位置而非定义位置（如 `patch("myapp.views.send_email")` 而非 `patch("myapp.utils.send_email")`）
- **auto_now 字段无法 mock**：`auto_now=True` 在数据库层生成，`timezone.now` 的 mock 不影响它
- **测试数据库与生产不同**：SQLite 的类型约束弱于 PostgreSQL，CI 应使用与生产相同的数据库

## 组合提示

- 配合 **django-models** 测试模型方法和信号
- 配合 **django-views** 测试视图响应和权限
- 配合 **django-forms** 测试表单验证逻辑
- 配合 **django-drf** 使用 `APIClient` 测试 REST API
- 配合 **django-orm-advanced** 使用 `assertNumQueries` 验证查询优化
