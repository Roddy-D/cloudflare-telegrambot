// === 配置变量 ===
const TOKEN = (typeof ENV_BOT_TOKEN !== 'undefined') ? ENV_BOT_TOKEN : null // 从 @BotFather 获取
const WEBHOOK = '/endpoint'
const SECRET = (typeof ENV_BOT_SECRET !== 'undefined') ? ENV_BOT_SECRET : null // A-Z, a-z, 0-9, _ and -
const ADMIN_UID = (typeof ENV_ADMIN_UID !== 'undefined') ? ENV_ADMIN_UID : null // 管理员用户 ID
const ADMIN_GROUP_ID = (typeof ENV_ADMIN_GROUP_ID !== 'undefined') ? ENV_ADMIN_GROUP_ID : null // 管理群组 ID (必须是开启话题的超级群组)
const APP_NAME = (typeof ENV_APP_NAME !== 'undefined') ? ENV_APP_NAME : 'messagebot' // 应用名称
const WELCOME_MESSAGE = (typeof ENV_WELCOME_MESSAGE !== 'undefined') ? ENV_WELCOME_MESSAGE : '欢迎使用机器人' // 欢迎消息
const DISABLE_CAPTCHA = (typeof ENV_DISABLE_CAPTCHA !== 'undefined') ? ENV_DISABLE_CAPTCHA !== 'false' : true // 是否禁用人机验证（默认禁用）
const MESSAGE_INTERVAL = (typeof ENV_MESSAGE_INTERVAL !== 'undefined') ? parseInt(ENV_MESSAGE_INTERVAL) || 1 : 1 // 消息间隔限制（秒）
const DELETE_USER_MESSAGES = (typeof ENV_DELETE_USER_MESSAGES !== 'undefined') ? ENV_DELETE_USER_MESSAGES === 'true' : false // 清理话题时是否删除用户消息
const DELETE_TOPIC_AS_BAN = (typeof ENV_DELETE_TOPIC_AS_BAN !== 'undefined') ? ENV_DELETE_TOPIC_AS_BAN === 'true' : false // 删除话题是否等同于永久封禁

// === KV 存储 ===
// 在 Cloudflare Workers 中，KV 存储通过绑定的变量访问，如果未绑定则为 undefined
const horrKV = (typeof horr !== 'undefined') ? horr : null;

// === 常量 ===
const CAPTCHA_TIMEOUT = 60 * 1000; // 验证码超时时间
const MEDIA_GROUP_DELAY = 3000; // 媒体组延迟发送时间
const HUMAN_ERROR_TIMEOUT = 120 * 1000; // 验证错误后的禁言时间

/**
 * Telegram API 请求封装
 */
function apiUrl(methodName, params = null) {
  let query = ''
  if (params) {
    query = '?' + new URLSearchParams(params).toString()
  }
  return `https://api.telegram.org/bot${TOKEN}/${methodName}${query}`
}

function requestTelegram(methodName, body, params = null) {
  return fetch(apiUrl(methodName, params), body)
    .then(r => r.json())
}

function makeReqBody(body) {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  }
}

function sendMessage(msg = {}) {
  return requestTelegram('sendMessage', makeReqBody(msg))
}

function copyMessage(msg = {}) {
  return requestTelegram('copyMessage', makeReqBody(msg))
}

function forwardMessage(msg) {
  return requestTelegram('forwardMessage', makeReqBody(msg))
}

function editMessage(msg = {}) {
  return requestTelegram('editMessageText', makeReqBody(msg))
}

function editMessageCaption(msg = {}) {
  return requestTelegram('editMessageCaption', makeReqBody(msg))
}

function deleteMessage(chat_id, message_id) {
  return requestTelegram('deleteMessage', makeReqBody({
    chat_id: chat_id,
    message_id: message_id
  }))
}

function deleteMessages(chat_id, message_ids) {
  return requestTelegram('deleteMessages', makeReqBody({
    chat_id: chat_id,
    message_ids: message_ids
  }))
}

function createForumTopic(chat_id, name) {
  return requestTelegram('createForumTopic', makeReqBody({
    chat_id: chat_id,
    name: name
  }))
}

function deleteForumTopic(chat_id, message_thread_id) {
  return requestTelegram('deleteForumTopic', makeReqBody({
    chat_id: chat_id,
    message_thread_id: message_thread_id
  }))
}

function closeForumTopic(chat_id, message_thread_id) {
  return requestTelegram('closeForumTopic', makeReqBody({
    chat_id: chat_id,
    message_thread_id: message_thread_id
  }))
}

function reopenForumTopic(chat_id, message_thread_id) {
  return requestTelegram('reopenForumTopic', makeReqBody({
    chat_id: chat_id,
    message_thread_id: message_thread_id
  }))
}

function getUserProfilePhotos(user_id, limit = 1) {
  return requestTelegram('getUserProfilePhotos', null, {
    user_id: user_id,
    limit: limit
  })
}

function sendPhoto(msg = {}) {
  return requestTelegram('sendPhoto', makeReqBody(msg))
}

function getChat(chat_id) {
  return requestTelegram('getChat', makeReqBody({
    chat_id: chat_id
  }))
}

function answerCallbackQuery(callback_query_id, text, show_alert = false) {
  return requestTelegram('answerCallbackQuery', makeReqBody({
    callback_query_id: callback_query_id,
    text: text,
    show_alert: show_alert
  }))
}

/**
 * 数据库操作封装 (使用 KV 存储)
 */
class Database {
  // 用户相关
  async getUser(user_id) {
    if (!horrKV) return null
    const user = await horrKV.get(`user:${user_id}`, { type: 'json' })
    return user
  }

  async setUser(user_id, userData) {
    if (!horrKV) return
    await horrKV.put(`user:${user_id}`, JSON.stringify(userData))
  }

