[中文](https://github.com/dhd2333/cloudflare-telegrambot) | English

# Message Forwarding Bot

## 🎉 Quick Start


## 📝 Project Introduction

This project is a Telegram message forwarding bot based on Cloudflare Worker. It is feature-rich and contains no ads.

**Tips: You can modify all Chinese prompt messages in the code (such as welcome text, error messages, block notifications, etc.) freely.**

### 🌟 Main Features

#### Basic Functions
- **Message Forwarding**: User private chat messages are automatically forwarded to management group topics
- **Two-way Communication**: Admins can reply to users within the topic
- **User Blocking**: Support blocking and unblocking users (when blocked, you won’t receive forwarded messages from them, and they will receive a notification about being temporarily or permanently blocked when sending you a message)

#### Advanced Functions
- **Topic Management**: Create a dedicated management topic for each user
- **Message Edit Sync**: Edited messages from both users and admins are synchronized in real time
- **Media Group Handling**: Supports forwarding photos, videos, and other media groups one by one (The Cloudflare version does not use media group forwarding because it can cause KV concurrency lock contention, duplicate messages, partial message loss, etc. Solving these requires retries, atomic operations, and complex error handling logic, which makes maintenance costly and prone to race conditions.)
- **Message Rate Limit**: Prevents users from sending messages too frequently
- **Contact Card**: Automatically displays user avatar (if any) and direct contact info
- **Broadcast Function**: Send notifications to all active users
- **KV Storage Exhaustion Reminder**: If daily KV resources are exhausted and someone sends a message, the admin will be notified to prevent missing messages

#### Technical Highlights
- **Zero-Cost Deployment**: Fully free, based on Cloudflare Worker
- **No Domain Required**: Uses Worker’s built-in domain
- **Global CDN**: Low latency worldwide via Cloudflare’s network
- **Data Persistence**: Data is permanently stored in Worker KV
- **High Availability**: Serverless architecture with 99.9% uptime

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
   - Generate a random UUID as webhook secret, or set your own (if “unallowed characters” appears, choose a custom one)

### Deployment Steps

1. **Log in to Cloudflare**
   - Visit [Cloudflare](https://dash.cloudflare.com/)
   - Log into your account

2. **Create Worker**
   - Go to "Workers" → "Workers and Pages"
   - Click "Create"
   - Choose "Start from Hello World!" template
   - Name your Worker

3. **Configure Environment Variables**
   
   In Worker settings → Variables & Secrets, add the following:

   **Required Variables (from Preparation):**
   - `ENV_BOT_TOKEN`: Your Bot Token  
   - `ENV_BOT_SECRET`: The UUID secret  
   - `ENV_ADMIN_UID`: Admin user ID  
   - `ENV_ADMIN_GROUP_ID`: Management group ID  

   **Optional Variables:**
   - `ENV_WELCOME_MESSAGE`: Welcome message (default: “Welcome to the bot”)  
   - `ENV_MESSAGE_INTERVAL`: Message interval limit in seconds (default: 1, set -1 for no limit)  
   - `ENV_DELETE_TOPIC_AS_BAN`: Delete topic = permanent ban (true/false, default: false). If false, only deletes the topic, and user can re-initiate by sending a new message.  

4. **Create & Bind KV Database**
   - In Cloudflare console, create a KV Namespace (Storage & Database → KV)
   - Name it `horr`
   - Go back to Worker → Bindings → Add KV binding:  
     - Variable name: `horr`  
     - KV namespace: `horr`

5. **Deploy Code**
   - Click top-right "Edit Code"
   - Copy [worker.js](./worker.js) into the editor (must configure variables first)
   - Click "Deploy"

6. **Register Webhook**
   - Visit `https://your-worker-name.your-account.workers.dev/registerWebhook` (replace with your own Worker URL)
   - If you see `"ok": true`, it’s successful

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
   - Reply directly in the user’s group topic
   - Can reply to specific user messages
   - Supports all message types and media

2. **Admin Commands** (commands are not forwarded to users)
   - `/clear`: Clear current topic (delete topic & related data, without blocking user)  
   - `/block`: Block user (reply to bot’s message)  
   - `/unblock`: Unblock user (reply to bot’s message)  
   - `/checkblock`: Check user block status (reply to bot’s message)  
   - `/broadcast`: Broadcast a message (reply to the message to send; it won’t appear in topic, sent directly to users)  

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
- All data stored in Cloudflare KV  
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
   - Check KV binding  
   - Verify user isn’t blocked  
   - Ensure topic isn’t deleted/closed  

### Log Viewing
- View logs in Cloudflare Workers console  
- Logs include detailed error/debug info  
- Useful for troubleshooting & monitoring  

## 🙏 Acknowledgments

- [telegram-bot-cloudflare](https://github.com/cvzi/telegram-bot-cloudflare) – Infrastructure reference  
- [nfd](https://github.com/LloydAsp/nfd) – Ideas & README reference  
- Cloudflare Workers Team – For the excellent serverless platform  
- Telegram Bot API – For the powerful bot framework  

**Note**: This project is for learning and research purposes only. Please comply with relevant laws and platform terms.  
This project was built in ~2 hours (coding with Cursor + Claude-4-Sonnet) and ~3 hours debugging.  
If you find bugs, please [contact via Telegram](https://t.me/horrorself_bot) for feedback.  
