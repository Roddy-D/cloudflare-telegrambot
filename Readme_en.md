English | [中文](https://github.com/dhd2333/cloudflare-telegrambot/blob/main/Readme.md)

# Message Forwarding Bot

## 🎉 Quick Start

## 📝 Project Introduction

This project is a Telegram message forwarding bot based on Cloudflare Worker and D1 database. It is feature-rich and contains no ads.

### 🌟 Main Features

#### Basic Functions
- **Message Forwarding**: User private chat messages are automatically forwarded to management group topics
- **Two-way Communication**: Admins can reply to users within the topic
- **User Blocking**: Support blocking and unblocking users (when blocked, you won't receive forwarded messages from them, and they will receive a notification about being temporarily or permanently blocked when sending you a message)

#### Advanced Functions
- **Topic Management**: Create a dedicated management topic for each user
- **Message Edit Sync**: Edited messages from both users and admins are synchronized in real time
- **Media Group Handling**: Supports forwarding photos, videos, and other media groups one by one
- **Message Rate Limit**: Prevents users from sending messages too frequently
- **Contact Card**: Automatically displays user avatar (if any) and direct contact info
- **Broadcast Function**: Send notifications to all active users
- **Verification Code**: Verify identity the first time you open a chat. Messages will only be allowed after verification. Exceeding attempts will result in blocking

> 💡 **D1 Version Advantage**: D1 has 100,000 daily write quota (100 times that of KV), making it almost impossible to exhaust

#### Technical Highlights
- **Zero-Cost Deployment**: Fully free, based on Cloudflare Worker
- **No Domain Required**: Uses Worker's built-in domain
- **Global CDN**: Low latency worldwide via Cloudflare's network
- **Data Persistence**: Data is permanently stored in D1 SQL database
- **High Availability**: Serverless architecture with 99.9% uptime

## 📊 D1 vs KV 

| Comparison Item | KV (Discontinued) | D1 |
|--------|---------------------|---------------------|
| **Database Type** | Cloudflare KV (Key-value store) | Cloudflare D1 (SQLite) |
| **Read Quota** | 100,000/day | 5,000,000/day |
| **Write Quota** | 1,000/day ⚠️ | 100,000/day ✅ |
| **Storage Space** | 1GB | 5GB |
| **Query Capability** | Simple key-value queries | SQL complex queries |
| **Data Structure** | Flat key-value pairs | Relational table structure |
| **Initialization Method** | One-click deployment ready | One-click database initialization required |
| **Storage Exhaustion Reminder** | ✅ Yes (easily reached limit) | ❌ No (almost impossible to exhaust) |
| **Use Case** | Small-scale users | Medium to large-scale users |


## 🚀 Self-Hosting Guide

### Preparation

1. **Get Bot Token**
   - Visit [@BotFather](https://t.me/BotFather)
   - Send `/newbot` to create a bot
   - Follow prompts to set bot name and username
   - Save the generated Token

2. **Get User ID**
   - Visit [@username_to_id_bot](https://t.me/username_to_id_bot)
   - Get your User ID (Admin ID)

3. **Create Management Group**
   - Create a new Telegram group
   - Add the bot to the group and set it as admin
   - Enable "Topics" in group settings
   - Get the group ID (via [@username_to_id_bot](https://t.me/username_to_id_bot))

4. **Generate Secret**
   - Visit [UUID Generator](https://www.uuidgenerator.net/)
   - Generate a random UUID as webhook secret, or set your own (if "unallowed characters" appears, choose a custom one)

### Deployment Steps

1. **Log in to Cloudflare**
   - Visit [Cloudflare](https://dash.cloudflare.com/)
   - Log into your account

2. **Create D1 Database**
   - Find "Storage & Database" → "D1" in the left menu
   - Click "Create database"
   - Set database name to `horr`
   - Click create

3. **Create Worker**
   - Click "Workers" → "Workers and Pages"
   - Click "Create"
   - Choose "Start from Hello World!" template
   - Name your Worker

4. **Configure Environment Variables**
   
   In Worker settings → Variables & Secrets, add the following:

   **Required Variables (from Preparation):**
   - `ENV_BOT_TOKEN`: Your Bot Token  
   - `ENV_BOT_SECRET`: The UUID secret  
   - `ENV_ADMIN_UID`: Admin user ID  
   - `ENV_ADMIN_GROUP_ID`: Management group ID  

   **Optional Variables:**
   - `ENV_WELCOME_MESSAGE`: Welcome message, customize as needed, default is "欢迎使用机器人"
   - `ENV_MESSAGE_INTERVAL`: Message interval limit in seconds (default: 1, set -1 for no limit)  
   - `ENV_DELETE_TOPIC_AS_BAN`: Delete topic = permanent ban (true/false, case-insensitive, default: false). When false, only deletes the topic, and the user can send a new message to create a new topic again
   - `ENV_ENABLE_VERIFICATION`: Whether to enable CAPTCHA functionality (true/false, case-insensitive). It will be automatically sent the first time a chat is opened.
   - `ENV_VERIFICATION_MAX_ATTEMPTS`: Maximum CAPTCHA verification attempts (default: 10)

5. **Create & Bind D1 Database**
   - In Worker → Settings → Bindings, add binding:
     - Variable name: `D1`（⚠️ Must be uppercase `D1`）
     - D1 database: `horr`

6. **Deploy Code**
   - Click top-right "Edit Code"
   - Copy [worker.js](./worker.js) into the editor (must configure variables first, otherwise deployment will fail)
   - Click "Deploy"

7. **Initialize Database Tables**
   - Visit `https://your-worker-name.your-account.workers.dev/initDatabase` (visit your own `https://xxx.xxx.workers.dev/initDatabase`, not copy)
   - When you see **"✅ Database tables initialized successfully"**, database initialization is successful
   - 💡 **No need to manually execute SQL**: This endpoint will automatically create all necessary tables and indexes

8. **Register Webhook**
   - Visit `https://your-worker-name.your-account.workers.dev/registerWebhook` (visit your own `https://xxx.xxx.workers.dev/registerWebhook`, not copy)
   - When you see `"ok": true `, registration is successful

## 📖 User Guide

### User Side

1. **Start Conversation**
   - Send `/start` to the bot

2. **Send Messages**
   - All user messages are forwarded to a dedicated group topic
   - Supports text, images, videos, files, etc.
   - Supports editing messages, with edits synced to group

### Admin Side

1. **Reply to Users**
   - Reply directly in the user's group topic
   - Can reply to specific user messages
   - Supports all message types and media

2. **Admin Commands** (commands are not forwarded to users)
   - `/clear`: Clear current topic (delete topic & related data, without blocking user)  
   - `/block`: Block user (use directly within the corresponding topic)  
   - `/unblock`: Unblock user (use directly within the corresponding topic, or add the user ID after the command. You can check user IDs with `/checkblock`.)  
   - `/checkblock`: Check user block status (use directly within the corresponding topic), or show a list of all blocked users (when used in the general topic)
   - `/broadcast`: Broadcast a message (reply to the message to send; it won't appear in topic, sent directly to users)  
   - `/del`: Delete messages between the user and the bot (reply to the message you want to delete), only effective for messages within 48 hours, beyond 48 hours even if it prompts success it won't actually work

3. **Topic Management** (alternative block/unblock, more convenient, no typing needed)
   - Close topic: User cannot send messages (temporary block)  
   - Reopen topic: User can resume messages (unblock)  
   - Delete topic: Whether permanent ban depends on `ENV_DELETE_TOPIC_AS_BAN`  

## 🔧 Configuration Details

### Message Frequency Limit

- Prevents spamming by users  
- Controlled by `ENV_MESSAGE_INTERVAL` (seconds)  
- Exceeding messages are rejected with a wait notice  

### Data Management

- All data stored in Cloudflare D1  
- Includes user info, message mapping, topic states, etc.  
- Permanently stored without loss  

## 🛠️ Troubleshooting

### Common Issues

1. **Bot Unresponsive**
   - Check if Worker is running  
   - Verify Webhook registration  
   - Check environment variables  

2. **Topic Creation Failed**
   - Ensure group topics are enabled  
   - Check bot has admin rights  
   - Verify `ENV_ADMIN_GROUP_ID`  

3. **Message Forwarding Failed**
   - Check D1 database binding (variable name must be uppercase `D1`)
   - Verify user isn't blocked  
   - Ensure topic isn't deleted/closed  

4. **Database Initialization Failed**
   - Ensure you accessed the `/initDatabase` endpoint
   - Check if D1 database has been created
   - View Worker logs for detailed error information

### Log Viewing

- View logs in Cloudflare Workers console  
- Logs include detailed error/debug info  
- Useful for troubleshooting & monitoring  

## 💾 D1 Database Description

### Table Structure

The Worker automatically creates the following 6 tables:

| Table Name | Purpose |
|------|------|
| `users` | Stores user information and topic ID |
| `message_mappings` | Stores message mapping relationships |
| `topic_status` | Stores topic status (opened/closed/deleted) |
| `user_states` | Stores user states (such as delivery notice records, etc.) |
| `blocked_users` | Stores blocked users |
| `message_rates` | Stores message rate limiting records |

### Quota Advantages

| Item | KV Free Tier | D1 Free Tier | Improvement Multiple |
|------|----------|----------|---------|
| **Reads** | 100,000/day | 5,000,000/day | **50x** ⬆️ |
| **Writes** | 1,000/day ⚠️ | 100,000/day ✅ | **100x** ⬆️ |
| **Storage** | 1GB | 5GB | **5x** ⬆️ |

### Data Management

- View data in Cloudflare Dashboard's D1 console
- Supports executing SQL queries for data statistics
- Can use Wrangler CLI to export backup data

## 🙏 Acknowledgments

- [telegram-bot-cloudflare](https://github.com/cvzi/telegram-bot-cloudflare) – Infrastructure reference  
- Cloudflare Workers Team – For the excellent serverless platform  
- Telegram Bot API – For the powerful bot framework  

**Note**: This project is for learning and research purposes only. Please comply with relevant laws and platform terms. If you find bugs, you can [contact via Telegram](https://t.me/horrorself_bot) for feedback.
