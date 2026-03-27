// === 配置变量（从 env 中获取）=== 
let TOKEN = null
let WEBHOOK = '/endpoint'
let SECRET = null
let ADMIN_UID = null
let ADMIN_GROUP_ID = null
let WELCOME_MESSAGE = '欢迎使用机器人'
let MESSAGE_INTERVAL = 1
let ENABLE_VERIFICATION = false
let VERIFICATION_MAX_ATTEMPTS = 10

// 初始化配置变量
function initConfig(env) {
  TOKEN = env.ENV_BOT_TOKEN
  SECRET = env.ENV_BOT_SECRET
  ADMIN_UID = env.ENV_ADMIN_UID
  ADMIN_GROUP_ID = env.ENV_ADMIN_GROUP_ID
  WELCOME_MESSAGE = env.ENV_WELCOME_MESSAGE || '欢迎使用机器人'
  MESSAGE_INTERVAL = env.ENV_MESSAGE_INTERVAL ? parseInt(env.ENV_MESSAGE_INTERVAL) || 1 : 1
  ENABLE_VERIFICATION = (env.ENV_ENABLE_VERIFICATION || '').toLowerCase() === 'true'
  VERIFICATION_MAX_ATTEMPTS = env.ENV_VERIFICATION_MAX_ATTEMPTS ? parseInt(env.ENV_VERIFICATION_MAX_ATTEMPTS) || 10 : 10
}

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

function getUserProfilePhotos(user_id, limit = 1) {
  return requestTelegram('getUserProfilePhotos', null, {
    user_id: user_id,
    limit: limit
  })
}

function sendPhoto(msg = {}) {
  return requestTelegram('sendPhoto', makeReqBody(msg))
}

/**
 * 设置消息 Reaction（用于双向同步 emoji reaction）
 */
function setMessageReaction(msg = {}) {
  return requestTelegram('setMessageReaction', makeReqBody(msg))
}

/**
 * 验证码缓存管理（使用 Cache API）
 */
class VerificationCache {
  constructor() {
    this.cacheName = 'verification-cache'
  }

  // 生成缓存键对应的 URL
  _getCacheUrl(user_id, key) {
    return `https://internal.cache/${user_id}/${key}`
  }

  // 获取验证码数据
  async getVerification(user_id, key) {
    try {
      const cache = await caches.open(this.cacheName)
      const cacheUrl = this._getCacheUrl(user_id, key)
      const response = await cache.match(cacheUrl)
      
      if (!response) {
        return null
      }

      const data = await response.json()
      return data
    } catch (error) {
      console.error('Error getting verification from cache:', error)
      return null
    }
  }

  // 设置验证码数据（带过期时间）
  async setVerification(user_id, key, value, expirationSeconds = null) {
    try {
      const cache = await caches.open(this.cacheName)
      const cacheUrl = this._getCacheUrl(user_id, key)
      
      const headers = new Headers({
        'Content-Type': 'application/json',
        'Cache-Control': expirationSeconds 
          ? `max-age=${expirationSeconds}` 
          : 'max-age=86400' // 默认24小时
      })

      const response = new Response(JSON.stringify(value), { headers })
      await cache.put(cacheUrl, response)
      
      return true
    } catch (error) {
      console.error('Error setting verification in cache:', error)
      return false
    }
  }

  // 删除验证码数据
  async deleteVerification(user_id, key) {
    try {
      const cache = await caches.open(this.cacheName)
      const cacheUrl = this._getCacheUrl(user_id, key)
      await cache.delete(cacheUrl)
      return true
    } catch (error) {
      console.error('Error deleting verification from cache:', error)
      return false
    }
  }
}

/**
 * 数据库操作封装 (使用 D1 数据库)
 */
class Database {
  constructor(d1) {
    this.d1 = d1
  }

  // 用户相关
  async getUser(user_id) {
    const result = await this.d1.prepare(
      'SELECT * FROM users WHERE user_id = ?'
    ).bind(user_id.toString()).first()
    
    if (!result) return null
    
    return {
      user_id: result.user_id,
      first_name: result.first_name,
      last_name: result.last_name,
      username: result.username,
      message_thread_id: result.message_thread_id,
      created_at: result.created_at,
      updated_at: result.updated_at
    }
  }