  async getAllUsers() {
    if (!horrKV) return []
    const list = await horrKV.list({ prefix: 'user:' })
    const users = []
    for (const key of list.keys) {
      const user = await horrKV.get(key.name, { type: 'json' })
      if (user) users.push(user)
    }
    return users
  }

  // 消息映射相关
  async getMessageMap(key) {
    if (!horrKV) return null
    return await horrKV.get(`msgmap:${key}`, { type: 'json' })
  }

  async setMessageMap(key, value) {
    if (!horrKV) return
    await horrKV.put(`msgmap:${key}`, JSON.stringify(value))
  }

  // 话题状态相关
  async getTopicStatus(thread_id) {
    if (!horrKV) return { status: 'opened' }
    return await horrKV.get(`topic:${thread_id}`, { type: 'json' }) || { status: 'opened' }
  }

  async setTopicStatus(thread_id, status) {
    if (!horrKV) return
    await horrKV.put(`topic:${thread_id}`, JSON.stringify({ status, updated_at: Date.now() }))
  }

  // 媒体组相关
  async getMediaGroup(group_id, chat_id) {
    if (!horrKV) return []
    return await horrKV.get(`media:${group_id}:${chat_id}`, { type: 'json' }) || []
  }

  async addToMediaGroup(group_id, chat_id, message_id, caption = null) {
    if (!horrKV) return
    const messages = await this.getMediaGroup(group_id, chat_id)
    messages.push({ message_id, caption, timestamp: Date.now() })
    await horrKV.put(`media:${group_id}:${chat_id}`, JSON.stringify(messages))
  }

  async clearMediaGroup(group_id, chat_id) {
    if (!horrKV) return
    await horrKV.delete(`media:${group_id}:${chat_id}`)
  }

  // 用户状态相关
  async getUserState(user_id, key) {
    if (!horrKV) return null
    return await horrKV.get(`state:${user_id}:${key}`, { type: 'json' })
  }

  async setUserState(user_id, key, value) {
    if (!horrKV) return
    await horrKV.put(`state:${user_id}:${key}`, JSON.stringify(value))
  }

  async deleteUserState(user_id, key) {
    if (!horrKV) return
    await horrKV.delete(`state:${user_id}:${key}`)
  }

  // 屏蔽用户相关
  async isUserBlocked(user_id) {
    if (!horrKV) return false
    return await horrKV.get(`blocked:${user_id}`, { type: 'json' }) || false
  }

  async blockUser(user_id, blocked = true) {
    if (!horrKV) return
    await horrKV.put(`blocked:${user_id}`, JSON.stringify(blocked))
  }

  // 消息频率限制
  async getLastMessageTime(user_id) {
    if (!horrKV) return 0
    return await horrKV.get(`lastmsg:${user_id}`, { type: 'json' }) || 0
  }

  async setLastMessageTime(user_id, timestamp) {
    if (!horrKV) return
    await horrKV.put(`lastmsg:${user_id}`, JSON.stringify(timestamp))
  }


}

const db = new Database()

/**
 * 工具函数
 */
