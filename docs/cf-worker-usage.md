# Cloudflare Worker 使用说明

本文档介绍如何部署并使用仓库中的 Cloudflare Worker，用于生成和轮换 token、更新管理员邮箱/发件人邮箱，并将 JSON 数据上传/下载到同一个 KV 命名空间中。当前实现采用可重用 token 语义：token 生成后在轮换周期内可重复使用，执行上传、修改邮箱等操作都不会使其失效；只有手动轮换或到达轮换周期自动轮换后，旧 token 才会失效。

## 1. 部署前准备

### 1.1 依赖

- Node.js
- Wrangler CLI
- 一个 Cloudflare 账户

### 1.2 安装依赖

在 [server](../server) 目录下执行：

```bash
cd server
npm install
```

## 2. 配置 KV

当前 Worker 使用同一个 KV 命名空间 `DESC_DATA` 存储以下内容：

- `admin_email`：管理员邮箱
- `resend_api_key`：Resend 平台 API Key
- `resend_from`：Resend 发件人地址
- `token_hash`：当前有效 token 的 SHA-256 哈希
- `token_replace_time`：当前 token 的生成/更新时间
- `token_rotate_days`：自动轮换 token 的间隔天数（建议至少 30）
- `admin_email_change_code`：待验证的管理员邮箱变更验证码（6 位数字，变更成功后自动清除）
- `admin_email_change_code_time`：验证码生成时间，用于过期判断和发送频控
- `cors_origin`：可选，CORS 允许的来源，默认 `*`（如需限定可设为如 `https://panel.example.com`）
- `data:{type}:{data}`：上传的 JSON 数据，键名格式示例：`data:item:123`

### 2.1 创建 KV 命名空间

在 Cloudflare Dashboard 中创建一个 KV 命名空间，然后将其 ID 写入 [server/wrangler.jsonc](../server/wrangler.jsonc) 的 `kv_namespaces` 配置中。

### 2.2 写入初始配置

本地或部署后可使用 Wrangler 写入 KV：

```bash
cd server
npx wrangler kv key put "admin_email" "your@mail.com" --binding=DESC_DATA --remote
npx wrangler kv key put "resend_api_key" "re_xxx" --binding=DESC_DATA --remote
npx wrangler kv key put "resend_from" "no-reply@yourdomain.com" --binding=DESC_DATA --remote
npx wrangler kv key put "token_rotate_days" "30" --binding=DESC_DATA --remote
```

## 3. 部署 Worker

在 [server](../server) 目录下执行：

```bash
npx wrangler deploy
```

部署成功后会得到 Worker 的访问地址，例如：

```text
https://your-worker.your-subdomain.workers.dev
```

## 4. API 接口说明

下面的接口均基于 Worker 的根地址。

### 4.0 通用约定

- 除下载接口外，成功时返回 HTTP `200`，响应体为 `{"success": true, "message": "..."}`
- 失败时返回对应的 4xx/5xx 状态码，响应体为 `{"error": "错误描述"}`
- 写接口（`change-admin-email`、`change-from-email`、`upload-id`）按客户端滑动窗口限流：优先按客户端 IP（`CF-Connecting-IP`，回退 `x-forwarded-for`），IP 不可用时退化为按 token；邮箱变更类接口每 60 秒最多 5 次，上传接口每 60 秒最多 60 次，超出返回 `429`
- 请求体大小限制为 16MB，超出返回 `413`
- `data` 标识长度不得超过 200 字节且不能包含控制字符，超出返回 `400`
- 所有接口均返回 CORS 响应头；预检 `OPTIONS` 请求返回 `204`，允许来源默认为 `*`，可通过 KV 键 `cors_origin` 配置
- 写操作会输出结构化审计日志（含事件类型、时间、IP 等字段），可在 Cloudflare Workers Logs / `wrangler tail` 中追溯
- 状态码含义：

| 状态码 | 含义 |
| --- | --- |
| `400` | 参数缺失或格式错误 |
| `403` | token 无效、未生成或已被轮换；管理员邮箱变更验证码无效或已过期 |
| `404` | 请求的资源不存在（下载） |
| `413` | 请求体超过 16MB 限制 / 上传 payload 超过 8MB 限制 |
| `429` | 操作过于频繁（写接口限流 / 发送验证码 / 轮换 token 限流） |
| `500` | KV 中缺少必需配置（生成 token） |
| `502` | 邮件发送失败（生成 token、发送验证码，响应体附带 `details` 字段） |

### 4.1 生成并发送 token

请求：

```http
POST /api/generate-reset-hash
```

作用：

- 生成一个新的随机 token
- 计算 SHA-256 哈希并写入 KV
- 更新 `token_replace_time`
- 通过 Resend 向管理员邮箱发送 token
- 若当前存在未轮换的 token，需要提供该旧 token 才能完成轮换
- 轮换后旧 token 立即失效；新 token 在轮换周期内可重复使用

请求体（可选）：

```json
{
  "token": "your-token"
}
```

参数说明：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `token` | string | 否 | 旧 token。当前 token 未过期时需提供才能完成轮换，也支持字段名 `old_token`；缺失或验证失败将返回 403 |

成功响应：

```json
{
  "success": true,
  "message": "Reset hash generated and sent to the admin email"
}
```

### 4.2 更改管理员邮箱

更改管理员邮箱需要两步：先向当前管理员邮箱发送验证码，再携带该验证码提交变更。

#### 4.2.1 发送验证码

请求：

```http
POST /api/send-admin-email-change-code
Content-Type: application/json
```

请求体：

```json
{
  "token": "your-token"
}
```

说明：