  async setUser(user_id, userData) {
    await this.d1.prepare(
      `INSERT OR REPLACE INTO users 
       (user_id, first_name, last_name, username, message_thread_id, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      user_id.toString(),
      userData.first_name || null,
      userData.last_name || null,
      userData.username || null,
      userData.message_thread_id || null,
      userData.created_at || Date.now(),
      userData.updated_at || Date.now()
    ).run()
  }

  async getAllUsers() {
    const result = await this.d1.prepare(
      'SELECT * FROM users'
    ).all()
    return result.results || []
  }

  // 消息映射相关
  async getMessageMap(key) {
    const result = await this.d1.prepare(
      'SELECT mapped_value FROM message_mappings WHERE mapping_key = ?'
    ).bind(key).first()
    return result?.mapped_value || null
  }

  async setMessageMap(key, value) {
    await this.d1.prepare(
      'INSERT OR REPLACE INTO message_mappings (mapping_key, mapped_value, created_at) VALUES (?, ?, ?)'
    ).bind(key, value || null, Date.now()).run()
  }

  // 话题状态相关
  async getTopicStatus(thread_id) {
    const result = await this.d1.prepare(
      'SELECT status, updated_at FROM topic_status WHERE thread_id = ?'
    ).bind(thread_id).first()
    return result || { status: 'opened' }
  }

  async setTopicStatus(thread_id, status) {
    await this.d1.prepare(
      'INSERT OR REPLACE INTO topic_status (thread_id, status, updated_at) VALUES (?, ?, ?)'
    ).bind(thread_id || null, status || 'opened', Date.now()).run()
  }

  // 用户状态相关（非验证码）
  async getUserState(user_id, key) {
    const result = await this.d1.prepare(
      'SELECT state_value, expiry_time FROM user_states WHERE user_id = ? AND state_key = ?'
    ).bind(user_id.toString(), key).first()
    
    if (!result) return null
    
    // 检查是否过期
    if (result.expiry_time && Date.now() > result.expiry_time) {
      await this.deleteUserState(user_id, key)
      return null
    }
    
    return JSON.parse(result.state_value)
  }

  async setUserState(user_id, key, value, expirationTtl = null) {
    const expiryTime = expirationTtl ? Date.now() + (expirationTtl * 1000) : null
    await this.d1.prepare(
      'INSERT OR REPLACE INTO user_states (user_id, state_key, state_value, expiry_time) VALUES (?, ?, ?, ?)'
    ).bind(user_id.toString(), key || 'unknown', JSON.stringify(value), expiryTime).run()
  }

  async deleteUserState(user_id, key) {
    await this.d1.prepare(
      'DELETE FROM user_states WHERE user_id = ? AND state_key = ?'
    ).bind(user_id.toString(), key).run()
  }

  // 屏蔽用户相关
  async isUserBlocked(user_id) {
    const result = await this.d1.prepare(
      'SELECT blocked FROM blocked_users WHERE user_id = ?'
    ).bind(user_id.toString()).first()
    return result?.blocked === 1 || false
  }

  async blockUser(user_id, blocked = true) {
    if (blocked) {
      await this.d1.prepare(
        'INSERT OR REPLACE INTO blocked_users (user_id, blocked, blocked_at) VALUES (?, ?, ?)'
      ).bind(user_id.toString(), 1, Date.now()).run()
    } else {
      await this.d1.prepare(
        'DELETE FROM blocked_users WHERE user_id = ?'
      ).bind(user_id.toString()).run()
    }
  }

  // 消息频率限制
  async getLastMessageTime(user_id) {
    const result = await this.d1.prepare(
      'SELECT last_message_time FROM message_rates WHERE user_id = ?'
    ).bind(user_id.toString()).first()
    return result?.last_message_time || 0
  }

  async setLastMessageTime(user_id, timestamp) {
    await this.d1.prepare(
      'INSERT OR REPLACE INTO message_rates (user_id, last_message_time) VALUES (?, ?)'
    ).bind(user_id.toString(), timestamp || Date.now()).run()
  }

  // 清理过期数据（定期调用）
  async cleanupExpiredStates() {
    const now = Date.now()
    await this.d1.prepare(
      'DELETE FROM user_states WHERE expiry_time IS NOT NULL AND expiry_time < ?'
    ).bind(now).run()
  }

  // 删除用户的所有消息映射
  async deleteUserMessageMappings(user_id) {
    await this.d1.prepare(
      'DELETE FROM message_mappings WHERE mapping_key LIKE ?'
    ).bind(`u2a:${user_id}:%`).run()
  }
}

let db = null
const verificationCache = new VerificationCache()

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
 * 发送"已送达"提示（每日一次）并在3秒后撤回
 */
async function maybeSendDeliveredNotice(sender_user_id, target_chat_id, options = {}) {
  const { message_thread_id = null, reply_to_message_id = null, text = '您的消息已送达\nYour message has been delivered' } = options

  try {
    const today = new Date().toDateString()
    const stateKey = 'delivered_notice'
    const lastDate = await db.getUserState(sender_user_id, stateKey)

    if (lastDate === today) {
      return
    }

    const params = { chat_id: target_chat_id, text }
    if (message_thread_id) params.message_thread_id = message_thread_id
    if (reply_to_message_id) params.reply_to_message_id = reply_to_message_id

    const sent = await sendMessage(params)
    if (sent && sent.ok) {
      await db.setUserState(sender_user_id, stateKey, today)
      await delay(3000)
      try {
        await deleteMessage(target_chat_id, sent.result.message_id)
      } catch (e) {
        console.error('Failed to delete delivered notice:', e)
      }
    }
  } catch (e) {
    console.error('maybeSendDeliveredNotice error:', e)
  }
}

/**
 * 用户数据库更新
 */
async function updateUserDb(user) {
  try {
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
  } catch (error) {
    console.error('Error updating user database:', error)
    throw error
  }
}

/**
 * 发送联系人卡片
 */
async function sendContactCard(chat_id, message_thread_id, user) {
  console.log(`📱 sendContactCard called for user ${user.id}`)

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
        caption: `👤 ${user.first_name || user.id}\n\n📱 ${user.id}\n\n🔗 ${user.username ? `直接联系: @${user.username}` : `直接联系: tg://user?id=${user.id}`}`,
        parse_mode: 'HTML'
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
        text: `👤 ${user.first_name || user.id}\n\n📱 ${user.id}\n\n🔗 ${user.username ? `直接联系: @${user.username}` : `直接联系: tg://user?id=${user.id}`}`,
        parse_mode: 'HTML'
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
 * 处理 /start 命令
 */
async function handleStart(message) {
  const user = message.from
  const user_id = user.id
  const chat_id = message.chat.id
  
  await updateUserDb(user)
  
  if (user_id.toString() === ADMIN_UID) {
    const commandList = `🤖 <b>机器人管理命令列表</b>

<b>话题管理：</b>
• /clear - 删除话题并清理数据
• /del - 删除对方与机器人的消息（回复要删除的消息），仅48小时内的消息生效，超出48小时即使提示生效也不会生效

<b>用户管理：</b>
• /block - 屏蔽用户（在话题内使用）
• /unblock - 解除屏蔽（在话题内使用或 /unblock [用户ID]）
• /checkblock - 查看屏蔽列表（话题外）或检查单个用户（话题内）

<b>消息管理：</b>
• /broadcast - 群发消息（回复要群发的消息）

<b>同步功能：</b>
• ✅ Reaction emoji 双向同步已启用

<b>配置信息：</b>
• 验证功能：${ENABLE_VERIFICATION ? '已启用' : '已禁用'}
• 最大验证次数：${VERIFICATION_MAX_ATTEMPTS}次
• 消息间隔：${MESSAGE_INTERVAL}秒

✅ 机器人已激活并正常运行。`
    
    await sendMessage({
      chat_id: chat_id,  // 发送到当前聊天（群组或私聊）
      text: commandList,
      parse_mode: 'HTML'
    })
  } else {
    // 检查是否启用验证功能
    if (ENABLE_VERIFICATION) {
      // 检查用户是否已验证（使用 Cache API）
      const isVerified = await verificationCache.getVerification(user_id, 'verified')
      
      if (!isVerified) {
        // 未验证，发送验证码
        const challenge = generateVerificationChallenge(user_id)
        await verificationCache.setVerification(user_id, 'verification', {
          challenge: challenge.challenge,
          answer: challenge.answer,
          offset: challenge.offset,
          totalAttempts: 0,
          timestamp: Date.now()
        }, 120) // 120秒后自动过期
        
        await sendMessage({
          chat_id: chat_id,
          text: `${mentionHtml(user_id, user.first_name || user_id)}，欢迎使用！\n\n🔐 请输入验证码\n\n将当前UTC+8时间的 时分（HHMM格式，仅数字）四位数字的每一位数字加上 ${challenge.offset}，超过9则取个位数\n\n⏰ 请在1分钟内回复验证码，否则将失效\n\n${mentionHtml(user_id, user.first_name || user_id)}, Welcome!\n\n🔐 Please enter the verification code\n\nAdd ${challenge.offset} to each digit of current UTC+8 time in HHMM format (4 digits), if over 9, keep only the ones digit\n\n⏰ Please reply within 1 minute, or the code will expire`,
          parse_mode: 'HTML'
        })
        return
      }
    }
    
    // 已验证或未启用验证，发送欢迎消息
    await sendMessage({
      chat_id: chat_id,
      text: `${mentionHtml(user_id, user.first_name || user_id)}：\n\n${WELCOME_MESSAGE}`,
      parse_mode: 'HTML'
    })
  }
}

/**
 * 获取UTC+8时间的HHMM四位数
 */
function getUTC8TimeDigits(offsetMinutes = 0) {
  const now = new Date()
  // 转换为UTC+8（加8小时）
  const utc8Time = new Date(now.getTime() + (8 * 60 * 60 * 1000) + (offsetMinutes * 60 * 1000))
  const hours = utc8Time.getUTCHours().toString().padStart(2, '0')
  const minutes = utc8Time.getUTCMinutes().toString().padStart(2, '0')
  return hours + minutes
}

/**
 * 生成验证码挑战和答案（基于UTC+8时间）
 */
function generateVerificationChallenge(user_id) {
  // 获取UTC+8时间的HHMM作为四位数字
  const challengeDigits = getUTC8TimeDigits(0)
  
  // 随机生成加数（1-9，避免0没有意义）
  const offset = Math.floor(Math.random() * 9) + 1
  
  // 计算正确答案
  let answer = ''
  for (let i = 0; i < challengeDigits.length; i++) {
    const digit = parseInt(challengeDigits[i])
    const newDigit = (digit + offset) % 10 // 超过9则只保留个位数
    answer += newDigit.toString()
  }
  
  return {
    challenge: challengeDigits,
    answer: answer,
    offset: offset
  }
}

/**
 * 验证答案（允许±1分钟的时间偏差）
 */
function verifyAnswer(userAnswer, offset) {
  // 检查当前时间、前1分钟、后1分钟的三种可能答案
  for (let timeOffset = -1; timeOffset <= 1; timeOffset++) {
    const challengeDigits = getUTC8TimeDigits(timeOffset)
    let correctAnswer = ''
    for (let i = 0; i < challengeDigits.length; i++) {
      const digit = parseInt(challengeDigits[i])
      const newDigit = (digit + offset) % 10
      correctAnswer += newDigit.toString()
    }
    
    if (userAnswer === correctAnswer) {
      return true
    }
  }
  
  return false
}

/**
 * 用户消息转发到管理员 (u2a)
 */
async function forwardMessageU2A(message) {
  const user = message.from
  const user_id = user.id
  const chat_id = message.chat.id

  try {
    // 1. 管理员跳过所有检查
    if (user_id.toString() === ADMIN_UID) {
      // 管理员直接跳过验证、屏蔽、频率限制等检查
      // 继续处理消息转发
    } else {
      // 2. 检查验证状态（仅当启用验证功能时）- 使用 Cache API
      if (ENABLE_VERIFICATION) {
      const verificationState = await verificationCache.getVerification(user_id, 'verification')
      const isVerified = await verificationCache.getVerification(user_id, 'verified')
      
      // 如果用户尚未验证
      if (!isVerified) {
      // 如果还没有发送验证挑战，发送挑战
      if (!verificationState) {
        const challenge = generateVerificationChallenge(user_id)
        await verificationCache.setVerification(user_id, 'verification', {
          challenge: challenge.challenge,
          answer: challenge.answer,
          offset: challenge.offset,
          totalAttempts: 0,
          timestamp: Date.now()
        }, 120) // 120秒后自动过期
        
        await sendMessage({
          chat_id: chat_id,
          text: `🔐 请输入验证码\n\n将当前UTC+8时间的 时分（HHMM格式，仅数字）四位数字的每一位数字加上 ${challenge.offset}，超过9则取个位数\n\n⏰ 请在1分钟内回复验证码，否则将失效\n\n🔐 Please enter the verification code\n\nAdd ${challenge.offset} to each digit of current UTC+8 time in HHMM format (4 digits), if over 9, keep only the ones digit\n\n⏰ Please reply within 1 minute, or the code will expire`,
          parse_mode: 'HTML'
        })
        return
      }
      
      // 检查验证码是否过期（1分钟 = 60000毫秒）
      const currentTime = Date.now()
      const verificationTime = verificationState.timestamp || 0
      const timeElapsed = currentTime - verificationTime
      
      if (timeElapsed > 60000) {
        // 验证码已过期，删除验证码数据
        await verificationCache.deleteVerification(user_id, 'verification')
        
        await sendMessage({
          chat_id: chat_id,
          text: `⏰ 验证码已失效\n\n您未在1分钟内回复验证码，验证码已失效。\n\n请重新发送消息以获取新的验证码。\n\n⏰ Verification code expired\n\nYou did not reply within 1 minute, the code has expired.\n\nPlease send a new message to get a new verification code.`
        })
        return
      }
      
      // 检查是否已达到最大尝试次数
      const totalAttempts = verificationState.totalAttempts || 0
      if (totalAttempts >= VERIFICATION_MAX_ATTEMPTS) {
        // 永久屏蔽用户
        await db.blockUser(user_id, true)
        // 标记为验证码超出限制而被屏蔽
        await db.setUserState(user_id, 'verification_blocked', true)
        
        await sendMessage({
          chat_id: chat_id,
          text: `❌ 验证失败次数过多（${VERIFICATION_MAX_ATTEMPTS}次），已被永久屏蔽。\n❌ Too many failed attempts (${VERIFICATION_MAX_ATTEMPTS} times), permanently blocked.`
        })
        return
      }
      
      // 用户已收到挑战，检查答案
      const userAnswer = message.text?.trim()
      
      if (!userAnswer) {
        await sendMessage({
          chat_id: chat_id,
          text: `请输入数字答案。\nPlease enter the numeric answer.`
        })
        return
      }
      
      // 验证答案（允许±1分钟偏差）
      if (verifyAnswer(userAnswer, verificationState.offset)) {
        // 验证成功
        await verificationCache.setVerification(user_id, 'verified', true)
        await verificationCache.deleteVerification(user_id, 'verification')
        
        await sendMessage({
          chat_id: chat_id,
          text: `✅ 验证成功！现在您可以发送消息了。\n✅ Verification successful! You can now send messages.`
        })
        return
      } else {
        // 验证失败，增加尝试次数
        const newTotalAttempts = totalAttempts + 1
        
        // 检查是否达到上限
        if (newTotalAttempts >= VERIFICATION_MAX_ATTEMPTS) {
          // 永久屏蔽用户
          await db.blockUser(user_id, true)
          // 标记为验证码超出限制而被屏蔽
          await db.setUserState(user_id, 'verification_blocked', true)
          
          await sendMessage({
            chat_id: chat_id,
            text: `❌ 验证失败次数已达上限（${VERIFICATION_MAX_ATTEMPTS}次），已被永久屏蔽。\n❌ Maximum verification attempts reached (${VERIFICATION_MAX_ATTEMPTS} times), permanently blocked.`
          })
          return
        }
        
        // 重新生成新的验证码
        const challenge = generateVerificationChallenge(user_id)
        await verificationCache.setVerification(user_id, 'verification', {
          challenge: challenge.challenge,
          answer: challenge.answer,
          offset: challenge.offset,
          totalAttempts: newTotalAttempts,
          timestamp: Date.now()
        }, 120) // 120秒后自动过期
        
        await sendMessage({
          chat_id: chat_id,
          text: `❌ 验证失败（${newTotalAttempts}/${VERIFICATION_MAX_ATTEMPTS}）\n\n🔐 请重新输入验证码\n\n将当前UTC+8时间的 时分（HHMM格式，仅数字）四位数字的每一位数字加上 ${challenge.offset}，超过9则取个位数\n\n⏰ 请在1分钟内回复验证码，否则将失效\n\n❌ Verification failed (${newTotalAttempts}/${VERIFICATION_MAX_ATTEMPTS})\n\n🔐 Please re-enter the verification code\n\nAdd ${challenge.offset} to each digit of current UTC+8 time in HHMM format (4 digits), if over 9, keep only the ones digit\n\n⏰ Please reply within 1 minute, or the code will expire`,
          parse_mode: 'HTML'
        })
        return
      }
      }
      }

      // 3. 消息频率限制
      if (MESSAGE_INTERVAL > 0) {
      const lastMessageTime = await db.getLastMessageTime(user_id)
      const currentTime = Date.now()
      
      if (currentTime < lastMessageTime + MESSAGE_INTERVAL * 1000) {
        const timeLeft = Math.ceil((lastMessageTime + MESSAGE_INTERVAL * 1000 - currentTime) / 1000)
        if (timeLeft > 0) {
          await sendMessage({
            chat_id: chat_id,
            text: `发送消息过于频繁，请等待 ${timeLeft} 秒后再试。\nSending messages too frequently, please wait ${timeLeft} seconds before trying again.`
          })
          return
        }
      }
        await db.setLastMessageTime(user_id, currentTime)
      }

      // 4. 检查是否被屏蔽
      const isBlocked = await db.isUserBlocked(user_id)
      if (isBlocked) {
        await sendMessage({
          chat_id: chat_id,
          text: '你已被屏蔽，无法发送消息。\nYou have been blocked and cannot send messages.'
        })
        return
      }
    }

    // 5. 更新用户信息
    await updateUserDb(user)

    // 6. 获取或创建话题
    let user_data = await db.getUser(user_id)
    if (!user_data) {
      // 如果用户数据不存在（可能是延迟），等待并重试一次
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
        await sendMessage({
          chat_id: chat_id,
          text: '对话已被对方关闭。您的消息暂时无法送达。如需继续，请等待或请求对方重新打开对话。\nThe conversation has been closed by him. Your message cannot be delivered temporarily. If you need to continue, please wait or ask him to reopen the conversation.'
        })
        return
      } else if (topicStatus.status === 'deleted' || topicStatus.status === 'removed') {
        // 话题已被删除，允许重新创建
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
            text: '创建会话失败，请稍后再试或联系对方。\nFailed to create session, please try again later or contact him.'  
          })
          return
        }
      } catch (error) {
        console.error('Failed to create topic:', error)
        await sendMessage({
          chat_id: chat_id,
          text: '创建会话时发生错误，请稍后再试。\nAn error occurred while creating the session, please try again later.'
        })
        return
      }
    }

    console.log(`Final message_thread_id before forwarding: ${message_thread_id}`)
    
    // 7. 处理消息转发
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

      // 直接转发消息（无论是否为媒体组）
      console.log(`Processing message: ${message.message_id}`)
      console.log(`Copying message with params:`, {
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
        // 存储 admin群组消息ID -> 用户ID 的映射（用于 reaction 同步时定位用户）
        await db.setMessageMap(`msg2user:${sent.result.message_id}`, user_id)
        // 存储 用户消息ID -> 用户ID 的映射（用于 reaction 反向同步）
        await db.setMessageMap(`msg2user:u:${message.message_id}`, user_id)
        console.log(`✅ Forwarded u2a: user(${user_id}) msg(${message.message_id}) -> group msg(${sent.result.message_id})`)
        console.log(`✅ Stored mapping: u2a:${message.message_id} -> ${sent.result.message_id}`)
        console.log(`✅ Stored mapping: a2u:${sent.result.message_id} -> ${message.message_id}`)
        console.log(`✅ Stored mapping: msg2user:${sent.result.message_id} -> ${user_id}`)
        // 发送"已送达"提示（每日一次），3秒后撤回
        await maybeSendDeliveredNotice(user_id, chat_id, { reply_to_message_id: message.message_id })
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
        
        await sendMessage({
          chat_id: chat_id,
          text: '发送失败：你之前的对话已被删除。请重新发送一次当前消息。\nSend failed: Your previous conversation has been deleted. Please resend the current message.'
        })
      } else {
        await sendMessage({
          chat_id: chat_id,
          text: '发送消息时遇到问题，请稍后再试。\nEncountered a problem while sending the message, please try again later.'
        })
      }
    }
    
  } catch (error) {
    console.error('❌ Error in forwardMessageU2A:', error)
    
    // 其他错误的通用处理
    await sendMessage({
      chat_id: chat_id,
      text: '处理消息时发生错误，请稍后再试。\nAn error occurred while processing the message, please try again later.'
    })
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

    // 直接转发消息（无论是否为媒体组）
    const sent = await copyMessage({
      chat_id: target_user.user_id,
      from_chat_id: message.chat.id,
      message_id: message.message_id,
      ...params
    })
    
    if (sent.ok) {
      await db.setMessageMap(`a2u:${message.message_id}`, sent.result.message_id)
      await db.setMessageMap(`u2a:${sent.result.message_id}`, message.message_id)
      // 存储 admin群组消息ID -> 用户ID 的映射（用于 reaction 同步时定位用户）
      await db.setMessageMap(`msg2user:${message.message_id}`, target_user.user_id)
      // 存储 用户消息ID -> 用户ID 的映射（用于 reaction 反向同步）
      await db.setMessageMap(`msg2user:u:${sent.result.message_id}`, target_user.user_id)
      console.log(`Forwarded a2u: group msg(${message.message_id}) -> user(${target_user.user_id})`)
      console.log(`Stored mapping: a2u:${message.message_id} -> ${sent.result.message_id}`)
      console.log(`Stored mapping: u2a:${sent.result.message_id} -> ${message.message_id}`)
      console.log(`Stored mapping: msg2user:${message.message_id} -> ${target_user.user_id}`)
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
 * 处理 Reaction 双向同步
 * 
 * message_reaction update 结构:
 * {
 *   chat: { id, type, ... },
 *   message_id: number,
 *   user: { id, first_name, ... },  // 私聊/群组中有此字段
 *   actor_chat: { ... },             // 匿名 reaction 时有此字段
 *   date: number,
 *   old_reaction: [ { type, emoji/custom_emoji_id } ],
 *   new_reaction: [ { type, emoji/custom_emoji_id } ]
 * }
 */
async function handleMessageReaction(message_reaction) {
  const chat = message_reaction.chat
  const message_id = message_reaction.message_id
  const new_reaction = message_reaction.new_reaction || []
  const user = message_reaction.user

  console.log(`🔄 Reaction update: chat=${chat.id}, msg=${message_id}, new_reaction=${JSON.stringify(new_reaction)}, user=${user?.id}`)

  try {
    if (chat.type === 'private') {
      // ======== 用户 -> 管理员方向 ========
      // 用户在私聊中对消息点了 reaction，同步到管理群组对应的消息
      const mapped_message_id = await db.getMessageMap(`u2a:${message_id}`)
      if (!mapped_message_id) {
        console.log(`⚠️ No u2a mapping found for reaction on message ${message_id}`)
        return
      }

      // 过滤掉 paid reaction（bot 不能使用付费 reaction）
      const filteredReaction = new_reaction.filter(r => r.type !== 'paid')

      // Bot 作为非 Premium 用户只能设置最多1个 reaction
      // 取最新的一个（数组最后一个），如果为空则清除 reaction
      const reactionToSet = filteredReaction.length > 0
        ? [filteredReaction[filteredReaction.length - 1]]
        : []

      const result = await setMessageReaction({
        chat_id: ADMIN_GROUP_ID,
        message_id: mapped_message_id,
        reaction: reactionToSet
      })

      if (result.ok) {
        console.log(`✅ Synced reaction u2a: user msg(${message_id}) -> group msg(${mapped_message_id}), reaction: ${JSON.stringify(reactionToSet)}`)
      } else {
        console.error(`❌ Failed to sync reaction u2a:`, result)
      }

    } else if (chat.id.toString() === ADMIN_GROUP_ID) {
      // ======== 管理员 -> 用户方向 ========
      // 管理员在管理群组中对消息点了 reaction，同步到用户私聊对应的消息

      // 忽略 bot 自己触发的 reaction 更新（防止循环）
      if (user && user.is_bot) {
        console.log(`⏭️ Ignoring bot's own reaction update`)
        return
      }

      const mapped_message_id = await db.getMessageMap(`a2u:${message_id}`)
      if (!mapped_message_id) {
        console.log(`⚠️ No a2u mapping found for reaction on message ${message_id}`)
        return
      }

      // 找到目标用户：通过 message_id 的映射找到原始用户消息，再确定用户 chat_id
      // 由于 a2u 映射的 value 是用户侧的 message_id，我们需要知道是哪个用户
      // 方法：通过遍历用户找到 thread_id 匹配的（利用 message_reaction 中没有 thread_id，
      // 但我们可以通过反查 u2a 映射来确定用户）
      // 更好的方法：存储额外的映射 msg2user，但为了不改动数据库结构，
      // 我们通过查找 u2a:{mapped_message_id} 来确认用户侧消息存在
      const reverse_check = await db.getMessageMap(`u2a:${mapped_message_id}`)
      if (!reverse_check) {
        console.log(`⚠️ Reverse mapping u2a:${mapped_message_id} not found`)
        return
      }

      // 找到用户：mapped_message_id 是用户侧的 message_id
      // 我们需要找出这个消息属于哪个用户（哪个 chat_id）
      // 通过遍历所有用户，检查哪个用户有活跃话题
      // 注意：message_reaction update 在群组中可能包含 message_thread_id（如果是话题群组）
      // 但 Bot API 的 MessageReactionUpdated 在超级群组中不一定有 message_thread_id
      // 这里我们需要另一种策略：存储 admin msg -> user_id 的映射

      // 策略：遍历所有用户找到对应关系
      // 通过 admin 群组消息 ID 查找对应的用户
      // 我们利用已有的映射关系：a2u:{admin_msg} -> user_msg
      // 以及 u2a:{user_msg} -> admin_msg（反向确认）
      // 找用户的方式：查找哪个用户的 chat 中有 mapped_message_id 这个消息
      // 实际上我们可以直接从 message_reaction 的 chat 上下文中获取 thread_id

      // 在论坛/话题群组中，Bot API 的 message_reaction 事件不提供 message_thread_id
      // 所以我们需要另一种方式定位用户
      // 解决方案：在消息映射时额外存储 admin消息ID -> 用户ID 的映射

      // 使用 msg2user 映射（在消息转发时已存储）
      const target_user_id = await db.getMessageMap(`msg2user:${message_id}`)
      if (!target_user_id) {
        // 回退策略：尝试通过所有用户查找
        console.log(`⚠️ No msg2user mapping for ${message_id}, trying fallback...`)
        
        // 遍历用户，但这个效率较低
        // 更好的做法是确保 msg2user 映射存在
        return
      }

      // 过滤掉 paid reaction
      const filteredReaction = new_reaction.filter(r => r.type !== 'paid')
      const reactionToSet = filteredReaction.length > 0
        ? [filteredReaction[filteredReaction.length - 1]]
        : []

      const result = await setMessageReaction({
        chat_id: target_user_id,
        message_id: mapped_message_id,
        reaction: reactionToSet
      })

      if (result.ok) {
        console.log(`✅ Synced reaction a2u: group msg(${message_id}) -> user(${target_user_id}) msg(${mapped_message_id}), reaction: ${JSON.stringify(reactionToSet)}`)
      } else {
        console.error(`❌ Failed to sync reaction a2u:`, result)
      }
    }
  } catch (error) {
    console.error('❌ Error handling message reaction:', error)
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
      
      // D1版本：删除消息映射记录
      await db.deleteUserMessageMappings(target_user.user_id)
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
  
  // 立即发送确认消息
  await sendMessage({
    chat_id: message.chat.id,
    text: `📢 广播任务已启动，将广播消息 ID: ${broadcastMessage.message_id}`,
    reply_to_message_id: message.message_id
  })
  
  // 使用 Promise 而不是 setTimeout 来避免 Workers 中的问题
  const broadcastPromise = (async () => {
    try {
      const users = await db.getAllUsers()
      const activeUsers = users.filter(u => u.message_thread_id)
      
      if (activeUsers.length === 0) {
        await sendMessage({
          chat_id: message.chat.id,
          text: '❌ 没有找到活跃用户，广播取消。',
          reply_to_message_id: message.message_id
        })
        return
      }
      
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
          console.error(`Broadcast error for user ${user.user_id}:`, error)
          if (error.description && (error.description.includes('bot was blocked') || error.description.includes('user is deactivated'))) {
            blocked++
          } else {
            failed++
          }
        }
      }
      
      console.log(`Broadcast completed: ${success} success, ${failed} failed, ${blocked} blocked`)
      
      // 修复：将结果发送到管理群组而不是管理员私聊
      await sendMessage({
        chat_id: message.chat.id,
        text: `📢 广播完成：\n✅ 成功: ${success}\n❌ 失败: ${failed}\n🚫 屏蔽/停用: ${blocked}\n👥 总计: ${activeUsers.length}`,
        reply_to_message_id: message.message_id
      })
    } catch (error) {
      console.error('Broadcast error:', error)
      await sendMessage({
        chat_id: message.chat.id,
        text: `❌ 广播执行失败: ${error.message}`,
        reply_to_message_id: message.message_id
      })
    }
  })()
  
  // 在 Workers 中使用 event.waitUntil 来确保异步操作完成
  // 这里我们不能直接访问 event，所以只能依赖 Promise
  return broadcastPromise
}

