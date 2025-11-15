中文 | [English](https://github.com/dhd2333/cloudflare-telegrambot/blob/main/Readme_en.md) 

# 消息转发机器人

## 🎉 快速开始

## 📝 项目简介

本项目 Bot 是一个基于 Cloudflare Worker 和 D1 数据库的 Telegram 消息转发机器人，具有丰富的功能，无任何广告。

### 🌟 主要特性

#### 基础功能
- **消息转发**：用户私聊消息自动转发到管理群组话题
- **双向通信**：管理员可在话题内回复用户
- **用户屏蔽**：支持屏蔽和解除屏蔽用户（屏蔽后你不会收到bot转发的对方消息，对方在给你发送消息后会收到当前屏蔽状况如临时或永久屏蔽的提醒）

#### 高级功能
- **话题管理**：为每个用户创建独立的管理话题
- **消息编辑同步**：用户和管理员的消息编辑实时同步
- **媒体组处理**：支持照片、视频等媒体组的逐条转发
- **消息频率限制**：防止用户过于频繁发送消息
- **联系人卡片**：自动展示用户头像（如有）和直接联系方式
- **广播功能**：向所有活跃用户发送通知
- **验证码**：第一次开启聊天时，可以进行验证，通过后才允许发送消息，超过次数即屏蔽

> 💡 **D1 版本优势**：D1 每天有 100,000 次写入配额（是 KV 的 100 倍），几乎不可能用尽

#### 技术特点
- **零成本部署**：基于 Cloudflare Worker，完全免费
- **无需域名**：使用 Worker 自带域名
- **全球CDN**：依托 Cloudflare 网络，全球低延迟
- **数据持久化**：使用 D1 SQL 数据库，数据永不丢失
- **高可用性**：无服务器架构，99.9% 可用性

## 📊 D1 vs KV 

| 对比项 | KV（已停更） | D1 |
|--------|---------------------|---------------------|
| **数据库类型** | Cloudflare KV (键值存储) | Cloudflare D1 (SQLite) |
| **读取配额** | 100,000/天 | 5,000,000/天 |
| **写入配额** | 1,000/天 ⚠️ | 100,000/天 ✅ |
| **存储空间** | 1GB | 5GB |
| **查询能力** | 简单键值查询 | SQL 复杂查询 |
| **数据结构** | 扁平键值对 | 关系型表结构 |
| **初始化方式** | 一键部署即用 | 需一键初始化数据库 |
| **存储用尽提醒** | ✅ 有（容易达到限制） | ❌ 无（几乎不可能用尽） |
| **适用场景** | 小规模用户 | 中大规模用户 |


## 🚀 自建教程

### 前期准备

1. **获取 Bot Token**
   - 访问 [@BotFather](https://t.me/BotFather)
   - 发送 `/newbot` 创建机器人
   - 按提示设置机器人名称和用户名
   - 保存生成的 Token

2. **获取用户 ID**
   - 访问 [@username_to_id_bot](https://t.me/username_to_id_bot)
   - 获取你的用户 ID（管理员 ID）

3. **创建管理群组**
   - 创建一个新的 Telegram 群组
   - 将机器人添加到群组并设为管理员
   - 在群组设置中启用 "话题(Topics)" 功能
   - 获取群组 ID（可通过 [@username_to_id_bot](https://t.me/username_to_id_bot) 获取）

4. **生成密钥**
   - 访问 [UUID Generator](https://www.uuidgenerator.net/)
   - 生成一个随机 UUID 作为 webhook 密钥，或自定义你自己的密钥（如显示unallowed characters可换自定义）

### 部署步骤

1. **登录 Cloudflare**
   - 访问 [Cloudflare](https://dash.cloudflare.com/)
   - 登录你的 Cloudflare 账户

2. **创建 D1 数据库**
   - 在左侧菜单找到 "存储和数据库" → "D1"
   - 点击 "创建数据库"
   - 数据库名称设为 `horr`
   - 点击创建

3. **创建 Worker**
   - 点击 "Workers"-"Workers and Pages"
   - 点击 "创建"
   - 选择 "从 Hello World! 开始" 模板
   - 为你的 Worker 命名

4. **配置环境变量**

在 Worker 的 设置 → 变量和机密 中添加以下变量：

**必填变量（前期准备中四项）：**
- `ENV_BOT_TOKEN`：你的 Bot Token
- `ENV_BOT_SECRET`：生成的 UUID 密钥
- `ENV_ADMIN_UID`：管理员用户 ID
- `ENV_ADMIN_GROUP_ID`：管理群组 ID

**选填变量：**
- `ENV_WELCOME_MESSAGE`：欢迎消息，自行修改，默认为 欢迎使用机器人
- `ENV_MESSAGE_INTERVAL`：消息间隔限制秒数，默认为 1。-1为不限制
- `ENV_DELETE_TOPIC_AS_BAN`：删除话题视为永久封禁（true/false，不区分大小写），默认为 false。false 时只会删除话题，对方只需要再发送一次消息即可再次新建话题
- `ENV_ENABLE_VERIFICATION`：是否开启验证码功能（true/false，不区分大小写）。会在第一次开启聊天时自动发送
- `ENV_VERIFICATION_MAX_ATTEMPTS`: 验证码最大尝试次数，默认为 10

5. **创建并绑定 D1 数据库**
   - 在 Worker 的 设置 → 绑定 中添加绑定：
     - Variable name: `D1`（⚠️ 必须是大写 `D1`）
     - D1 database: `horr`

6. **部署代码**
   - 点击右上角 "编辑代码"
   - 将 [worker.js](./worker.js) 的内容复制到编辑器中（必须先填入变量，否则会无法部署）
   - 点击 "部署"

7. **初始化数据库表**
   - 访问 `https://your-worker-name.your-account.workers.dev/initDatabase`（访问自己的 `https://xxx.xxx.workers.dev/initDatabase` ，不是复制）
   - 看到 **"✅ Database tables initialized successfully"** 表示数据库初始化成功
   - 💡 **无需手动执行 SQL**：这个端点会自动创建所有必要的表和索引

8. **注册 Webhook**
   - 访问 `https://your-worker-name.your-account.workers.dev/registerWebhook`（访问自己的 `https://xxx.xxx.workers.dev/registerWebhook` ，不是复制）
   - 看到有 `"ok": true ` 表示注册成功

## 📖 使用指南

### 用户使用

1. **开始对话**
   - 用户发送 `/start` 给机器人

2. **发送消息**
   - 用户发送的所有消息都会转发到管理群组的专属话题
   - 支持文本、图片、视频、文件等各种类型消息
   - 支持消息编辑，编辑后的内容会同步到管理群组

### 管理员使用

1. **回复用户**
   - 在管理群组的用户话题中直接回复
   - 支持回复用户的特定消息
   - 支持发送各种类型的消息和媒体

2. **管理命令**（命令不会被转发给对方）
   - `/clear`：清理当前话题（删除话题和相关数据，不会屏蔽用户）
   - `/block`：屏蔽用户（在相应话题内直接使用）
   - `/unblock`：解除屏蔽（在相应话题内直接使用，或后面加对方ID，可通过checkblock查询）
   - `/checkblock`：检查用户屏蔽状态（在相应话题内直接使用），展示屏蔽状态列表（在 general 话题中使用）
   - `/broadcast`：广播消息（回复要广播的消息后使用，广播的消息不会出现在话题聊天中，由机器人直接发送给对方）
   - `/del`：删除对方与机器人的消息（回复你需要删除的消息使用），仅48小时内的消息生效，超出即使提示生效也不会生效

3. **话题管理**（另一种封禁/屏蔽方式，更便捷，无需输入）
   - 关闭话题：用户无法发送消息，即临时屏蔽
   - 重新打开话题：用户可以继续发送消息，即解除临时屏蔽
   - 删除话题：根据变量`ENV_DELETE_TOPIC_AS_BAN`决定是否永久封禁用户

## 🔧 配置详解

### 消息频率限制

- 防止用户过于频繁发送消息
- 通过 `ENV_MESSAGE_INTERVAL` 设置间隔时间（秒）
- 超出限制的消息会被拒绝并提示等待时间

### 数据管理

- 所有数据存储在 Cloudflare D1 中
- 包括用户信息、消息映射、话题状态等
- 数据永久保存，不会丢失

## 🛠️ 故障排除

### 常见问题

1. **机器人无响应**
   - 检查 Worker 是否正常运行
   - 确认 Webhook 是否注册成功
   - 检查环境变量是否正确配置

2. **话题创建失败**
   - 确认管理群组已启用话题功能
   - 检查机器人是否有管理员权限
   - 确认 `ENV_ADMIN_GROUP_ID` 配置正确

3. **消息转发失败**
   - 检查 D1 数据库是否正确绑定（变量名必须是大写 `D1`）
   - 确认用户未被屏蔽
   - 检查话题是否被删除或关闭

4. **数据库初始化失败**
   - 确保访问了 `/initDatabase` 端点
   - 检查 D1 数据库是否已创建
   - 查看 Worker 日志获取详细错误信息

### 日志查看

- 在 Cloudflare Workers 控制台查看实时日志
- 日志包含详细的错误信息和调试信息
- 可用于排查问题和监控运行状态

## 💾 D1 数据库说明

### 数据表结构

Worker 会自动创建以下 6 张表：

| 表名 | 用途 |
|------|------|
| `users` | 存储用户信息和话题 ID |
| `message_mappings` | 存储消息映射关系 |
| `topic_status` | 存储话题状态（开启/关闭/删除） |
| `user_states` | 存储用户状态（如送达提示记录等） |
| `blocked_users` | 存储被封禁的用户 |
| `message_rates` | 存储消息频率限制记录 |

### 配额优势

| 项目 | KV 免费版 | D1 免费版 | 提升倍数 |
|------|----------|----------|---------|
| **读取** | 100,000/天 | 5,000,000/天 | **50倍** ⬆️ |
| **写入** | 1,000/天 ⚠️ | 100,000/天 ✅ | **100倍** ⬆️ |
| **存储** | 1GB | 5GB | **5倍** ⬆️ |

### 数据管理

- 在 Cloudflare Dashboard 的 D1 控制台可以查看数据
- 支持执行 SQL 查询进行数据统计
- 可使用 Wrangler CLI 导出备份数据

## 🙏 致谢

- [telegram-bot-cloudflare](https://github.com/cvzi/telegram-bot-cloudflare) - 基础架构参考
- Cloudflare Workers 团队 - 提供优秀的无服务器平台
- Telegram Bot API - 提供强大的机器人开发接口

**注意**：本项目仅供学习和研究使用，请遵守相关法律法规和平台使用条款。如有bug可以 [tg联系]( https://t.me/horrorself_bot ) 进行反馈
