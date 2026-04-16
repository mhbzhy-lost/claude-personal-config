---
name: fastapi-auth
description: "OAuth2 密码流与 JWT Bearer token、密码哈希、API Key 认证、安全方案组合、当前用户依赖链"
tech_stack: [fastapi]
---

# FastAPI Auth -- 认证与授权

> 来源：https://fastapi.tiangolo.com/tutorial/security/ / https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/ / https://fastapi.tiangolo.com/advanced/security/
> 版本基准：FastAPI 0.115+（Python 3.10+）

## 用途

实现 API 的身份认证和访问控制，包括 OAuth2 密码流 + JWT、API Key 方案，以及基于依赖注入的当前用户获取链。

## 何时使用

- 需要用户登录（用户名/密码换取 token）
- 需要保护端点（只有认证用户可访问）
- 需要基于角色/权限的访问控制
- 需要 API Key 方式认证（适合服务间调用）
- 集成第三方 OAuth2 提供商

## 安装依赖

```bash
pip install pyjwt            # JWT 编解码
pip install "pwdlib[argon2]" # 密码哈希（官方推荐替代 passlib）
```

> 注意：FastAPI 0.115+ 官方文档已从 passlib 迁移到 pwdlib，但 passlib + bcrypt 仍然可用。

## 完整 OAuth2 + JWT 实现

### 1. 数据模型

```python
from pydantic import BaseModel

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: str | None = None

class User(BaseModel):
    username: str
    email: str | None = None
    full_name: str | None = None
    disabled: bool | None = None

class UserInDB(User):
    hashed_password: str
```

### 2. 密码哈希工具

```python
from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()

# 防止计时攻击的 dummy hash
DUMMY_HASH = password_hash.hash("dummypassword")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_hash.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return password_hash.hash(password)
```

### 3. JWT Token 工具

```python
from datetime import datetime, timedelta, timezone
import jwt

SECRET_KEY = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
```

### 4. 安全方案与依赖链

```python
from typing import Annotated
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# 模拟数据库
fake_users_db = {
    "johndoe": {
        "username": "johndoe",
        "full_name": "John Doe",
        "email": "johndoe@example.com",
        "hashed_password": password_hash.hash("secret"),
        "disabled": False,
    }
}

def get_user(db: dict, username: str) -> UserInDB | None:
    if username in db:
        return UserInDB(**db[username])
    return None

def authenticate_user(db: dict, username: str, password: str) -> UserInDB | bool:
    user = get_user(db, username)
    if not user:
        # 防止计时攻击：即使用户不存在也要执行哈希验证
        verify_password(password, DUMMY_HASH)
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str | None = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except InvalidTokenError:
        raise credentials_exception
    user = get_user(fake_users_db, username=token_data.username)
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

# 创建可复用的类型别名
CurrentUser = Annotated[User, Depends(get_current_active_user)]
```

### 5. 路由端点

```python
from fastapi import FastAPI
from fastapi.security import OAuth2PasswordRequestForm

app = FastAPI()

@app.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
):
    user = authenticate_user(fake_users_db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return Token(access_token=access_token, token_type="bearer")

@app.get("/users/me", response_model=User)
async def read_users_me(current_user: CurrentUser):
    return current_user

@app.get("/users/me/items")
async def read_own_items(current_user: CurrentUser):
    return [{"item_id": "Foo", "owner": current_user.username}]
```

## API Key 认证

### Header 方式

```python
from fastapi import FastAPI, Security, HTTPException, status
from fastapi.security import APIKeyHeader

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=True)

API_KEYS = {"valid-api-key-1", "valid-api-key-2"}

async def verify_api_key(api_key: Annotated[str, Security(api_key_header)]):
    if api_key not in API_KEYS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid API Key",
        )
    return api_key

app = FastAPI()

@app.get("/data", dependencies=[Security(verify_api_key)])
async def get_data():
    return {"data": "secret"}
```

### Query 参数方式

```python
from fastapi.security import APIKeyQuery

api_key_query = APIKeyQuery(name="api_key", auto_error=False)

async def verify_api_key(
    api_key: Annotated[str | None, Security(api_key_query)],
):
    if not api_key or api_key not in API_KEYS:
        raise HTTPException(status_code=403, detail="Invalid API Key")
    return api_key
```

### 多方案组合（Header 或 Query）

```python
from fastapi.security import APIKeyHeader, APIKeyQuery

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
api_key_query = APIKeyQuery(name="api_key", auto_error=False)

async def verify_api_key(
    header_key: Annotated[str | None, Security(api_key_header)],
    query_key: Annotated[str | None, Security(api_key_query)],
):
    api_key = header_key or query_key
    if not api_key or api_key not in API_KEYS:
        raise HTTPException(status_code=403, detail="Invalid API Key")
    return api_key
```

## OAuth2 Scopes（权限范围）

```python
from fastapi.security import OAuth2PasswordBearer, SecurityScopes

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="token",
    scopes={
        "items:read": "读取商品",
        "items:write": "创建/修改商品",
        "users:read": "读取用户信息",
        "admin": "管理员权限",
    },
)

async def get_current_user(
    security_scopes: SecurityScopes,
    token: Annotated[str, Depends(oauth2_scheme)],
):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={
            "WWW-Authenticate": f'Bearer scope="{security_scopes.scope_str}"'
        },
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        token_scopes = payload.get("scopes", [])
    except InvalidTokenError:
        raise credentials_exception

    # 检查 token 是否包含所需的 scopes
    for scope in security_scopes.scopes:
        if scope not in token_scopes:
            raise HTTPException(status_code=403, detail="Not enough permissions")

    user = get_user(fake_users_db, username)
    if user is None:
        raise credentials_exception
    return user

# 使用 Security 替代 Depends 以声明所需 scopes
@app.get("/items/")
async def read_items(
    user: Annotated[User, Security(get_current_user, scopes=["items:read"])],
):
    return [{"item": "Foo"}]

@app.post("/items/")
async def create_item(
    user: Annotated[User, Security(get_current_user, scopes=["items:write"])],
):
    return {"created": True}
```

## 常见陷阱

- **SECRET_KEY 不要硬编码**：生产环境通过环境变量或 Settings 注入，使用 `openssl rand -hex 32` 生成
- **计时攻击防护**：用户不存在时也要执行一次密码哈希验证（dummy hash），避免通过响应时间判断用户是否存在
- **token 中不要放敏感信息**：JWT payload 只是 Base64 编码，不是加密。只放用户名/ID 和 scopes
- **WWW-Authenticate 头**：401 响应必须包含此头，否则某些客户端和代理会行为异常
- **OAuth2PasswordRequestForm 是 form 数据**：登录端点接收 `application/x-www-form-urlencoded`，不是 JSON
- **auto_error=False 需要手动处理**：设为 False 后依赖返回 None 而非自动 401，必须自行检查
- **passlib 到 pwdlib 的迁移**：FastAPI 0.115+ 官方推荐 pwdlib，但如果项目已用 passlib 且运行正常无需强制迁移

## 组合提示

- 配合 **fastapi-dependencies** 理解认证依赖链的构建方式
- 配合 **fastapi-pydantic** 定义 Token 和 User 模型
- 配合 **fastapi-middleware** 在中间件层添加全局认证
- 配合 **fastapi-testing** 测试受保护的端点（使用 dependency_overrides 跳过认证）
- 配合 **fastapi-core** 通过 Settings 管理 SECRET_KEY 和算法配置
