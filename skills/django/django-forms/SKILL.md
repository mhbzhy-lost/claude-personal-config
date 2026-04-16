---
name: django-forms
description: "Django Form/ModelForm、字段验证、Widget 定制、Formset 与文件上传"
tech_stack: [django]
---

# Django Forms（表单系统）

> 来源：https://docs.djangoproject.com/en/5.1/topics/forms/
> 版本基准：Django 5.1+

## 用途
处理 HTML 表单的渲染、数据验证和清洗，提供安全的用户输入处理机制。

## 何时使用
- 接收和验证用户输入
- 从模型自动生成表单（ModelForm）
- 批量处理同类表单（Formset）
- 自定义字段渲染（Widget）
- 文件上传处理

## Form 基础

### 定义表单

```python
from django import forms

class ContactForm(forms.Form):
    name = forms.CharField(max_length=100, label="姓名")
    email = forms.EmailField(label="邮箱")
    subject = forms.CharField(max_length=200)
    message = forms.CharField(widget=forms.Textarea, label="消息")
    cc_myself = forms.BooleanField(required=False, label="抄送给自己")
```

### 视图中使用

```python
from django.shortcuts import render, redirect

def contact(request):
    if request.method == "POST":
        form = ContactForm(request.POST)
        if form.is_valid():
            # form.cleaned_data 包含验证后的 Python 对象
            name = form.cleaned_data["name"]
            email = form.cleaned_data["email"]
            send_email(name, email, form.cleaned_data["message"])
            return redirect("contact-success")
    else:
        form = ContactForm()
    return render(request, "contact.html", {"form": form})
```

### 模板渲染

```html
<form method="post" enctype="multipart/form-data">
    {% csrf_token %}

    <!-- 方式一：自动渲染 -->
    {{ form.as_div }}    {# Django 5.0+ 推荐 #}
    {{ form.as_p }}
    {{ form.as_table }}

    <!-- 方式二：逐字段渲染 -->
    {{ form.non_field_errors }}
    {% for field in form %}
        <div class="field-wrapper">
            {{ field.errors }}
            {{ field.label_tag }}
            {{ field }}
            {% if field.help_text %}
                <small>{{ field.help_text }}</small>
            {% endif %}
        </div>
    {% endfor %}

    <!-- 方式三：精确控制 -->
    <div>
        {{ form.name.label_tag }}
        {{ form.name }}
        {{ form.name.errors }}
    </div>

    <button type="submit">提交</button>
</form>
```

## 常用字段类型

| 字段类型 | HTML Widget | 用途 |
|----------|-------------|------|
| `CharField` | `TextInput` | 单行文本 |
| `EmailField` | `EmailInput` | 邮箱 |
| `URLField` | `URLInput` | URL |
| `IntegerField` | `NumberInput` | 整数 |
| `FloatField` | `NumberInput` | 浮点数 |
| `DecimalField` | `NumberInput` | 精确小数 |
| `BooleanField` | `CheckboxInput` | 复选框 |
| `DateField` | `DateInput` | 日期 |
| `DateTimeField` | `DateTimeInput` | 日期时间 |
| `ChoiceField` | `Select` | 下拉选择 |
| `MultipleChoiceField` | `SelectMultiple` | 多选 |
| `TypedChoiceField` | `Select` | 带类型转换的选择 |
| `FileField` | `ClearableFileInput` | 文件上传 |
| `ImageField` | `ClearableFileInput` | 图片上传 |

### 字段通用参数

```python
field = forms.CharField(
    required=True,               # 是否必填（默认 True）
    label="显示标签",
    initial="默认值",            # 初始显示值（非 POST 数据）
    help_text="帮助文本",
    widget=forms.Textarea,       # 自定义 Widget
    error_messages={"required": "此字段不能为空"},
    validators=[validate_even],  # 额外验证器
    disabled=False,              # 禁用字段
)
```

## ModelForm

### 基本用法

```python
from django import forms
from .models import Article

class ArticleForm(forms.ModelForm):
    class Meta:
        model = Article
        fields = ["title", "content", "tags", "published"]
        # fields = "__all__"    # 所有字段（不推荐，安全隐患）
        # exclude = ["author"]  # 排除字段

        labels = {
            "title": "文章标题",
            "content": "正文内容",
        }
        widgets = {
            "content": forms.Textarea(attrs={"rows": 10, "class": "rich-editor"}),
            "tags": forms.CheckboxSelectMultiple,
        }
        help_texts = {
            "title": "最多 200 个字符",
        }
        error_messages = {
            "title": {"max_length": "标题过长"},
        }
```

### ModelForm 保存

```python
# 直接保存
form = ArticleForm(request.POST)
if form.is_valid():
    article = form.save()  # 保存到数据库并返回实例

# 延迟保存（需要额外赋值）
if form.is_valid():
    article = form.save(commit=False)
    article.author = request.user
    article.save()
    form.save_m2m()  # commit=False 时必须手动保存 M2M

# 更新已有实例
article = Article.objects.get(pk=1)
form = ArticleForm(request.POST, instance=article)
if form.is_valid():
    form.save()
```

## 字段验证

### 验证流程

1. `field.clean()` — 字段级验证（类型转换 + validators）
2. `form.clean_<fieldname>()` — 自定义单字段验证
3. `form.clean()` — 跨字段验证

### 单字段验证（clean_fieldname）

```python
class RegistrationForm(forms.Form):
    username = forms.CharField(max_length=30)
    email = forms.EmailField()
    password = forms.CharField(widget=forms.PasswordInput)
    confirm_password = forms.CharField(widget=forms.PasswordInput)

    def clean_username(self):
        username = self.cleaned_data["username"]
        if User.objects.filter(username=username).exists():
            raise forms.ValidationError("该用户名已被注册")
        return username  # 必须返回 cleaned 值
```

