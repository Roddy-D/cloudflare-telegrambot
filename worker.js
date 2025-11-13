// === 配置变量 ===
const TOKEN = ENV_BOT_TOKEN // 从 @BotFather 获取
const WEBHOOK = '/endpoint'
const SECRET = ENV_BOT_SECRET // A-Z, a-z, 0-9, _ and -
const ADMIN_UID = ENV_ADMIN_UID // 管理员用户 ID
const ADMIN_GROUP_ID = ENV_ADMIN_GROUP_ID // 管理群组 ID (必须是开启话题的超级群组)
// === 选填变量 ===
const WELCOME_MESSAGE = (typeof ENV_WELCOME_MESSAGE !== 'undefined') ? ENV_WELCOME_MESSAGE : '欢迎使用机器人' // 欢迎消息
const MESSAGE_INTERVAL = (typeof ENV_MESSAGE_INTERVAL !== 'undefined') ? parseInt(ENV_MESSAGE_INTERVAL) || 1 : 1 // 消息间隔限制（秒）
const DELETE_TOPIC_AS_BAN = (typeof ENV_DELETE_TOPIC_AS_BAN !== 'undefined') ? ENV_DELETE_TOPIC_AS_BAN === 'true' : false // 删除话题是否等同于永久封禁
const ENABLE_VERIFICATION = (typeof ENV_ENABLE_VERIFICATION !== 'undefined') ? ENV_ENABLE_VERIFICATION === 'true' : false // 是否启用验证码验证（默认关闭）
const VERIFICATION_MAX_ATTEMPTS = (typeof ENV_VERIFICATION_MAX_ATTEMPTS !== 'undefined') ? parseInt(ENV_VERIFICATION_MAX_ATTEMPTS) || 10 : 10 // 验证码最大尝试次数（默认10次）

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
 * 数据库操作封装 (使用 KV 存储)
 */
class Database {
  // 用户相关
  async getUser(user_id) {
    const user = await horr.get(`user:${user_id}`, { type: 'json' })
    return user
  }

  async setUser(user_id, userData) {
    await horr.put(`user:${user_id}`, JSON.stringify(userData))
  }

  async getAllUsers() {
    const list = await horr.list({ prefix: 'user:' })
    const users = []
    for (const key of list.keys) {
      const user = await horr.get(key.name, { type: 'json' })
      if (user) users.push(user)
    }
    return users
  }

  // 消息映射相关
  async getMessageMap(key) {
    return await horr.get(`msgmap:${key}`, { type: 'json' })
  }

  async setMessageMap(key, value) {
    await horr.put(`msgmap:${key}`, JSON.stringify(value))
  }

  // 话题状态相关
  async getTopicStatus(thread_id) {
    return await horr.get(`topic:${thread_id}`, { type: 'json' }) || { status: 'opened' }
  }

  async setTopicStatus(thread_id, status) {
    await horr.put(`topic:${thread_id}`, JSON.stringify({ status, updated_at: Date.now() }))
  }

  // 用户状态相关（非验证码）
  async getUserState(user_id, key) {
    return await horr.get(`state:${user_id}:${key}`, { type: 'json' })
  }

  async setUserState(user_id, key, value, expirationTtl = null) {
    const options = expirationTtl ? { expirationTtl } : {}
    await horr.put(`state:${user_id}:${key}`, JSON.stringify(value), options)
  }

  async deleteUserState(user_id, key) {
    await horr.delete(`state:${user_id}:${key}`)
  }

  // 屏蔽用户相关
  async isUserBlocked(user_id) {
    return await horr.get(`blocked:${user_id}`, { type: 'json' }) || false
  }

  async blockUser(user_id, blocked = true) {
    await horr.put(`blocked:${user_id}`, JSON.stringify(blocked))
  }

  // 消息频率限制
  async getLastMessageTime(user_id) {
    return await horr.get(`lastmsg:${user_id}`, { type: 'json' }) || 0
  }

  async setLastMessageTime(user_id, timestamp) {
    await horr.put(`lastmsg:${user_id}`, JSON.stringify(timestamp))
  }
}

