# 消息转发机器人

## 🎉 快速开始


## 📝 项目简介

本项目 Bot 是一个基于 Cloudflare Worker 的 Telegram 消息转发机器人，具有丰富的功能。

### 🌟 主要特性

#### 基础功能
- **消息转发**：用户私聊消息自动转发到管理群组话题
- **双向通信**：管理员可在话题内回复用户
- **用户屏蔽**：支持屏蔽和解除屏蔽用户

#### 高级功能
- **话题管理**：为每个用户创建独立的管理话题
- **消息编辑同步**：用户和管理员的消息编辑实时同步
- **媒体组处理**：支持照片、视频等媒体组的逐条转发（ Cloudflare 版不使用媒体组转发功能，因为它容易引发 KV 存储的并发锁竞争、消息重复发送、部分消息丢失等复杂问题，需要大量的重试机制、原子操作和错误处理逻辑来保证数据一致性，维护成本极高且容易出现竞态条件。）
- **消息频率限制**：防止用户过于频繁发送消息
- **联系人卡片**：自动展示用户头像和联系方式（如有）
- **广播功能**：向所有活跃用户发送通知
- **kv存储用尽提醒**：kv每日资源用尽后若有人发送消息，会向管理员发送提醒，防止漏掉消息

#### 技术特点
- **零成本部署**：基于 Cloudflare Worker，完全免费
- **无需域名**：使用 Worker 自带域名
- **全球CDN**：依托 Cloudflare 网络，全球低延迟
- **数据持久化**：使用 Worker KV 存储，数据永不丢失
- **高可用性**：无服务器架构，99.9% 可用性

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

2. **创建 Worker**
   - 点击 "Workers"-"Workers and Pages"
   - 点击 "创建"
   - 选择 "从 Hello World! 开始" 模板
   - 为你的 Worker 命名


3. **配置环境变量**
   
   在 Worker 的 设置 → 变量和机密 中添加以下变量：
   
   **必填变量（前期准备中四项）：**
   - `ENV_BOT_TOKEN`：你的 Bot Token
   - `ENV_BOT_SECRET`：生成的 UUID 密钥
   - `ENV_ADMIN_UID`：管理员用户 ID
   - `ENV_ADMIN_GROUP_ID`：管理群组 ID
   
   **选填变量：**
   - `ENV_WELCOME_MESSAGE`：欢迎消息，自行修改，默认为 欢迎使用机器人
   - `ENV_MESSAGE_INTERVAL`：消息间隔限制秒数，默认为 1。-1为不限制
   - `ENV_DELETE_TOPIC_AS_BAN`：删除话题视为永久封禁（true/false），默认为 false。false 时只会删除话题，对方只需要再发送一次消息即可再次新建话题

4. **创建并绑定 KV 数据库**
   - 在 Cloudflare 控制台中创建一个 KV Namespace（存储和数据库 - KV）
   - 名称设为 `horr`
   - 回到步骤 2 创建的 Worker 中绑定 - 添加绑定 KV：
     - Variable name: `horr`
     - KV namespace: `horr`

5. **部署代码**
   - 点击右上角 "编辑代码"
   - 将 [worker.js](./worker.js) 的内容复制到编辑器中（必须先填入变量，否则会无法部署）
   - 点击 "部署"

6. **注册 Webhook**
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
   - `/block`：屏蔽用户（回复机器人消息使用）
   - `/unblock`：解除屏蔽（回复机器人消息使用）
   - `/checkblock`：检查用户屏蔽状态（回复机器人消息使用）
   - `/broadcast`：广播消息（回复要广播的消息后使用，广播的消息不会出现在话题聊天中，由机器人直接发送给对方）

3. **话题管理**（另一种封禁/屏蔽方式，更便捷，无需输入）
   - 关闭话题：用户无法发送消息，即屏蔽
   - 重新打开话题：用户可以继续发送消息，即解除屏蔽
   - 删除话题：根据变量`ENV_DELETE_TOPIC_AS_BAN`决定是否永久封禁用户


## 🔧 配置详解


### 消息频率限制

- 防止用户过于频繁发送消息
- 通过 `ENV_MESSAGE_INTERVAL` 设置间隔时间（秒）
- 超出限制的消息会被拒绝并提示等待时间

### 数据管理

- 所有数据存储在 Cloudflare KV 中
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
   - 检查 KV 数据库是否正确绑定
   - 确认用户未被屏蔽
   - 检查话题是否被删除或关闭

### 日志查看

- 在 Cloudflare Workers 控制台查看实时日志
- 日志包含详细的错误信息和调试信息
- 可用于排查问题和监控运行状态

## 🙏 致谢

- [telegram-bot-cloudflare](https://github.com/cvzi/telegram-bot-cloudflare) - 基础架构参考
- [nfd](https://github.com/LloydAsp/nfd) - 思路参考 & README参考
- Cloudflare Workers 团队 - 提供优秀的无服务器平台
- Telegram Bot API - 提供强大的机器人开发接口
  
**注意**：本项目仅供学习和研究使用，请遵守相关法律法规和平台使用条款。本项目由本人使用cursor——Claude-4-sonnet花了两小时编写+三小时调试功能。