function mentionHtml(user_id, name) {
  return `<a href="tg://user?id=${user_id}">${escapeHtml(name)}</a>`
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;')
             .replace(/"/g, '&quot;')
             .replace(/'/g, '&#39;')
}

function randomString(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}


/**
 * 用户数据库更新
 */
async function updateUserDb(user) {
  const existingUser = await db.getUser(user.id)
  if (existingUser) {
    // 更新现有用户信息
    existingUser.first_name = user.first_name || '未知'
    existingUser.last_name = user.last_name
    existingUser.username = user.username
    existingUser.updated_at = Date.now()
    await db.setUser(user.id, existingUser)
  } else {
    // 创建新用户
    const newUser = {
      user_id: user.id,
      first_name: user.first_name || '未知',
      last_name: user.last_name,
      username: user.username,
      message_thread_id: null,
      created_at: Date.now(),
      updated_at: Date.now()
    }
    await db.setUser(user.id, newUser)
  }
}

/**
 * 发送联系人卡片
 */
async function sendContactCard(chat_id, message_thread_id, user) {
  console.log(`📱 sendContactCard called for user ${user.id}`)
  const buttons = []
  if (user.username) {
    buttons.push([{
      text: '👤 直接联络',
      url: `https://t.me/${user.username}`
    }])
    console.log(`Added contact button for @${user.username}`)
  }

  const reply_markup = buttons.length > 0 ? {
    inline_keyboard: buttons
  } : undefined

  try {
    console.log(`Getting profile photos for user ${user.id}`)
    const userPhotos = await getUserProfilePhotos(user.id, 1)
    console.log(`Profile photos result:`, userPhotos)
    
    if (userPhotos.ok && userPhotos.result.total_count > 0) {
      const pic = userPhotos.result.photos[0][userPhotos.result.photos[0].length - 1].file_id
      console.log(`Sending photo with file_id: ${pic}`)
      
              const photoParams = {
          chat_id: chat_id,
          message_thread_id: message_thread_id,
          photo: pic,
          caption: `👤 ${mentionHtml(user.id, user.first_name || user.id)}\n\n📱 ${user.id}\n\n🔗 @${user.username || '无'}`,
          parse_mode: 'HTML'
        }
        
        if (reply_markup) {
          photoParams.reply_markup = reply_markup
        }
        
        console.log(`Sending photo with params:`, photoParams)
        
        const result = await sendPhoto(photoParams)
      console.log(`Photo send result:`, result)
      
      if (!result.ok) {
        console.error(`❌ Photo send failed:`, result)
      }
      
      return result
    } else {
      console.log(`No profile photo, sending text message`)
              const messageParams = {
          chat_id: chat_id,
          message_thread_id: message_thread_id,
          text: `👤 ${mentionHtml(user.id, user.first_name || user.id)}\n\n📱 ${user.id}\n\n🔗 @${user.username || '无'}`,
          parse_mode: 'HTML'
        }
        
        if (reply_markup) {
          messageParams.reply_markup = reply_markup
        }
        
        console.log(`Sending text message with params:`, messageParams)
        
        const result = await sendMessage(messageParams)
      console.log(`Text send result:`, result)
      
      if (!result.ok) {
        console.error(`❌ Text message send failed:`, result)
      }
      
      return result
    }
  } catch (error) {
    console.error('❌ Failed to send contact card:', error)
    console.error('❌ Error details:', error.stack || error)
    return { ok: false, error: error.message }
  }
}

/**
 * 人机验证
 */
async function checkHuman(user_id, chat_id) {
  if (DISABLE_CAPTCHA) {
    await db.setUserState(user_id, 'is_human', true)
    return true
  }

  const isHuman = await db.getUserState(user_id, 'is_human')
  if (isHuman) return true

  const errorTime = await db.getUserState(user_id, 'human_error_time')
  if (errorTime && Date.now() - errorTime < HUMAN_ERROR_TIMEOUT) {
    const timeLeft = Math.ceil((HUMAN_ERROR_TIMEOUT - (Date.now() - errorTime)) / 1000)
    await sendMessage({
      chat_id: chat_id,
      text: `你因验证码错误已被临时禁言，请 ${timeLeft} 秒后再试。`
    })
    return false
  }

  // 生成验证码
  const correctCode = randomString(4)
  const codes = []
  for (let i = 0; i < 7; i++) {
    codes.push(randomString(4))
  }
  codes.push(correctCode)
  
  // 打乱选项
  for (let i = codes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [codes[i], codes[j]] = [codes[j], codes[i]]
  }

  // 创建按钮
  const buttons = []
  for (let i = 0; i < codes.length; i += 4) {
    const row = []
    for (let j = i; j < i + 4 && j < codes.length; j++) {
      row.push({
        text: codes[j],
        callback_data: `vcode_${codes[j]}_${user_id}`
      })
    }
    buttons.push(row)
  }

  const captchaMessage = `${mentionHtml(user_id, '用户')}，请在 60 秒内点击以下验证码：${correctCode}\n\n回答错误将导致临时禁言。`

  const sent = await sendMessage({
    chat_id: chat_id,
    text: captchaMessage,
    reply_markup: { inline_keyboard: buttons },
    parse_mode: 'HTML'
  })

  if (sent.ok) {
    await db.setUserState(user_id, 'vcode', correctCode)
    await db.setUserState(user_id, 'vcode_message_id', sent.result.message_id)
    
    // 60秒后删除验证码消息
    setTimeout(async () => {
      await deleteMessage(chat_id, sent.result.message_id)
      await db.deleteUserState(user_id, 'vcode')
      await db.deleteUserState(user_id, 'vcode_message_id')
    }, CAPTCHA_TIMEOUT)
  }

  return false
}

/**
 * 处理验证码回调
 */
async function handleCaptchaCallback(callback_query) {
  const user = callback_query.from
  const [, code_clicked, target_user_id] = callback_query.data.split('_')

  if (target_user_id !== user.id.toString()) {
    return await answerCallbackQuery(callback_query.id, '这不是给你的验证码哦。', true)
  }

  const correctCode = await db.getUserState(user.id, 'vcode')
  const vcodeMessageId = await db.getUserState(user.id, 'vcode_message_id')

  if (!correctCode || !vcodeMessageId) {
    return await answerCallbackQuery(callback_query.id, '验证已过期或已完成。', true)
  }

  if (callback_query.message.message_id !== vcodeMessageId) {
    return await answerCallbackQuery(callback_query.id, '此验证码已失效。', true)
  }

  if (code_clicked === correctCode) {
    await answerCallbackQuery(callback_query.id, '✅ 验证成功！', false)
    await sendMessage({
      chat_id: user.id,
      text: `🎉 ${mentionHtml(user.id, user.first_name || user.id)}，验证通过，现在可以开始对话了！`,
      parse_mode: 'HTML'
    })
    
    await db.setUserState(user.id, 'is_human', true)
    await db.deleteUserState(user.id, 'vcode')
    await db.deleteUserState(user.id, 'vcode_message_id')
    await db.deleteUserState(user.id, 'human_error_time')
    
    await deleteMessage(callback_query.message.chat.id, callback_query.message.message_id)
  } else {
    await answerCallbackQuery(callback_query.id, '❌ 验证码错误！请等待 2 分钟后再试。', true)
    await db.setUserState(user.id, 'human_error_time', Date.now())
    await db.deleteUserState(user.id, 'vcode')
    await db.deleteUserState(user.id, 'vcode_message_id')
    
    await deleteMessage(callback_query.message.chat.id, callback_query.message.message_id)
  }
}

/**
 * 延迟发送媒体组
 */
async function sendMediaGroupLater(delay_ms, chat_id, target_id, media_group_id, direction) {
  await delay(delay_ms)
  
  const mediaMessages = await db.getMediaGroup(media_group_id, chat_id)
  if (mediaMessages.length === 0) {
    console.warn(`Media group ${media_group_id} not found for chat ${chat_id}`)
    return
  }

  const message_ids = mediaMessages.map(m => m.message_id)
  
  try {
    let sent_messages = []
    
    if (direction === 'u2a') {
      // 用户到管理员
      const user = await db.getUser(chat_id)
      if (!user || !user.message_thread_id) {
        console.warn(`User ${chat_id} or their topic not found for media group ${media_group_id}`)
        return
      }
      
      // 批量转发消息
      for (const msg_id of message_ids) {
        const sent = await copyMessage({
          chat_id: target_id,
          from_chat_id: chat_id,
          message_id: msg_id,
          message_thread_id: user.message_thread_id
        })
                 if (sent.ok) {
           sent_messages.push(sent.result)
           await db.setMessageMap(`u2a:${msg_id}`, sent.result.message_id)
           await db.setMessageMap(`a2u:${sent.result.message_id}`, msg_id)
         }
      }
    } else {
      // 管理员到用户
      for (const msg_id of message_ids) {
        const sent = await copyMessage({
          chat_id: target_id,
          from_chat_id: chat_id,
          message_id: msg_id
        })
                 if (sent.ok) {
           sent_messages.push(sent.result)
           await db.setMessageMap(`a2u:${msg_id}`, sent.result.message_id)
           await db.setMessageMap(`u2a:${sent.result.message_id}`, msg_id)
         }
      }
    }
    
    console.log(`Sent media group ${media_group_id}: ${sent_messages.length} messages`)
  } catch (error) {
    console.error(`Error sending media group ${media_group_id}:`, error)
  } finally {
    await db.clearMediaGroup(media_group_id, chat_id)
  }
}

/**
 * 处理 /start 命令
 */
async function handleStart(message) {
  const user = message.from
  await updateUserDb(user)
  
     if (user.id.toString() === ADMIN_UID) {
     await sendMessage({
       chat_id: user.id,
       text: '你已成功激活机器人。'
     })
  } else {
    await sendMessage({
      chat_id: user.id,
      text: `${mentionHtml(user.id, user.first_name || user.id)}：\n\n${WELCOME_MESSAGE}`,
      parse_mode: 'HTML'
    })
  }
}

/**
 * 用户消息转发到管理员 (u2a)
 */
async function forwardMessageU2A(message) {
  const user = message.from
  const user_id = user.id
  const chat_id = message.chat.id

  // 1. 人机验证
  if (!await checkHuman(user_id, chat_id)) {
    return
  }

  // 2. 消息频率限制
  if (MESSAGE_INTERVAL > 0) {
    const lastMessageTime = await db.getLastMessageTime(user_id)
    const currentTime = Date.now()
    
    if (currentTime < lastMessageTime + MESSAGE_INTERVAL * 1000) {
      const timeLeft = Math.ceil((lastMessageTime + MESSAGE_INTERVAL * 1000 - currentTime) / 1000)
      if (timeLeft > 0) {
        await sendMessage({
          chat_id: chat_id,
          text: `发送消息过于频繁，请等待 ${timeLeft} 秒后再试。`
        })
        return
      }
    }
    await db.setLastMessageTime(user_id, currentTime)
  }

  // 3. 检查是否被屏蔽
  const isBlocked = await db.isUserBlocked(user_id)
  if (isBlocked) {
    await sendMessage({
      chat_id: chat_id,
      text: '你已被屏蔽，无法发送消息。'
    })
    return
  }

  // 4. 更新用户信息
  await updateUserDb(user)

  // 5. 获取或创建话题
  let user_data = await db.getUser(user_id)
  if (!user_data) {
    // 如果用户数据不存在（可能是KV延迟），等待并重试一次
    console.log(`User data not found for ${user_id}, retrying...`)
    await delay(100) // 等待100ms
    user_data = await db.getUser(user_id)
    
    if (!user_data) {
      // 如果仍然不存在，创建默认数据并保存
      console.log(`Creating fallback user data for ${user_id}`)
      user_data = {
        user_id: user_id,
        first_name: user.first_name || '未知',
        last_name: user.last_name,
        username: user.username,
        message_thread_id: null,
        created_at: Date.now(),
        updated_at: Date.now()
      }
      await db.setUser(user_id, user_data)
    }
  }
  let message_thread_id = user_data.message_thread_id
  console.log(`User ${user_id} data loaded, message_thread_id: ${message_thread_id}`)
  
  // 检查话题状态
  if (message_thread_id) {
    const topicStatus = await db.getTopicStatus(message_thread_id)
    console.log(`Topic ${message_thread_id} status check:`, topicStatus)
    
    if (topicStatus.status === 'closed') {
      if (DELETE_TOPIC_AS_BAN) {
        await sendMessage({
          chat_id: chat_id,
          text: '对话已被管理员关闭且禁止重开。您的消息无法送达。'
        })
        return
      } else {
        await sendMessage({
          chat_id: chat_id,
          text: '对话已被管理员关闭。您的消息暂时无法送达。如需继续，请等待管理员重新打开对话。'
        })
        return
      }
    } else if (topicStatus.status === 'deleted' || topicStatus.status === 'removed') {
      // 话题已被删除，需要重新创建
      const oldThreadId = message_thread_id
      message_thread_id = null
      user_data.message_thread_id = null
      await db.setUser(user_id, user_data)
      // 清理旧的话题状态记录
      await db.setTopicStatus(oldThreadId, 'removed')
                  console.log(`Topic ${oldThreadId} was deleted/removed, will create new one for user ${user_id}`)
    }
  }

  console.log(`After topic status check, message_thread_id: ${message_thread_id}`)

  // 创建新话题
  if (!message_thread_id) {
    console.log(`Creating new topic for user ${user_id} (${user.first_name || '用户'})`)
    try {
      const topicName = `${user.first_name || '用户'}|${user_id}`.substring(0, 128)
      console.log(`Topic name: ${topicName}`)
      const forumTopic = await createForumTopic(ADMIN_GROUP_ID, topicName)
      
      if (forumTopic.ok) {
        message_thread_id = forumTopic.result.message_thread_id
        user_data.message_thread_id = message_thread_id
        await db.setUser(user_id, user_data)
        await db.setTopicStatus(message_thread_id, 'opened')
        
        console.log(`✅ Created new topic ${message_thread_id} for user ${user_id}`)
        
        // 发送联系人卡片
        console.log(`📱 Sending contact card for user ${user_id} to topic ${message_thread_id}`)
        console.log(`User object:`, {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username
        })
        
        try {
          const contactResult = await sendContactCard(ADMIN_GROUP_ID, message_thread_id, user)
          if (contactResult && contactResult.ok) {
            console.log(`✅ Contact card sent successfully for user ${user_id}, message_id: ${contactResult.result.message_id}`)
          } else {
            console.log(`❌ Contact card failed to send for user ${user_id}:`, contactResult)
          }
        } catch (contactError) {
          console.error(`❌ Error sending contact card for user ${user_id}:`, contactError)
        }
      } else {
        await sendMessage({
          chat_id: chat_id,
          text: '创建会话失败，请稍后再试或联系管理员。'
        })
        return
      }
    } catch (error) {
      console.error('Failed to create topic:', error)
      await sendMessage({
        chat_id: chat_id,
        text: '创建会话时发生错误，请稍后再试。'
      })
      return
    }
  }

  console.log(`Final message_thread_id before forwarding: ${message_thread_id}`)
  
  // 6. 处理消息转发
  console.log(`Starting message forwarding to topic ${message_thread_id}`)
  try {
    const params = { message_thread_id: message_thread_id }
    
         // 处理回复消息
     if (message.reply_to_message) {
       console.log(`User replying to message: ${message.reply_to_message.message_id}`)
       const originalId = await db.getMessageMap(`u2a:${message.reply_to_message.message_id}`)
       console.log(`Found original group message: ${originalId}`)
       if (originalId) {
         params.reply_to_message_id = originalId
         console.log(`Setting reply_to_message_id: ${originalId}`)
       }
     }

    if (message.media_group_id) {
      // 处理媒体组
      console.log(`Processing media group: ${message.media_group_id}`)
      await db.addToMediaGroup(message.media_group_id, chat_id, message.message_id, message.caption)
      
      const existingMessages = await db.getMediaGroup(message.media_group_id, chat_id)
      console.log(`Media group ${message.media_group_id} existing messages count: ${existingMessages.length}`)
      
      if (existingMessages.length === 1) {
        // 第一条消息，设置延迟发送
        console.log(`Scheduling delayed send for media group ${message.media_group_id}`)
        setTimeout(() => {
          sendMediaGroupLater(0, chat_id, ADMIN_GROUP_ID, message.media_group_id, 'u2a')
        }, MEDIA_GROUP_DELAY)
      } else {
        console.log(`Media group ${message.media_group_id} is subsequent message, not scheduling`)
      }
    } else {
      console.log(`Processing single message (not media group)`)
      // 处理单条消息
      console.log(`Copying single message with params:`, {
        chat_id: ADMIN_GROUP_ID,
        from_chat_id: chat_id,
        message_id: message.message_id,
        ...params
      })
      
      let sent
      try {
        sent = await copyMessage({
          chat_id: ADMIN_GROUP_ID,
          from_chat_id: chat_id,
          message_id: message.message_id,
          ...params
        })
        console.log(`Copy message result:`, sent)
      } catch (copyError) {
        console.error(`❌ copyMessage failed:`, copyError)
        console.error(`❌ copyMessage error details:`, {
          description: copyError.description,
          message: copyError.message,
          error_code: copyError.error_code,
          ok: copyError.ok
        })
        throw copyError // 重新抛出错误以便外层catch处理
      }
      
             if (sent && sent.ok) {
         await db.setMessageMap(`u2a:${message.message_id}`, sent.result.message_id)
         await db.setMessageMap(`a2u:${sent.result.message_id}`, message.message_id)
         console.log(`✅ Forwarded u2a: user(${user_id}) msg(${message.message_id}) -> group msg(${sent.result.message_id})`)
         console.log(`✅ Stored mapping: u2a:${message.message_id} -> ${sent.result.message_id}`)
         console.log(`✅ Stored mapping: a2u:${sent.result.message_id} -> ${message.message_id}`)
       } else {
         console.error(`❌ copyMessage failed, sent.ok = false`)
         console.error(`❌ copyMessage response:`, sent)
         
         // 检查是否是话题删除错误
         const errorText = (sent.description || '').toLowerCase()
         console.log(`🔍 Checking copyMessage error text: "${errorText}"`)
         
         if (errorText.includes('message thread not found') || 
             errorText.includes('topic deleted') || 
             errorText.includes('thread not found') ||
             errorText.includes('topic not found')) {
           
           // 创建一个错误对象来触发删除处理
           const deleteError = new Error('Topic deleted')
           deleteError.description = sent.description || 'Topic deleted'
           throw deleteError
         }
       }
    }
  } catch (error) {
    console.error('❌ Error forwarding message u2a:', error)
    console.error('❌ Error details:', {
      description: error.description,
      message: error.message,
      error_code: error.error_code,
      ok: error.ok,
      stack: error.stack
    })
    
    // 检查是否是话题删除错误（大小写不敏感）
    const errorText = (error.description || error.message || '').toLowerCase()
    console.log(`🔍 Checking error text for topic deletion: "${errorText}"`)
    console.log(`🔍 Full error object:`, error)
    
    const isTopicDeletedError = errorText.includes('message thread not found') || 
        errorText.includes('topic deleted') || 
        errorText.includes('thread not found') ||
        errorText.includes('topic not found') ||
        (errorText.includes('chat not found') && errorText.includes(ADMIN_GROUP_ID))
    
    console.log(`🔍 Is topic deleted error: ${isTopicDeletedError}`)
    
    if (isTopicDeletedError) {
      
      // 话题被删除，清理数据
      const oldThreadId = user_data.message_thread_id
      user_data.message_thread_id = null
      await db.setUser(user_id, user_data)
      
      // 清理话题状态记录
      if (oldThreadId) {
        await db.setTopicStatus(oldThreadId, 'removed')
      }
      
      console.log(`Topic ${oldThreadId} seems deleted. Cleared thread_id for user ${user_id}`)
      
      if (!DELETE_TOPIC_AS_BAN) {
        await sendMessage({
          chat_id: chat_id,
          text: '发送失败：你之前的对话已被删除。请重新发送一次当前消息。'
        })
      } else {
        await sendMessage({
          chat_id: chat_id,
          text: '发送失败：你的对话已被永久删除。消息无法送达。'
        })
      }
    } else {
      await sendMessage({
        chat_id: chat_id,
        text: '发送消息时遇到问题，请稍后再试。'
      })
    }
  }
}

/**
 * 管理员消息转发到用户 (a2u)
 */
async function forwardMessageA2U(message) {
  const user = message.from
  const message_thread_id = message.message_thread_id

  // 只处理话题内消息，忽略机器人消息
  if (!message_thread_id || user.is_bot) {
    return
  }

  // 处理话题管理事件
  if (message.forum_topic_created) {
    console.log(`Topic ${message_thread_id} created event received`)
    await db.setTopicStatus(message_thread_id, 'opened')
    return
  }

  if (message.forum_topic_closed) {
    console.log(`Topic ${message_thread_id} closed event received`)
    const user_data = await db.getUser(findUserByThreadId(message_thread_id))
    if (user_data) {
      await sendMessage({
        chat_id: user_data.user_id,
        text: '对话已由管理员关闭。你暂时无法发送消息到此对话。'
      })
    }
    await db.setTopicStatus(message_thread_id, 'closed')
    return
  }

  if (message.forum_topic_reopened) {
    console.log(`Topic ${message_thread_id} reopened event received`)
    const user_data = await db.getUser(findUserByThreadId(message_thread_id))
    if (user_data) {
      await sendMessage({
        chat_id: user_data.user_id,
        text: '管理员已重新打开对话，你可以继续发送消息了。'
      })
    }
    await db.setTopicStatus(message_thread_id, 'opened')
    return
  }

  // 查找目标用户
  const target_user = await findUserByThreadId(message_thread_id)
  if (!target_user) {
    console.warn(`No user found for thread ${message_thread_id}`)
    return
  }

  // 检查话题状态
  const topicStatus = await db.getTopicStatus(message_thread_id)
  if (topicStatus.status === 'closed') {
    // 可以选择发送提醒给管理员
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: '提醒：此对话已关闭。用户的消息可能不会被发送，除非你重新打开对话。',
      reply_to_message_id: message.message_id
    })
  }

  // 转发消息给用户
  try {
    const params = {}
    
         // 处理回复消息
     if (message.reply_to_message) {
       console.log(`Admin replying to message: ${message.reply_to_message.message_id}`)
       const originalId = await db.getMessageMap(`a2u:${message.reply_to_message.message_id}`)
       console.log(`Found original user message: ${originalId}`)
       if (originalId) {
         params.reply_to_message_id = originalId
         console.log(`Setting reply_to_message_id: ${originalId}`)
       }
     }

    if (message.media_group_id) {
      // 处理媒体组
      await db.addToMediaGroup(message.media_group_id, message.chat.id, message.message_id, message.caption)
      
      const existingMessages = await db.getMediaGroup(message.media_group_id, message.chat.id)
      if (existingMessages.length === 1) {
        setTimeout(() => {
          sendMediaGroupLater(0, message.chat.id, target_user.user_id, message.media_group_id, 'a2u')
        }, MEDIA_GROUP_DELAY)
      }
    } else {
      // 处理单条消息
      const sent = await copyMessage({
        chat_id: target_user.user_id,
        from_chat_id: message.chat.id,
        message_id: message.message_id,
        ...params
      })
      
             if (sent.ok) {
         await db.setMessageMap(`a2u:${message.message_id}`, sent.result.message_id)
         await db.setMessageMap(`u2a:${sent.result.message_id}`, message.message_id)
         console.log(`Forwarded a2u: group msg(${message.message_id}) -> user(${target_user.user_id})`)
         console.log(`Stored mapping: a2u:${message.message_id} -> ${sent.result.message_id}`)
         console.log(`Stored mapping: u2a:${sent.result.message_id} -> ${message.message_id}`)
       }
    }
  } catch (error) {
    console.error('Error forwarding message a2u:', error)
    
    if (error.description && (error.description.includes('bot was blocked') || error.description.includes('user is deactivated'))) {
      await sendMessage({
        chat_id: message.chat.id,
        message_thread_id: message_thread_id,
        text: `⚠️ 无法将消息发送给用户 ${mentionHtml(target_user.user_id, target_user.first_name || target_user.user_id)}。可能原因：用户已停用、将机器人拉黑或删除了对话。`,
        reply_to_message_id: message.message_id,
        parse_mode: 'HTML'
      })
    } else {
      await sendMessage({
        chat_id: message.chat.id,
        message_thread_id: message_thread_id,
        text: `向用户发送消息失败: ${error.description || error.message}`,
        reply_to_message_id: message.message_id
      })
    }
  }
}