const db = new Database()
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
 * 发送“已送达”提示（每日一次）并在3秒后撤回
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
    
    // 检查是否是 KV 写入限制错误
    if (isKVWriteLimitError(error)) {
      // 获取用户现有数据以确定是否已有话题
      const user_data = await db.getUser(user.id).catch(() => null)
      const message_thread_id = user_data?.message_thread_id || null
      
      await handleKVLimitError(user, message_thread_id)
    }
    
    // 重新抛出错误以便上层处理
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
        caption: `👤 ${user.first_name || user.id}\n👤 ${user.first_name || user.id}\n\n📱 ${user.id}\n📱 ${user.id}\n\n🔗 ${user.username ? `直接联系: @${user.username}\nDirect contact: @${user.username}` : `直接联系: tg://user?id=${user.id}\nDirect contact: tg://user?id=${user.id}`}`,
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
        text: `👤 ${user.first_name || user.id}\n👤 ${user.first_name || user.id}\n\n📱 ${user.id}\n📱 ${user.id}\n\n🔗 ${user.username ? `直接联系: @${user.username}\nDirect contact: @${user.username}` : `直接联系: tg://user?id=${user.id}\nDirect contact: tg://user?id=${user.id}`}`,
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
    await sendMessage({
      chat_id: user_id,
      text: '你已成功激活机器人。',
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
          totalAttempts: 0,
          timestamp: Date.now()
        }, 120) // 120秒后自动过期
        
        await sendMessage({
          chat_id: chat_id,
          text: `${mentionHtml(user_id, user.first_name || user_id)}，欢迎使用！\n\n🔐 请输入验证码\n\n验证码是以下四位数 ${challenge.challenge} 的每一位数字加上 ${challenge.offset}，超过9则取个位数\n\n⏰ 请在1分钟内回复验证码，否则将失效\n\n${mentionHtml(user_id, user.first_name || user_id)}, Welcome!\n\n🔐 Please enter the verification code\n\nThe code is a 4-digit number. The answer is each digit of ${challenge.challenge} plus ${challenge.offset}, if over 9, keep only the ones digit\n\n⏰ Please reply within 1 minute, or the code will expire`,
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
 * 检查是否是 KV 写入限制错误
 */
function isKVWriteLimitError(error) {
  const errorMessage = (error.message || '').toLowerCase()
  return errorMessage.includes('kv put() limit exceeded') || 
         errorMessage.includes('kv write limit') ||
         errorMessage.includes('quota exceeded')
}

// 用于跟踪每日已发送KV限制警告的用户（使用内存变量）
let dailyKVAlertSent = new Set()
let lastAlertDate = new Date().toDateString() // 记录上次警告的日期

/**
 * 处理 KV 写入限制错误
 */
async function handleKVLimitError(user, message_thread_id) {
  const user_id = user.id
  const userDisplayName = user.first_name || '用户'
  const currentDate = new Date().toDateString()
  
  try {
    // 检查是否是新的一天，如果是则清空警告记录
    if (currentDate !== lastAlertDate) {
      dailyKVAlertSent.clear()
      lastAlertDate = currentDate
      console.log(`🔄 Reset daily KV alert tracking for new date: ${currentDate}`)
    }
    
    // 检查是否已经为该用户发送过警告
    const alertKey = `${user_id}_${currentDate}`
    if (!dailyKVAlertSent.has(alertKey)) {
      // 还没有为该用户发送过警告，发送给管理员
      let alertText = `🚨 <b>KV 存储限制警告</b>\n\n` +
                     `⚠️ 已达到 Cloudflare KV 每日写入上限！\n\n` +
                     `👤 用户信息：\n` +
                     `• 姓名：${userDisplayName}\n` +
                     `• 用户名：@${user.username || '无'}\n` +
                     `• Telegram ID：<code>${user_id}</code>\n` +
                      (user.username ? '' : `• 直接联系： tg://user?id=${user_id}\n`)  
      
      if (message_thread_id) {
        alertText += `• 话题ID：${message_thread_id}\n`
        alertText += `• 状态：已有话题，消息无法转发\n\n`
      } else {
        alertText += `• 状态：未创建话题，无法创建新话题\n\n`
      }
      
      alertText += `📋 <b>影响：</b>\n` +
                  `• 无法创建新话题\n` +
                  `• 无法更新用户数据\n` +
                  `• 无法转发用户消息\n\n` +
                  `🔧 <b>建议：</b>\n` +
                  `• 等待 UTC 时间重置（通常为每日 00:00）\n` +
                  `• 考虑升级 Cloudflare 计划\n` +
                  `• 检查是否有异常的写入操作\n\n` +
                  `⏰ 时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n` +
                  `ℹ️ 注意：同一用户每日仅提醒一次`
      
      await sendMessage({
        chat_id: ADMIN_UID,
        text: alertText,
        parse_mode: 'HTML'
      })
      
      // 记录已发送警告
      dailyKVAlertSent.add(alertKey)
      console.log(`✅ KV limit alert sent to admin for user ${user_id}`)
    } else {
      console.log(`⏭️ KV limit alert already sent for user ${user_id} today, skipping admin notification`)
    }
    
    // 总是通知用户（不管是否已经通知过管理员）
    await sendMessage({
      chat_id: user_id,
      text: `抱歉，由于系统存储限制，您的消息暂时无法送达。\nSorry, due to system storage limitations, your message cannot be delivered temporarily.\n\n` +
            `对方已收到通知，请明日重试或等待问题解决。\nHe has been notified, please try again tomorrow or wait for the issue to be resolved.\n\n` +
            `如有紧急情况，请直接联系对方。\nIf there is an emergency, please contact him directly.`
    })
    
    console.log(`✅ KV limit error handled for user ${user_id}, topic: ${message_thread_id || 'none'}`)
    
  } catch (alertError) {
    console.error('❌ Failed to handle KV limit error:', alertError)
  }
}

/**
 * 生成验证码挑战和答案（完全随机）
 */
function generateVerificationChallenge(user_id) {
  // 随机生成四位数字
  let challengeDigits = ''
  for (let i = 0; i < 4; i++) {
    challengeDigits += Math.floor(Math.random() * 10).toString()
  }
  
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
 * 用户消息转发到管理员 (u2a)
 */
async function forwardMessageU2A(message) {
  const user = message.from
  const user_id = user.id
  const chat_id = message.chat.id

  try {
    // 1. 检查验证状态（仅当启用验证功能时）- 使用 Cache API
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
          totalAttempts: 0,
          timestamp: Date.now()
        }, 120) // 120秒后自动过期
        
        await sendMessage({
          chat_id: chat_id,
          text: `🔐 请输入验证码\n\n验证码是以下四位数 ${challenge.challenge} 的每一位数字加上 ${challenge.offset}，超过9则取个位数\n\n⏰ 请在1分钟内回复验证码，否则将失效\n\n🔐 Please enter the verification code\n\nThe code is a 4-digit number. The answer is each digit of ${challenge.challenge} plus ${challenge.offset}, if over 9, keep only the ones digit\n\n⏰ Please reply within 1 minute, or the code will expire`,
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
        await sendMessage({
          chat_id: chat_id,
          text: `❌ 验证失败次数过多（${VERIFICATION_MAX_ATTEMPTS}次），已被禁止使用。\n❌ Too many failed attempts (${VERIFICATION_MAX_ATTEMPTS} times), access denied.`
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
      
      // 验证答案
      if (userAnswer === verificationState.answer) {
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
          await verificationCache.setVerification(user_id, 'verification', {
            ...verificationState,
            totalAttempts: newTotalAttempts
          }, 120) // 120秒后自动过期
          
          await sendMessage({
            chat_id: chat_id,
            text: `❌ 验证失败次数已达上限（${VERIFICATION_MAX_ATTEMPTS}次），已被禁止使用。\n❌ Maximum verification attempts reached (${VERIFICATION_MAX_ATTEMPTS} times), access denied.`
          })
          return
        }
        
        // 重新生成新的验证码
        const challenge = generateVerificationChallenge(user_id)
        await verificationCache.setVerification(user_id, 'verification', {
          challenge: challenge.challenge,
          answer: challenge.answer,
          totalAttempts: newTotalAttempts,
          timestamp: Date.now()
        }, 120) // 120秒后自动过期
        
        await sendMessage({
          chat_id: chat_id,
          text: `❌ 验证失败（${newTotalAttempts}/${VERIFICATION_MAX_ATTEMPTS}）\n\n🔐 请重新输入验证码\n\n验证码是以下四位数 ${challenge.challenge} 的每一位数字加上 ${challenge.offset}，超过9则取个位数\n\n⏰ 请在1分钟内回复验证码，否则将失效\n\n❌ Verification failed (${newTotalAttempts}/${VERIFICATION_MAX_ATTEMPTS})\n\n🔐 Please re-enter the verification code\n\nThe code is a 4-digit number. The answer is each digit of ${challenge.challenge} plus ${challenge.offset}, if over 9, keep only the ones digit\n\n⏰ Please reply within 1 minute, or the code will expire`,
          parse_mode: 'HTML'
        })
        return
      }
      }
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
            text: `发送消息过于频繁，请等待 ${timeLeft} 秒后再试。\nSending messages too frequently, please wait ${timeLeft} seconds before trying again.`
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
        text: '你已被屏蔽，无法发送消息。\nYou have been blocked and cannot send messages.'
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
        await sendMessage({
          chat_id: chat_id,
          text: '对话已被对方关闭。您的消息暂时无法送达。如需继续，请等待或请求对方重新打开对话。\nThe conversation has been closed by him. Your message cannot be delivered temporarily. If you need to continue, please wait or ask him to reopen the conversation.'
        })
        return
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
        console.log(`✅ Forwarded u2a: user(${user_id}) msg(${message.message_id}) -> group msg(${sent.result.message_id})`)
        console.log(`✅ Stored mapping: u2a:${message.message_id} -> ${sent.result.message_id}`)
        console.log(`✅ Stored mapping: a2u:${sent.result.message_id} -> ${message.message_id}`)
        // 发送“已送达”提示（每日一次），3秒后撤回
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
        
        if (!DELETE_TOPIC_AS_BAN) {
          await sendMessage({
            chat_id: chat_id,
            text: '发送失败：你之前的对话已被删除。请重新发送一次当前消息。\nSend failed: Your previous conversation has been deleted. Please resend the current message.'
          })
        } else {
          await sendMessage({
            chat_id: chat_id,
            text: '发送失败：你的对话已被永久删除。消息无法送达。\nSend failed: Your conversation has been permanently deleted. Message cannot be delivered.'
          })
        }
      } else {
        await sendMessage({
          chat_id: chat_id,
          text: '发送消息时遇到问题，请稍后再试。\nEncountered a problem while sending the message, please try again later.'
        })
      }
    }
    
  } catch (error) {
    console.error('❌ Error in forwardMessageU2A:', error)
    
    // 检查是否是 KV 写入限制错误
    if (isKVWriteLimitError(error)) {
      const user_data = await db.getUser(user_id).catch(() => null)
      const message_thread_id = user_data?.message_thread_id || null
      
      await handleKVLimitError(user, message_thread_id)
      return
    }
    
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
      console.log(`Forwarded a2u: group msg(${message.message_id}) -> user(${target_user.user_id})`)
      console.log(`Stored mapping: a2u:${message.message_id} -> ${sent.result.message_id}`)
      console.log(`Stored mapping: u2a:${sent.result.message_id} -> ${message.message_id}`)
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
      // You don't have permission to perform this operation.
      reply_to_message_id: message.message_id
    })
    return
  }

  if (!message_thread_id) {
    await sendMessage({
      chat_id: message.chat.id,
      text: '请在需要清除的用户对话（话题）中执行此命令。',
      // Please execute this command in the user conversation (topic) that needs to be cleared.
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
      
      // 清理消息映射记录
      const list = await horr.list({ prefix: 'msgmap:u2a:' })
      for (const key of list.keys) {
        await horr.delete(key.name)
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
  
  const r = await fetch(apiUrl('setWebhook'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ['message', 'edited_message']
    }),
  })

  const result = await r.json()
  console.log('📡 Telegram API 响应:', result)
  
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
