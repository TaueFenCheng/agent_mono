# JWT Guard 作用域说明

## 1. `APP_GUARD` 是什么

```ts
import { APP_GUARD } from "@nestjs/core";

providers: [
  {
    provide: APP_GUARD,
    useClass: JwtAuthGuard
  }
]
```

这段配置表示：把 `JwtAuthGuard` 注册为**全局 Guard**。

效果：

1. 每个请求进入 Controller 前都会先执行 `JwtAuthGuard.canActivate()`。
2. 通过校验后才会进入具体路由方法。
3. 未通过通常返回 `401 Unauthorized`。
4. 标记了 `@Public()` 的路由可在 Guard 内放行。

## 2. 只给某一个 Controller 增加权限

如果你不想全局生效，而是只限制某个 Controller，可以用局部 Guard：

```ts
import { Controller, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";

@UseGuards(JwtAuthGuard)
@Controller("v1/admin")
export class AdminController {}
```

效果：只有 `AdminController` 下的路由要求 JWT。

## 3. 在某个 Controller 上做更细权限（角色）

推荐做法：

1. `JwtAuthGuard` 负责认证（你是谁）
2. `RolesGuard` 负责授权（你能做什么）

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Controller("v1/mcp")
export class McpController {}
```

这样可以做到：

1. 必须先登录（有合法 token）
2. 还要满足指定角色（例如 `admin`）

## 4. 两种常见架构选择

1. 全局 JWT + 局部角色控制（推荐）
- 保留 `APP_GUARD` 做全局登录校验
- 仅在敏感 Controller 叠加 `RolesGuard`

2. 仅局部 JWT
- 移除 `APP_GUARD`
- 在需要保护的 Controller 上单独加 `@UseGuards(JwtAuthGuard)`