/**
 * 根据话题ID查找用户
 */
async function findUserByThreadId(thread_id) {
  const users = await db.getAllUsers()
  return users.find(u => u.message_thread_id === thread_id)
}



/**
 * 处理消息编辑
 */
async function handleEditedMessage(edited_message, is_from_user = true) {
  const direction = is_from_user ? 'u2a' : 'a2u'
  const opposite_direction = is_from_user ? 'a2u' : 'u2a'
  
  console.log(`Processing edited message: ${edited_message.message_id}, is_from_user: ${is_from_user}`)
  
  const mapped_message_id = await db.getMessageMap(`${direction}:${edited_message.message_id}`)
  if (!mapped_message_id) {
    console.debug(`No mapping found for edited message ${edited_message.message_id}`)
    return
  }

  let target_chat_id
  if (is_from_user) {
    // 用户编辑消息，同步到管理群组
    target_chat_id = ADMIN_GROUP_ID
  } else {
    // 管理员编辑消息，需要找到对应的用户
    const message_thread_id = edited_message.message_thread_id
    if (!message_thread_id) {
      console.debug(`No message_thread_id found for admin edited message ${edited_message.message_id}`)
      return
    }
    
    const target_user = await findUserByThreadId(message_thread_id)
    if (!target_user) {
      console.debug(`No user found for thread ${message_thread_id}`)
      return
    }
    
    target_chat_id = target_user.user_id
    console.log(`Admin edited message ${edited_message.message_id} will sync to user ${target_user.user_id}`)
  }
  
  try {
    if (edited_message.text) {
      await editMessage({
        chat_id: target_chat_id,
        message_id: mapped_message_id,
        text: edited_message.text,
        parse_mode: 'HTML'
      })
    } else if (edited_message.caption) {
      await editMessageCaption({
        chat_id: target_chat_id,
        message_id: mapped_message_id,
        caption: edited_message.caption,
        parse_mode: 'HTML'
      })
    }
    
    console.log(`Synced edit: ${direction} msg(${edited_message.message_id}) -> ${opposite_direction} msg(${mapped_message_id}) to chat ${target_chat_id}`)
  } catch (error) {
    if (error.description && error.description.includes('Message is not modified')) {
      console.debug(`Edit sync: message ${edited_message.message_id} not modified`)
    } else {
      console.error('Error syncing edited message:', error)
    }
  }
}