/**
 * 处理删除消息命令
 */
async function handleDeleteCommand(message) {
  const user = message.from
  const message_thread_id = message.message_thread_id

  if (user.id.toString() !== ADMIN_UID) {
    return
  }

  if (!message_thread_id) {
    await sendMessage({
      chat_id: message.chat.id,
      text: '请在话题内使用此命令。',
      reply_to_message_id: message.message_id
    })
    return
  }

  if (!message.reply_to_message) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: '请回复要删除的消息来使用此命令。',
      reply_to_message_id: message.message_id
    })
    return
  }

  const target_user = await findUserByThreadId(message_thread_id)
  if (!target_user) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: '找不到目标用户。',
      reply_to_message_id: message.message_id
    })
    return
  }

  // 查找对应的用户侧消息ID
  const admin_message_id = message.reply_to_message.message_id
  const user_message_id = await db.getMessageMap(`a2u:${admin_message_id}`)

  if (!user_message_id) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: '未找到对应的用户消息映射，可能是系统消息或已被删除。',
      reply_to_message_id: message.message_id
    })
    return
  }

  try {
    // 删除用户侧的消息
    await deleteMessage(target_user.user_id, user_message_id)
    
    // 删除命令消息本身
    await deleteMessage(message.chat.id, message.message_id)
    
    // 发送删除成功提示
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: '✅ 已删除用户侧的消息。',
      reply_to_message_id: admin_message_id
    })
    
    console.log(`Admin deleted message: admin_msg(${admin_message_id}) -> user_msg(${user_message_id})`)
  } catch (error) {
    console.error('Error deleting message:', error)
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: `❌ 删除消息失败: ${error.description || error.message}`,
      reply_to_message_id: message.message_id
    })
  }
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

  if (!message_thread_id) {
    await sendMessage({
      chat_id: message.chat.id,
      text: '请到相应话题内使用屏蔽命令。',
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

  // 检查是否提供了用户ID参数（格式：/unblock 123456）
  const commandMatch = message.text?.match(/^\/unblock\s+(\d+)/)
  if (commandMatch) {
    const target_user_id = commandMatch[1]
    
    // 检查该用户是否存在
    const target_user = await db.getUser(target_user_id)
    if (!target_user) {
      await sendMessage({
        chat_id: message.chat.id,
        message_thread_id: message_thread_id,
        text: `找不到用户 ID: ${target_user_id}`,
        reply_to_message_id: message.message_id
      })
      return
    }

    // 检查是否被屏蔽
    const isBlocked = await db.isUserBlocked(target_user_id)
    if (!isBlocked) {
      await sendMessage({
        chat_id: message.chat.id,
        message_thread_id: message_thread_id,
        text: `用户 ${target_user_id} 未被屏蔽。`,
        reply_to_message_id: message.message_id
      })
      return
    }

    await db.blockUser(target_user_id, false)
    // 清除验证码屏蔽标记（如果存在）
    await db.deleteUserState(target_user_id, 'verification_blocked')
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: `✅ 用户 ${target_user_id} (${target_user.first_name || '未知'}) 已解除屏蔽。`,
      reply_to_message_id: message.message_id
    })
    return
  }

  // 如果在话题内且没有提供用户ID，解除该话题用户的屏蔽
  if (message_thread_id) {
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
    // 清除验证码屏蔽标记（如果存在）
    await db.deleteUserState(target_user.user_id, 'verification_blocked')
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: `✅ 用户 ${target_user.user_id} 已解除屏蔽。`,
      reply_to_message_id: message.message_id
    })
    return
  }

  // 既不在话题内，也没有提供用户ID
  await sendMessage({
    chat_id: message.chat.id,
    text: '请在话题内使用此命令，或使用格式：/unblock [用户ID]',
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

  // 如果在话题内，检查该话题用户的屏蔽状态
  if (message_thread_id) {
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
    const verificationBlockedState = await db.getUserState(target_user.user_id, 'verification_blocked')
    const isVerificationBlocked = isBlocked && verificationBlockedState === true
    const statusText = isBlocked 
      ? `已屏蔽${isVerificationBlocked ? ' (验证码超出限制)' : ''}`
      : '未屏蔽'
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: `用户 ${target_user.user_id} 屏蔽状态: ${statusText}`,
      reply_to_message_id: message.message_id
    })
    return
  }

  // 如果不在话题内，列出所有被屏蔽的用户
  try {
    const allUsers = await db.getAllUsers()
    const blockedUsers = []
    
    for (const u of allUsers) {
      const isBlocked = await db.isUserBlocked(u.user_id)
      if (isBlocked) {
        blockedUsers.push(u)
      }
    }

    if (blockedUsers.length === 0) {
      await sendMessage({
        chat_id: message.chat.id,
        text: '✅ 当前没有被屏蔽的用户。',
        reply_to_message_id: message.message_id
      })
      return
    }

    const MAX_MESSAGE_LENGTH = 3900 // 留更多余量
    
    let messages = []
    let currentMessage = `🚫 <b>被屏蔽用户列表</b> (共 ${blockedUsers.length} 人)\n\n`
    let partNumber = 1
    
    // 批量获取验证状态
    const verificationStates = await Promise.all(
      blockedUsers.map(u => 
        db.getUserState(u.user_id, 'verification_blocked')
          .catch(err => {
            console.error(`获取用户 ${u.user_id} 状态失败:`, err)
            return null
          })
      )
    )
    
    for (let i = 0; i < blockedUsers.length; i++) {
      const u = blockedUsers[i]
      const userName = u.first_name || '未知'
      const userInfo = u.username ? `@${u.username} | ID: ${u.user_id}` : `ID: ${u.user_id}`
      const verificationBlockedState = verificationStates[i]
      const mark = verificationBlockedState === true ? ' [验证码超出限制]' : ''
      let userLine = `• ${userName} (${userInfo})${mark}\n`
      
      // 处理过长的单行
      if (userLine.length > MAX_MESSAGE_LENGTH - 100) {
        const maxNameLength = 50
        const truncatedName = userName.length > maxNameLength 
          ? userName.substring(0, maxNameLength) + '...' 
          : userName
        userLine = `• ${truncatedName} (${userInfo})${mark}\n`
      }
      
      // 检查是否需要分段
      if (currentMessage.length + userLine.length > MAX_MESSAGE_LENGTH) {
        // 确保至少有内容
        if (currentMessage.split('\n').length > 3) {
          messages.push(currentMessage.trim())
          partNumber++
          currentMessage = `🚫 <b>被屏蔽用户列表</b> (第 ${partNumber} 部分)\n\n`
        }
      }
      
      currentMessage += userLine
    }
    
    // 添加最后一段
    if (currentMessage.trim() && currentMessage.split('\n').length > 2) {
      messages.push(currentMessage.trim())
    }
    
    // 如果没有用户
    if (messages.length === 0) {
      messages.push('🚫 <b>被屏蔽用户列表</b>\n\n暂无被屏蔽的用户。')
    }
    
    // 分段发送，添加延迟避免限流
    for (let i = 0; i < messages.length; i++) {
      try {
        await sendMessage({
          chat_id: message.chat.id,
          text: messages[i],
          parse_mode: 'HTML',
          reply_to_message_id: i === 0 ? message.message_id : undefined
        })
        
        // 避免发送太快
        if (i < messages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      } catch (err) {
        console.error(`发送第 ${i + 1} 段消息失败:`, err)
      }
    }
  } catch (error) {
    console.error('Error checking blocked users:', error)
    await sendMessage({
      chat_id: message.chat.id,
      text: '❌ 查询被屏蔽用户列表时出错。',
      reply_to_message_id: message.message_id
    })
  }
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

      // 处理 /start 命令（支持 /start 和 /start@botname 格式）
      if (message.text && (message.text === '/start' || message.text.startsWith('/start@'))) {
        return await handleStart(message)
      }

      // 处理来自管理员的命令（支持管理群组和私聊，支持 @botname 格式）
      if (user.id.toString() === ADMIN_UID && (chat_id.toString() === ADMIN_GROUP_ID || message.chat.type === 'private')) {
        const commandText = message.text?.split('@')[0] || '' // 提取命令部分，去掉 @botname
        
        if (commandText === '/clear') {
          return await handleClearCommand(message)
        }
        if (commandText === '/broadcast') {
          return await handleBroadcastCommand(message)
        }
        if (commandText === '/block') {
          return await handleBlockCommand(message)
        }
        if (commandText === '/unblock' || message.text?.startsWith('/unblock ')) {
          return await handleUnblockCommand(message)
        }
        if (commandText === '/checkblock') {
          return await handleCheckBlockCommand(message)
        }
        if (commandText === '/del') {
          return await handleDeleteCommand(message)
        }
        // 如果是其他命令但在私聊中使用，给出提示
        if (message.chat.type === 'private' && ['/clear', '/del'].includes(message.text)) {
          await sendMessage({
            chat_id: chat_id,
            text: '此命令需要在管理群组的话题内使用。',
            reply_to_message_id: message.message_id
          })
          return
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

    // 处理 Reaction 更新（双向同步）
    if (update.message_reaction) {
      return await handleMessageReaction(update.message_reaction)
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
  
  // 调试信息
  console.log('🔧 Webhook 注册详情:')
  console.log('TOKEN:', TOKEN ? `前10位: ${TOKEN.slice(0, 10)}...` : '❌ 未配置')
  console.log('SECRET:', secret ? '✅ 已配置' : '❌ 未配置')
  console.log('Webhook URL:', webhookUrl)
  console.log('API URL:', apiUrl('setWebhook'))
  
  // 注册 Webhook（包含 message_reaction 以支持 reaction 双向同步）
  const r = await fetch(apiUrl('setWebhook'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ['message', 'edited_message', 'message_reaction']
    }),
  })

  const result = await r.json()
  console.log('📡 Telegram API 响应:', result)
  
  // 注册机器人命令（只注册 /start，其他命令隐藏）
  try {
    const commandsResult = await fetch(apiUrl('setMyCommands'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        commands: [
          {
            command: 'start',
            description: '启动机器人 / Start the bot'
          }
        ]
      }),
    })
    const commandsData = await commandsResult.json()
    console.log('📋 命令注册响应:', commandsData)
  } catch (error) {
    console.error('❌ 命令注册失败:', error)
  }
  
  return new Response(JSON.stringify(result, null, 2), {
    headers: { 'content-type': 'application/json' }
  })
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
 * 初始化数据库表
 */