- 验证码为 6 位数字，会发送到当前管理员邮箱（`admin_email`）
- 验证码 10 分钟内有效，变更成功后立即失效
- 同一验证码 1 分钟内不可重复发送（返回 `429`）

参数说明：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `token` | string | 是 | 当前有效 token |

成功响应：

```json
{
  "success": true,
  "message": "Verification code sent to the current admin email"
}
```

#### 4.2.2 提交邮箱变更

请求：

```http
POST /api/change-admin-email
Content-Type: application/json
```

请求体：

```json
{
  "token": "your-token",
  "new_admin_email": "new-admin@example.com",
  "code": "123456"
}
```

说明：

- `code` 为发送到当前管理员邮箱的验证码，验证通过后才会更新邮箱
- 验证码错误或已过期将返回 `403`
- 验证码使用后立即清除，不可重复使用
- 成功执行后，当前 token 仍然有效，可在轮换周期内继续使用

参数说明：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `token` | string | 是 | 当前有效 token |
| `new_admin_email` | string | 是 | 新的管理员邮箱，须为合法邮箱格式（如 `name@domain.com`） |
| `code` | string | 是 | 发送到当前管理员邮箱的验证码（6 位数字） |

成功响应：

```json
{
  "success": true,
  "message": "Admin email updated"
}
```

### 4.3 更改发件人邮箱

请求：

```http
POST /api/change-from-email
Content-Type: application/json
```

请求体：

```json
{
  "token": "your-token",
  "new_from_email": "no-reply@newdomain.com"
}
```

说明：

- 成功执行后，当前 token 仍然有效，可在轮换周期内继续使用
- 该接口可多次调用，直到 token 被轮换

参数说明：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `token` | string | 是 | 当前有效 token |
| `new_from_email` | string | 是 | 新的发件人邮箱，须为合法邮箱格式（如 `name@domain.com`） |

成功响应：

```json
{
  "success": true,
  "message": "Sender email updated"
}
```

### 4.4 上传 JSON 数据

请求：

```http
POST /api/upload-id
Content-Type: application/json
```

请求体：

```json
{
  "token": "your-token",
  "type": "item",
  "data": "123",
  "payload": {
    "name": "demo",
    "version": 1
  }
}
```

说明：

- `type` 支持 `item`、`buff`、`actor`
- 上传内容会被压缩为最小化 JSON 并保存到 KV
- 保存键名格式为 `data:{type}:{data}`
- `payload` 序列化后的字节数不得超过 8MB，超出返回 `413`
- `data` 标识长度不得超过 200 字节且不能包含控制字符，超出返回 `400`
- 成功上传后，当前 token 仍然有效，可在轮换周期内继续使用

参数说明：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `token` | string | 是 | 当前有效 token |
| `type` | string | 是 | 数据类型，`item`、`buff`、`actor` 三选一；也可通过 URL 查询参数 `?type=` 提供 |
| `data` | string | 是 | 数据唯一标识，会作为 KV 键名的一部分；长度不超过 200 字节且不含控制字符 |
| `payload` | object | 是 | 要保存的数据，须为可被 JSON 序列化的对象 |

成功响应：

```json
{
  "success": true,
  "message": "item 123 saved"
}
```

### 4.5 下载 JSON 数据

请求：

```http
GET /api/download?type=item&data=123
```

查询参数说明：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | string | 是 | 数据类型，`item`、`buff`、`actor` 三选一 |
| `data` | string | 是 | 数据唯一标识，对应上传时的 `data`；长度不超过 200 字节且不含控制字符 |

响应：

- 成功时返回 HTTP `200`，响应体为保存的原始 JSON 内容
- `Content-Type: application/json`
- 未找到对应数据时返回 HTTP `404`：

```json
{
  "error": "item 123 not found"
}
```

## 5. 自动轮换 token

Worker 配置了 cron 触发器，默认每天 03:00 执行一次检查。

逻辑如下：

- 读取 KV 中的 `token_rotate_days`
- 若当前时间距离 `token_replace_time` 超过该天数，则自动生成一个新 token
- 生成的新 token 会重新写入 KV，并通过邮箱发送给管理员
- 轮换后旧 token 立即失效；新 token 在轮换周期内可重复使用

### 5.1 修改轮换周期

在 KV 中设置：

```bash
npx wrangler kv key put "token_rotate_days" "60" --binding=DESC_DATA --remote
```

说明：

- 轮换周期最小为 30 天
- 若配置值小于 30，会自动按 30 天处理

## 6. 示例请求

### 6.1 生成 token

```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/api/generate-reset-hash
```

### 6.2 上传数据

```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/api/upload-id \
  -H "Content-Type: application/json" \
  -d '{
    "token": "your-token",
    "type": "item",
    "data": "123",
    "payload": {"name":"demo"}
  }'
```

### 6.3 下载数据

```bash
curl https://your-worker.your-subdomain.workers.dev/api/download?type=item&data=123
```

## 7. 常见问题

### 7.1 邮件发送失败

检查以下 KV 项是否已正确配置：

- `admin_email`
- `resend_api_key`
- `resend_from`

### 7.2 访问接口返回 403

通常是因为：

- token 未生成
- token 已被轮换（手动或自动轮换），提供的仍是旧 token
- 提供的 token 与当前 KV 中的 `token_hash` 不匹配

### 7.3 下载接口返回 404

说明对应的资源还未上传过，或者键名与当前 `type/id` 不匹配。

### 7.4 可重用 token 的安全提示

由于 token 在轮换周期内可重复使用，任何获取到 token 的人都可以持续上传/下载数据。请通过邮箱妥善保管 token，必要时可手动轮换或缩短 `token_rotate_days` 以降低风险。