/**
 * 清理话题命令
 */
async function handleClearCommand(message) {
  const user = message.from
  const message_thread_id = message.message_thread_id

  if (user.id.toString() !== ADMIN_UID) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: '你没有权限执行此操作。',
      reply_to_message_id: message.message_id
    })
    return
  }

  if (!message_thread_id) {
    await sendMessage({
      chat_id: message.chat.id,
      text: '请在需要清除的用户对话（话题）中执行此命令。',
      reply_to_message_id: message.message_id
    })
    return
  }

  try {
    // 查找关联用户
    const target_user = await findUserByThreadId(message_thread_id)
    
    // 删除话题
    await deleteForumTopic(ADMIN_GROUP_ID, message_thread_id)
    console.log(`Admin ${user.id} cleared topic ${message_thread_id}`)
    
    // 清理数据库
    if (target_user) {
      target_user.message_thread_id = null
      await db.setUser(target_user.user_id, target_user)
      
      // 如果启用了删除用户消息功能
      if (DELETE_USER_MESSAGES) {
        // 获取所有相关消息映射
        const mappedMessages = []
        if (horrKV) {
          const list = await horrKV.list({ prefix: 'msgmap:u2a:' })
          for (const key of list.keys) {
            const value = await horrKV.get(key.name, { type: 'json' })
            if (value) {
              mappedMessages.push(parseInt(key.name.split(':')[2]))
            }
          }
        }
        
        // 批量删除用户消息
        if (mappedMessages.length > 0) {
          const batchSize = 100
          for (let i = 0; i < mappedMessages.length; i += batchSize) {
            const batch = mappedMessages.slice(i, i + batchSize)
            try {
              await deleteMessages(target_user.user_id, batch)
              console.log(`Deleted ${batch.length} messages for user ${target_user.user_id}`)
            } catch (error) {
              console.error(`Error deleting messages for user ${target_user.user_id}:`, error)
            }
          }
        }
        
          // 清理消息映射
          for (const key of list.keys) {
            await horrKV.delete(key.name)
          }
      }
    }
    
    await db.setTopicStatus(message_thread_id, 'deleted')
    
  } catch (error) {
    console.error('Error clearing topic:', error)
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: `清除话题失败: ${error.description || error.message}`,
      reply_to_message_id: message.message_id
    })
  }
}