### 跨字段验证（clean）

```python
    def clean(self):
        cleaned_data = super().clean()
        password = cleaned_data.get("password")
        confirm = cleaned_data.get("confirm_password")
        if password and confirm and password != confirm:
            raise forms.ValidationError("两次输入的密码不一致")
        return cleaned_data
```

### 自定义验证器

```python
from django.core.validators import RegexValidator
from django.core.exceptions import ValidationError

def validate_no_profanity(value):
    profanity_list = ["bad", "worse"]
    for word in profanity_list:
        if word in value.lower():
            raise ValidationError(f"内容包含不当用语: {word}")

class CommentForm(forms.Form):
    content = forms.CharField(
        validators=[validate_no_profanity],
    )
    phone = forms.CharField(
        validators=[RegexValidator(r"^\d{11}$", "请输入 11 位手机号")],
    )
```

## Widget 定制

### 设置 HTML 属性

```python
class MyForm(forms.Form):
    name = forms.CharField(
        widget=forms.TextInput(attrs={
            "class": "form-control",
            "placeholder": "请输入姓名",
            "autofocus": True,
        })
    )
    description = forms.CharField(
        widget=forms.Textarea(attrs={
            "rows": 5,
            "cols": 40,
            "class": "form-control",
        })
    )
```

### 常用 Widget

```python
forms.TextInput          # <input type="text">
forms.Textarea           # <textarea>
forms.PasswordInput      # <input type="password">
forms.HiddenInput        # <input type="hidden">
forms.EmailInput         # <input type="email">
forms.NumberInput        # <input type="number">
forms.DateInput          # <input type="date">（可设 type="date"）
forms.Select             # <select>
forms.SelectMultiple     # <select multiple>
forms.RadioSelect        # <input type="radio"> 组
forms.CheckboxInput      # <input type="checkbox">
forms.CheckboxSelectMultiple  # 多个 checkbox
forms.ClearableFileInput # 文件上传（带清除）
```

### ModelForm 中覆盖 Widget

```python
class ArticleForm(forms.ModelForm):
    class Meta:
        model = Article
        fields = ["title", "content", "published"]
        widgets = {
            "content": forms.Textarea(attrs={"class": "markdown-editor"}),
            "published": forms.RadioSelect(choices=[(True, "发布"), (False, "草稿")]),
        }
```

## Formset

### 基本 Formset

```python
from django.forms import formset_factory

ContactFormSet = formset_factory(ContactForm, extra=3, max_num=10)

# 视图
def manage_contacts(request):
    if request.method == "POST":
        formset = ContactFormSet(request.POST)
        if formset.is_valid():
            for form in formset:
                if form.cleaned_data:
                    save_contact(form.cleaned_data)
            return redirect("success")
    else:
        formset = ContactFormSet()
    return render(request, "contacts.html", {"formset": formset})
```

### Model Formset

```python
from django.forms import modelformset_factory

ArticleFormSet = modelformset_factory(
    Article,
    fields=["title", "content"],
    extra=2,
    can_delete=True,
)

formset = ArticleFormSet(queryset=Article.objects.filter(author=request.user))
```

### Inline Formset（关联模型）

```python
from django.forms import inlineformset_factory

ImageFormSet = inlineformset_factory(
    Article,       # 父模型
    Image,         # 子模型
    fields=["file", "caption"],
    extra=3,
    can_delete=True,
)

# 视图中使用
formset = ImageFormSet(request.POST, request.FILES, instance=article)
if formset.is_valid():
    formset.save()
```

## 文件上传处理

```python
class UploadForm(forms.Form):
    file = forms.FileField(label="上传文件")

def upload_view(request):
    if request.method == "POST":
        form = UploadForm(request.POST, request.FILES)  # 注意 request.FILES
        if form.is_valid():
            uploaded_file = request.FILES["file"]
            # uploaded_file.name, uploaded_file.size, uploaded_file.content_type
            handle_uploaded_file(uploaded_file)
            return redirect("success")
    else:
        form = UploadForm()
    return render(request, "upload.html", {"form": form})

def handle_uploaded_file(f):
    with open(f"uploads/{f.name}", "wb+") as dest:
        for chunk in f.chunks():
            dest.write(chunk)
```

**模板必须设置 enctype**：
```html
<form method="post" enctype="multipart/form-data">
    {% csrf_token %}
    {{ form }}
    <button type="submit">上传</button>
</form>
```

## 常见陷阱

- **忘记 request.FILES**：文件上传表单必须传 `request.FILES` 作为第二参数
- **忘记 enctype**：模板 `<form>` 标签缺少 `enctype="multipart/form-data"` 导致文件为空
- **clean_field 不返回值**：`clean_<fieldname>` 必须返回 cleaned 值，否则字段值变为 None
- **commit=False 后忘记 save_m2m()**：ManyToMany 字段不会被保存
- **fields="\_\_all\_\_" 安全风险**：可能暴露不应被用户编辑的字段（如 `is_staff`）
- **Formset management form**：模板中必须渲染 `{{ formset.management_form }}`
- **ModelForm 不验证 unique_together**：需要在 `clean()` 中手动处理或依赖数据库约束

## 组合提示

- 配合 **django-views** 的 CreateView/UpdateView 自动处理 ModelForm
- 配合 **django-models** 理解 ModelForm 的字段映射
- 配合 **django-admin** 中的 Inline 表单集
- 配合 **django-auth** 使用内置认证表单（AuthenticationForm/UserCreationForm）