async function initDatabase(d1) {
  const statements = [
    // 创建表
    `CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      username TEXT,
      message_thread_id INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS message_mappings (
      mapping_key TEXT PRIMARY KEY,
      mapped_value INTEGER,
      created_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS topic_status (
      thread_id INTEGER PRIMARY KEY,
      status TEXT DEFAULT 'opened',
      updated_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS user_states (
      user_id TEXT NOT NULL,
      state_key TEXT NOT NULL,
      state_value TEXT,
      expiry_time INTEGER,
      PRIMARY KEY (user_id, state_key)
    )`,
    `CREATE TABLE IF NOT EXISTS blocked_users (
      user_id TEXT PRIMARY KEY,
      blocked INTEGER DEFAULT 1,
      blocked_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS message_rates (
      user_id TEXT PRIMARY KEY,
      last_message_time INTEGER
    )`,
    // 创建索引
    'CREATE INDEX IF NOT EXISTS idx_users_thread ON users(message_thread_id)',
    'CREATE INDEX IF NOT EXISTS idx_mappings_key ON message_mappings(mapping_key)',
    'CREATE INDEX IF NOT EXISTS idx_states_expiry ON user_states(expiry_time)'
  ]
  
  try {
    // 使用 batch 批量执行所有语句
    const preparedStatements = statements.map(sql => d1.prepare(sql))
    await d1.batch(preparedStatements)
    console.log('✅ Database tables initialized successfully')
  } catch (error) {
    console.error('❌ Database initialization error:', error)
    throw error
  }
}

/**
 * 主事件监听器 (使用 ES Module 格式)
 */
export default {
  async fetch(request, env, ctx) {
    // 初始化配置变量
    initConfig(env)
    
    // 初始化数据库连接
    if (!db && env.D1) {
      db = new Database(env.D1)
    }
    
    const url = new URL(request.url)
    
    if (url.pathname === WEBHOOK) {
      return await handleWebhook({ request, waitUntil: ctx.waitUntil.bind(ctx) })
    } else if (url.pathname === '/registerWebhook') {
      return await registerWebhook({ request }, url, WEBHOOK, SECRET)
    } else if (url.pathname === '/unRegisterWebhook') {
      return await unRegisterWebhook({ request })
    } else if (url.pathname === '/initDatabase') {
      try {
        await initDatabase(env.D1)
        return new Response('✅ Database initialized successfully', { 
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        })
      } catch (error) {
        return new Response(`❌ Database initialization failed: ${error.message}`, { 
          status: 500,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        })
      }
    } else {
      return new Response('No handler for this request')
    }
  }
}