/**
 * 广播命令
 */
async function handleBroadcastCommand(message) {
  const user = message.from
  
  if (user.id.toString() !== ADMIN_UID) {
    await sendMessage({
      chat_id: message.chat.id,
      text: '你没有权限执行此操作。',
      reply_to_message_id: message.message_id
    })
    return
  }

  if (!message.reply_to_message) {
    await sendMessage({
      chat_id: message.chat.id,
      text: '请回复一条你想要广播的消息来使用此命令。',
      reply_to_message_id: message.message_id
    })
    return
  }

  const broadcastMessage = message.reply_to_message
  
  // 立即开始广播
  setTimeout(async () => {
    const users = await db.getAllUsers()
    const activeUsers = users.filter(u => u.message_thread_id)
    
    let success = 0
    let failed = 0
    let blocked = 0
    
    console.log(`Starting broadcast to ${activeUsers.length} users`)
    
    for (const user of activeUsers) {
      try {
        await copyMessage({
          chat_id: user.user_id,
          from_chat_id: broadcastMessage.chat.id,
          message_id: broadcastMessage.message_id
        })
        success++
        await delay(100) // 防止频率限制
      } catch (error) {
        if (error.description && (error.description.includes('bot was blocked') || error.description.includes('user is deactivated'))) {
          blocked++
        } else {
          failed++
        }
      }
    }
    
    console.log(`Broadcast completed: ${success} success, ${failed} failed, ${blocked} blocked`)
    
    // 通知管理员结果
    await sendMessage({
    chat_id: ADMIN_UID,
      text: `📢 广播完成：\n成功: ${success}\n失败: ${failed}\n屏蔽/停用: ${blocked}`
    })
  }, 1000)
  
  await sendMessage({
    chat_id: message.chat.id,
    text: `📢 广播任务已启动，将广播消息 ID: ${broadcastMessage.message_id}`,
    reply_to_message_id: message.message_id
  })
}

/**
 * 处理屏蔽命令
 */
async function handleBlockCommand(message) {
  const user = message.from
  const message_thread_id = message.message_thread_id

  if (user.id.toString() !== ADMIN_UID) {
    return
  }

  if (!message.reply_to_message) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: '请回复用户消息来使用屏蔽命令。',
      reply_to_message_id: message.message_id
    })
    return
  }

  const target_user = await findUserByThreadId(message_thread_id)
  if (!target_user) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: '找不到要屏蔽的用户。',
      reply_to_message_id: message.message_id
    })
    return
  }

  if (target_user.user_id.toString() === ADMIN_UID) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: '不能屏蔽自己。',
      reply_to_message_id: message.message_id
    })
    return
  }

  await db.blockUser(target_user.user_id, true)
  await sendMessage({
    chat_id: message.chat.id,
    message_thread_id: message_thread_id,
    text: `用户 ${target_user.user_id} 已被屏蔽。`,
    reply_to_message_id: message.message_id
  })
}

/**
 * 处理解除屏蔽命令
 */
async function handleUnblockCommand(message) {
  const user = message.from
  const message_thread_id = message.message_thread_id

  if (user.id.toString() !== ADMIN_UID) {
    return
  }

  if (!message.reply_to_message) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: '请回复用户消息来使用解除屏蔽命令。',
      reply_to_message_id: message.message_id
    })
    return
  }

  const target_user = await findUserByThreadId(message_thread_id)
  if (!target_user) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: '找不到要解除屏蔽的用户。',
      reply_to_message_id: message.message_id
    })
    return
  }

  await db.blockUser(target_user.user_id, false)
  await sendMessage({
    chat_id: message.chat.id,
    message_thread_id: message_thread_id,
    text: `用户 ${target_user.user_id} 已解除屏蔽。`,
    reply_to_message_id: message.message_id
  })
}

/**
 * 处理检查屏蔽状态命令
 */
async function handleCheckBlockCommand(message) {
  const user = message.from
  const message_thread_id = message.message_thread_id

  if (user.id.toString() !== ADMIN_UID) {
    return
  }

  if (!message.reply_to_message) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: '请回复用户消息来检查屏蔽状态。',
      reply_to_message_id: message.message_id
    })
    return
  }

  const target_user = await findUserByThreadId(message_thread_id)
  if (!target_user) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: '找不到用户。',
      reply_to_message_id: message.message_id
    })
    return
  }

  const isBlocked = await db.isUserBlocked(target_user.user_id)
  await sendMessage({
    chat_id: message.chat.id,
    message_thread_id: message_thread_id,
    text: `用户 ${target_user.user_id} 屏蔽状态: ${isBlocked ? '已屏蔽' : '未屏蔽'}`,
    reply_to_message_id: message.message_id
  })
}

/**
 * 处理更新消息
 */
async function onUpdate(update) {
  try {
    if (update.message) {
      const message = update.message
      const user = message.from
      const chat_id = message.chat.id

      // 处理 /start 命令
      if (message.text === '/start') {
        return await handleStart(message)
      }

      // 处理来自管理员的命令
      if (user.id.toString() === ADMIN_UID && chat_id.toString() === ADMIN_GROUP_ID) {
        if (message.text === '/clear') {
          return await handleClearCommand(message)
        }
        if (message.text === '/broadcast') {
          return await handleBroadcastCommand(message)
        }
        if (message.text === '/block') {
          return await handleBlockCommand(message)
        }
        if (message.text === '/unblock') {
          return await handleUnblockCommand(message)
        }
        if (message.text === '/checkblock') {
          return await handleCheckBlockCommand(message)
        }
      }

      // 处理私聊消息 (用户 -> 管理员)
      if (message.chat.type === 'private') {
        return await forwardMessageU2A(message)
      }

      // 处理管理群组消息 (管理员 -> 用户)
      if (chat_id.toString() === ADMIN_GROUP_ID) {
        return await forwardMessageA2U(message)
      }
    }

    // 处理编辑消息
    if (update.edited_message) {
      const edited_message = update.edited_message
      const chat_id = edited_message.chat.id
      
      if (edited_message.chat.type === 'private') {
        // 用户编辑消息
        return await handleEditedMessage(edited_message, true)
      }
      
      if (chat_id.toString() === ADMIN_GROUP_ID) {
        // 管理员编辑消息
        return await handleEditedMessage(edited_message, false)
      }
    }

    // 处理回调查询
    if (update.callback_query) {
      const callback_query = update.callback_query
      
      if (callback_query.data.startsWith('vcode_')) {
        return await handleCaptchaCallback(callback_query)
      }
    }

  } catch (error) {
    console.error('Error processing update:', error)
  }
}

/**
 * 处理 Webhook 请求
 */
async function handleWebhook(event) {
  // 验证密钥
  if (event.request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== SECRET) {
    return new Response('Unauthorized', { status: 403 })
  }

  // 读取更新
  const update = await event.request.json()
  
  // 异步处理更新
  event.waitUntil(onUpdate(update))

  return new Response('Ok')
}

/**
 * 注册 Webhook
 */
async function registerWebhook(event, requestUrl, suffix, secret) {
  const webhookUrl = `${requestUrl.protocol}//${requestUrl.hostname}${suffix}`
  
  const r = await fetch(apiUrl('setWebhook'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ['message', 'edited_message', 'callback_query']
    }),
  })

  return new Response('ok' in (await r.json()) ? 'Ok' : 'Error')
}

/**
 * 注销 Webhook
 */
async function unRegisterWebhook(event) {
  const r = await fetch(apiUrl('setWebhook'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      url: '',
    }),
  })

  return new Response('ok' in (await r.json()) ? 'Ok' : 'Error')
}

/**
 * 主事件监听器
 */
addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  
  if (url.pathname === WEBHOOK) {
    event.respondWith(handleWebhook(event))
  } else if (url.pathname === '/registerWebhook') {
    event.respondWith(registerWebhook(event, url, WEBHOOK, SECRET))
  } else if (url.pathname === '/unRegisterWebhook') {
    event.respondWith(unRegisterWebhook(event))
  } else {
    event.respondWith(new Response('No handler for this request'))
  }
})
