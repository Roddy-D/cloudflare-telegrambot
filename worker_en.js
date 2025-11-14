// === Configuration variables (obtained from env) ===
let TOKEN = null
let WEBHOOK = '/endpoint'
let SECRET = null
let ADMIN_UID = null
let ADMIN_GROUP_ID = null
let WELCOME_MESSAGE = 'Welcome to the bot'
let MESSAGE_INTERVAL = 1
let DELETE_TOPIC_AS_BAN = false
let ENABLE_VERIFICATION = false
let VERIFICATION_MAX_ATTEMPTS = 10

// Initialize configuration variables
function initConfig(env) {
  TOKEN = env.ENV_BOT_TOKEN
  SECRET = env.ENV_BOT_SECRET
  ADMIN_UID = env.ENV_ADMIN_UID
  ADMIN_GROUP_ID = env.ENV_ADMIN_GROUP_ID
  WELCOME_MESSAGE = env.ENV_WELCOME_MESSAGE || 'Welcome to the bot'
  MESSAGE_INTERVAL = env.ENV_MESSAGE_INTERVAL ? parseInt(env.ENV_MESSAGE_INTERVAL) || 1 : 1
  DELETE_TOPIC_AS_BAN = (env.ENV_DELETE_TOPIC_AS_BAN || '').toLowerCase() === 'true'
  ENABLE_VERIFICATION = (env.ENV_ENABLE_VERIFICATION || '').toLowerCase() === 'true'
  VERIFICATION_MAX_ATTEMPTS = env.ENV_VERIFICATION_MAX_ATTEMPTS ? parseInt(env.ENV_VERIFICATION_MAX_ATTEMPTS) || 10 : 10
}

/**
 * Telegram API request wrapper
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
 * Verification code cache management (using Cache API)
 */
class VerificationCache {
  constructor() {
    this.cacheName = 'verification-cache'
  }

  // Generate cache key URL
  _getCacheUrl(user_id, key) {
    return `https://internal.cache/${user_id}/${key}`
  }

  // Get verification code data
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

  // Set verification code data (with expiration time)
  async setVerification(user_id, key, value, expirationSeconds = null) {
    try {
      const cache = await caches.open(this.cacheName)
      const cacheUrl = this._getCacheUrl(user_id, key)
      
      const headers = new Headers({
        'Content-Type': 'application/json',
        'Cache-Control': expirationSeconds 
          ? `max-age=${expirationSeconds}` 
          : 'max-age=86400' // Default 24 hours
      })

      const response = new Response(JSON.stringify(value), { headers })
      await cache.put(cacheUrl, response)
      
      return true
    } catch (error) {
      console.error('Error setting verification in cache:', error)
      return false
    }
  }

  // Delete verification code data
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
 * Database operation wrapper (using D1 database)
 */
class Database {
  constructor(d1) {
    this.d1 = d1
  }

  // User related
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

  // Message mapping related
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

  // Topic status related
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

  // User state related (non-verification)
  async getUserState(user_id, key) {
    const result = await this.d1.prepare(
      'SELECT state_value, expiry_time FROM user_states WHERE user_id = ? AND state_key = ?'
    ).bind(user_id.toString(), key).first()
    
    if (!result) return null
    
    // Check if expired
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

  // Blocked user related
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

  // Message rate limiting
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

  // Cleanup expired data (call periodically)
  async cleanupExpiredStates() {
    const now = Date.now()
    await this.d1.prepare(
      'DELETE FROM user_states WHERE expiry_time IS NOT NULL AND expiry_time < ?'
    ).bind(now).run()
  }

  // Delete all message mappings for a user
  async deleteUserMessageMappings(user_id) {
    await this.d1.prepare(
      'DELETE FROM message_mappings WHERE mapping_key LIKE ?'
    ).bind(`u2a:${user_id}:%`).run()
  }
}

let db = null
const verificationCache = new VerificationCache()

/**
 * Utility functions
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
 * Send "Delivered" notice (once per day) and delete after 3 seconds
 */
async function maybeSendDeliveredNotice(sender_user_id, target_chat_id, options = {}) {
  const { message_thread_id = null, reply_to_message_id = null, text = 'Your message has been delivered' } = options

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
 * Update user database
 */
async function updateUserDb(user) {
  try {
    const existingUser = await db.getUser(user.id)
    if (existingUser) {
      // Update existing user info
      existingUser.first_name = user.first_name || 'Unknown'
      existingUser.last_name = user.last_name
      existingUser.username = user.username
      existingUser.updated_at = Date.now()
      await db.setUser(user.id, existingUser)
    } else {
      // Create new user
      const newUser = {
        user_id: user.id,
        first_name: user.first_name || 'Unknown',
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
 * Send contact card
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
        caption: `👤 ${user.first_name || user.id}\n\n📱 ${user.id}\n\n🔗 ${user.username ? `Contact directly: @${user.username}` : `Contact directly: tg://user?id=${user.id}`}`,
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
        text: `👤 ${user.first_name || user.id}\n\n📱 ${user.id}\n\n🔗 ${user.username ? `Contact directly: @${user.username}` : `Contact directly: tg://user?id=${user.id}`}`,
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
 * Handle /start command
 */
async function handleStart(message) {
  const user = message.from
  const user_id = user.id
  const chat_id = message.chat.id
  
  await updateUserDb(user)
  
  if (user_id.toString() === ADMIN_UID) {
    const commandList = `🤖 <b>Bot Management Commands</b>

<b>Topic Management:</b>
• /clear - Delete topic and clean up data
• /del - Delete messages between the user and the bot (reply to the message to delete), only effective for messages within 48 hours, beyond 48 hours even if it prompts success it won't actually work

<b>User Management:</b>
• /block - Block user (use in topic)
• /unblock - Unblock user (use in topic or /unblock [user_id])
• /checkblock - View block list (outside topic) or check single user (in topic)

<b>Message Management:</b>
• /broadcast - Broadcast message (reply to the message to broadcast)

<b>Configuration:</b>
• Verification: ${ENABLE_VERIFICATION ? 'Enabled' : 'Disabled'}
• Max verification attempts: ${VERIFICATION_MAX_ATTEMPTS} times
• Message interval: ${MESSAGE_INTERVAL}s
• Delete topic as ban: ${DELETE_TOPIC_AS_BAN ? 'Yes' : 'No'}

✅ Bot is activated and running normally.`
    
    await sendMessage({
      chat_id: chat_id,  // Send to current chat (group or private)
      text: commandList,
      parse_mode: 'HTML'
    })
  } else {
    // Check if verification is enabled
    if (ENABLE_VERIFICATION) {
      // Check if user is verified (using Cache API)
      const isVerified = await verificationCache.getVerification(user_id, 'verified')
      
      if (!isVerified) {
        // Not verified, send verification code
        const challenge = generateVerificationChallenge(user_id)
        await verificationCache.setVerification(user_id, 'verification', {
          challenge: challenge.challenge,
          answer: challenge.answer,
          totalAttempts: 0,
          timestamp: Date.now()
        }, 120) // Auto-expire after 120 seconds
        
        await sendMessage({
          chat_id: chat_id,
          text: `${mentionHtml(user_id, user.first_name || user_id)}, Welcome!\n\n🔐 Please enter the verification code\n\nThe code is each digit of the 4-digit number ${challenge.challenge} plus ${challenge.offset}, if over 9, keep only the ones digit\n\n⏰ Please reply within 1 minute, or the code will expire`,
          parse_mode: 'HTML'
        })
        return
      }
    }
    
    // Already verified or verification not enabled, send welcome message
    await sendMessage({
      chat_id: chat_id,
      text: `${mentionHtml(user_id, user.first_name || user_id)}:\n\n${WELCOME_MESSAGE}`,
      parse_mode: 'HTML'
    })
  }
}

/**
 * Generate verification challenge and answer (completely random)
 */
function generateVerificationChallenge(user_id) {
  // Randomly generate 4 digits
  let challengeDigits = ''
  for (let i = 0; i < 4; i++) {
    challengeDigits += Math.floor(Math.random() * 10).toString()
  }
  
  // Randomly generate offset (1-9, avoid 0 as it has no effect)
  const offset = Math.floor(Math.random() * 9) + 1
  
  // Calculate correct answer
  let answer = ''
  for (let i = 0; i < challengeDigits.length; i++) {
    const digit = parseInt(challengeDigits[i])
    const newDigit = (digit + offset) % 10 // Keep only ones digit if over 9
    answer += newDigit.toString()
  }
  
  return {
    challenge: challengeDigits,
    answer: answer,
    offset: offset
  }
}

/**
 * Forward user messages to admin (u2a)
 */
async function forwardMessageU2A(message) {
  const user = message.from
  const user_id = user.id
  const chat_id = message.chat.id

  try {
    // 1. Admin bypasses all checks
    if (user_id.toString() === ADMIN_UID) {
      // Admin skips verification, blocking, rate limiting, etc.
      // Continue to message forwarding
    } else {
      // 2. Check verification status (only when verification is enabled) - using Cache API
      if (ENABLE_VERIFICATION) {
      const verificationState = await verificationCache.getVerification(user_id, 'verification')
      const isVerified = await verificationCache.getVerification(user_id, 'verified')
      
      // If user is not verified
      if (!isVerified) {
      // If verification challenge hasn't been sent yet, send it
      if (!verificationState) {
        const challenge = generateVerificationChallenge(user_id)
        await verificationCache.setVerification(user_id, 'verification', {
          challenge: challenge.challenge,
          answer: challenge.answer,
          totalAttempts: 0,
          timestamp: Date.now()
        }, 120) // Auto-expire after 120 seconds
        
        await sendMessage({
          chat_id: chat_id,
          text: `🔐 Please enter the verification code\n\nThe code is each digit of the 4-digit number ${challenge.challenge} plus ${challenge.offset}, if over 9, keep only the ones digit\n\n⏰ Please reply within 1 minute, or the code will expire`,
          parse_mode: 'HTML'
        })
        return
      }
      
      // Check if verification code has expired (1 minute = 60000 milliseconds)
      const currentTime = Date.now()
      const verificationTime = verificationState.timestamp || 0
      const timeElapsed = currentTime - verificationTime
      
      if (timeElapsed > 60000) {
        // Verification code expired, delete verification data
        await verificationCache.deleteVerification(user_id, 'verification')
        
        await sendMessage({
          chat_id: chat_id,
          text: `⏰ Verification code expired\n\nYou did not reply within 1 minute, the code has expired.\n\nPlease send a new message to get a new verification code.`
        })
        return
      }
      
      // Check if maximum attempts reached
      const totalAttempts = verificationState.totalAttempts || 0
      if (totalAttempts >= VERIFICATION_MAX_ATTEMPTS) {
        // Permanently block user
        await db.blockUser(user_id, true)
        
        await sendMessage({
          chat_id: chat_id,
          text: `❌ Too many failed verification attempts (${VERIFICATION_MAX_ATTEMPTS} times), permanently blocked.`
        })
        return
      }
      
      // User has received challenge, check answer
      const userAnswer = message.text?.trim()
      
      if (!userAnswer) {
        await sendMessage({
          chat_id: chat_id,
          text: `Please enter the numeric answer.`
        })
        return
      }
      
      // Verify answer
      if (userAnswer === verificationState.answer) {
        // Verification successful
        await verificationCache.setVerification(user_id, 'verified', true)
        await verificationCache.deleteVerification(user_id, 'verification')
        
        await sendMessage({
          chat_id: chat_id,
          text: `✅ Verification successful! You can now send messages.`
        })
        return
      } else {
        // Verification failed, increment attempts
        const newTotalAttempts = totalAttempts + 1
        
        // Check if limit reached
        if (newTotalAttempts >= VERIFICATION_MAX_ATTEMPTS) {
          // Permanently block user
          await db.blockUser(user_id, true)
          
          await sendMessage({
            chat_id: chat_id,
            text: `❌ Maximum verification attempts reached (${VERIFICATION_MAX_ATTEMPTS} times), permanently blocked.`
          })
          return
        }
        
        // Generate new verification code
        const challenge = generateVerificationChallenge(user_id)
        await verificationCache.setVerification(user_id, 'verification', {
          challenge: challenge.challenge,
          answer: challenge.answer,
          totalAttempts: newTotalAttempts,
          timestamp: Date.now()
        }, 120) // Auto-expire after 120 seconds
        
        await sendMessage({
          chat_id: chat_id,
          text: `❌ Verification failed (${newTotalAttempts}/${VERIFICATION_MAX_ATTEMPTS})\n\n🔐 Please re-enter the verification code\n\nThe code is each digit of the 4-digit number ${challenge.challenge} plus ${challenge.offset}, if over 9, keep only the ones digit\n\n⏰ Please reply within 1 minute, or the code will expire`,
          parse_mode: 'HTML'
        })
        return
      }
      }
      }

      // 3. Message rate limiting
      if (MESSAGE_INTERVAL > 0) {
      const lastMessageTime = await db.getLastMessageTime(user_id)
      const currentTime = Date.now()
      
      if (currentTime < lastMessageTime + MESSAGE_INTERVAL * 1000) {
        const timeLeft = Math.ceil((lastMessageTime + MESSAGE_INTERVAL * 1000 - currentTime) / 1000)
        if (timeLeft > 0) {
          await sendMessage({
            chat_id: chat_id,
            text: `You are sending messages too frequently. Please wait ${timeLeft} seconds and try again.`
          })
          return
        }
      }
        await db.setLastMessageTime(user_id, currentTime)
      }

      // 4. Check if blocked
      const isBlocked = await db.isUserBlocked(user_id)
      if (isBlocked) {
        await sendMessage({
          chat_id: chat_id,
          text: 'You are blocked and cannot send messages.'
        })
        return
      }
    }

    // 5. Update user info
    await updateUserDb(user)

    // 6. Get or create topic
    let user_data = await db.getUser(user_id)
    if (!user_data) {
      // If user data does not exist (possibly latency), wait and retry once
      console.log(`User data not found for ${user_id}, retrying...`)
      await delay(100) // wait 100ms
      user_data = await db.getUser(user_id)
      
      if (!user_data) {
        // Still missing, create fallback data and save
        console.log(`Creating fallback user data for ${user_id}`)
        user_data = {
          user_id: user_id,
          first_name: user.first_name || 'Unknown',
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
    
    // Check topic status
    if (message_thread_id) {
      const topicStatus = await db.getTopicStatus(message_thread_id)
      console.log(`Topic ${message_thread_id} status check:`, topicStatus)
      
      if (topicStatus.status === 'closed') {
        await sendMessage({
          chat_id: chat_id,
          text: 'The conversation has been closed by the recipient. Your message cannot be delivered at the moment. To continue, please wait or ask the recipient to reopen the conversation.'
        })
        return
      } else if (topicStatus.status === 'deleted' || topicStatus.status === 'removed') {
        // Topic was deleted; need to recreate
        const oldThreadId = message_thread_id
        message_thread_id = null
        user_data.message_thread_id = null
        await db.setUser(user_id, user_data)
        // Clean up old topic status record
        await db.setTopicStatus(oldThreadId, 'removed')
        console.log(`Topic ${oldThreadId} was deleted/removed, will create new one for user ${user_id}`)
      }
    }

    console.log(`After topic status check, message_thread_id: ${message_thread_id}`)

    // Create new topic
    if (!message_thread_id) {
      console.log(`Creating new topic for user ${user_id} (${user.first_name || 'User'})`)
      try {
        const topicName = `${user.first_name || 'User'}|${user_id}`.substring(0, 128)
        console.log(`Topic name: ${topicName}`)
        const forumTopic = await createForumTopic(ADMIN_GROUP_ID, topicName)
        
        if (forumTopic.ok) {
          message_thread_id = forumTopic.result.message_thread_id
          user_data.message_thread_id = message_thread_id
          await db.setUser(user_id, user_data)
          await db.setTopicStatus(message_thread_id, 'opened')
          
          console.log(`✅ Created new topic ${message_thread_id} for user ${user_id}`)
          
          // Send contact card
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
            text: 'Failed to create a conversation. Please try again later or contact the recipient.'  
          })
          return
        }
      } catch (error) {
        console.error('Failed to create topic:', error)
        await sendMessage({
          chat_id: chat_id,
          text: 'An error occurred while creating the conversation. Please try again later.'
        })
        return
      }
    }

    console.log(`Final message_thread_id before forwarding: ${message_thread_id}`)
    
    // 7. Handle message forwarding
    console.log(`Starting message forwarding to topic ${message_thread_id}`)
    try {
      const params = { message_thread_id: message_thread_id }
      
      // Handle reply message
      if (message.reply_to_message) {
        console.log(`User replying to message: ${message.reply_to_message.message_id}`)
        const originalId = await db.getMessageMap(`u2a:${message.reply_to_message.message_id}`)
        console.log(`Found original group message: ${originalId}`)
        if (originalId) {
          params.reply_to_message_id = originalId
          console.log(`Setting reply_to_message_id: ${originalId}`)
        }
      }

      // Directly forward the message (regardless of media group)
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
        throw copyError // Re-throw for outer catch
      }
      
      if (sent && sent.ok) {
        await db.setMessageMap(`u2a:${message.message_id}`, sent.result.message_id)
        await db.setMessageMap(`a2u:${sent.result.message_id}`, message.message_id)
        console.log(`✅ Forwarded u2a: user(${user_id}) msg(${message.message_id}) -> group msg(${sent.result.message_id})`)
        console.log(`✅ Stored mapping: u2a:${message.message_id} -> ${sent.result.message_id}`)
        console.log(`✅ Stored mapping: a2u:${sent.result.message_id} -> ${message.message_id}`)
        // Send delivered notice (once per day), then delete after 3s
        await maybeSendDeliveredNotice(user_id, chat_id, { reply_to_message_id: message.message_id })
      } else {
        console.error(`❌ copyMessage failed, sent.ok = false`)
        console.error(`❌ copyMessage response:`, sent)
        
        // Check whether it is a topic-deleted error
        const errorText = (sent.description || '').toLowerCase()
        console.log(`🔍 Checking copyMessage error text: "${errorText}"`)
        
        if (errorText.includes('message thread not found') || 
            errorText.includes('topic deleted') || 
            errorText.includes('thread not found') ||
            errorText.includes('topic not found')) {
          
          // Create an error to trigger deletion handling
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
      
      // Check whether the topic was deleted (case-insensitive)
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
        
        // Topic deleted, clean up data
        const oldThreadId = user_data.message_thread_id
        user_data.message_thread_id = null
        await db.setUser(user_id, user_data)
        
        // Clean up topic status record
        if (oldThreadId) {
          await db.setTopicStatus(oldThreadId, 'removed')
        }
        
        console.log(`Topic ${oldThreadId} seems deleted. Cleared thread_id for user ${user_id}`)
        
        if (!DELETE_TOPIC_AS_BAN) {
          await sendMessage({
            chat_id: chat_id,
            text: 'Send failed: your previous conversation was deleted. Please resend the current message.'
          })
        } else {
          await sendMessage({
            chat_id: chat_id,
            text: 'Send failed: your conversation was permanently deleted. Messages cannot be delivered.'
          })
        }
      } else {
        await sendMessage({
          chat_id: chat_id,
          text: 'There was a problem sending your message. Please try again later.'
        })
      }
    }
    
  } catch (error) {
    console.error('❌ Error in forwardMessageU2A:', error)
    
    // Generic handling for other errors
    await sendMessage({
      chat_id: chat_id,
      text: 'An error occurred while processing your message. Please try again later.'
    })
  }
}

/**
 * Forward admin messages to user (a2u)
 */
async function forwardMessageA2U(message) {
  const user = message.from
  const message_thread_id = message.message_thread_id

  // Only process messages within topics; ignore bot messages
  if (!message_thread_id || user.is_bot) {
    return
  }

  // Find target user
  const target_user = await findUserByThreadId(message_thread_id)
  if (!target_user) {
    console.warn(`No user found for thread ${message_thread_id}`)
    return
  }

  // Check topic status
  const topicStatus = await db.getTopicStatus(message_thread_id)
  if (topicStatus.status === 'closed') {
    // Optionally notify admin
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: 'Reminder: This conversation is closed. Messages from the user cannot be sent unless you reopen the conversation.',
      reply_to_message_id: message.message_id
    })
  }

  // Forward message to user
  try {
    const params = {}
    
    // Handle reply message
    if (message.reply_to_message) {
      console.log(`Admin replying to message: ${message.reply_to_message.message_id}`)
      const originalId = await db.getMessageMap(`a2u:${message.reply_to_message.message_id}`)
      console.log(`Found original user message: ${originalId}`)
      if (originalId) {
        params.reply_to_message_id = originalId
        console.log(`Setting reply_to_message_id: ${originalId}`)
      }
    }

    // Directly forward the message (regardless of media group)
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
        text: `⚠️ Unable to send the message to user ${mentionHtml(target_user.user_id, target_user.first_name || target_user.user_id)}. Possible reasons: user deactivated, blocked the bot, or deleted the conversation.`,
        reply_to_message_id: message.message_id,
        parse_mode: 'HTML'
      })
    } else {
      await sendMessage({
        chat_id: message.chat.id,
        message_thread_id: message_thread_id,
        text: `Failed to send message to user: ${error.description || error.message}`,
        reply_to_message_id: message.message_id
      })
    }
  }
}

/**
 * Find user by topic ID
 */
async function findUserByThreadId(thread_id) {
  const users = await db.getAllUsers()
  return users.find(u => u.message_thread_id === thread_id)
}

/**
 * Handle message edits
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
    // User edited message; sync to admin group
    target_chat_id = ADMIN_GROUP_ID
  } else {
    // Admin edited message; find the corresponding user
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
 * Clear topic command
 */
async function handleClearCommand(message) {
  const user = message.from
  const message_thread_id = message.message_thread_id

  if (user.id.toString() !== ADMIN_UID) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: 'You do not have permission to perform this action.',
      reply_to_message_id: message.message_id
    })
    return
  }

  if (!message_thread_id) {
    await sendMessage({
      chat_id: message.chat.id,
      text: 'Please run this command within the user conversation (topic) that needs to be cleared.',
      reply_to_message_id: message.message_id
    })
    return
  }

  try {
    // Find related user
    const target_user = await findUserByThreadId(message_thread_id)
    
    // Delete topic
    await deleteForumTopic(ADMIN_GROUP_ID, message_thread_id)
    console.log(`Admin ${user.id} cleared topic ${message_thread_id}`)
    
    // Clean up database
    if (target_user) {
      target_user.message_thread_id = null
      await db.setUser(target_user.user_id, target_user)
      
      // D1 version: Delete message mapping records
      await db.deleteUserMessageMappings(target_user.user_id)
    }
    
    await db.setTopicStatus(message_thread_id, 'deleted')
    
  } catch (error) {
    console.error('Error clearing topic:', error)
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: `Failed to clear topic: ${error.description || error.message}`,
      reply_to_message_id: message.message_id
    })
  }
}

/**
 * Broadcast command
 */
async function handleBroadcastCommand(message) {
  const user = message.from
  
  if (user.id.toString() !== ADMIN_UID) {
    await sendMessage({
      chat_id: message.chat.id,
      text: 'You do not have permission to perform this action.',
      reply_to_message_id: message.message_id
    })
    return
  }

  if (!message.reply_to_message) {
    await sendMessage({
      chat_id: message.chat.id,
      text: 'Please reply to the message you want to broadcast to use this command.',
      reply_to_message_id: message.message_id
    })
    return
  }

  const broadcastMessage = message.reply_to_message
  
  // Send confirmation message immediately
  await sendMessage({
    chat_id: message.chat.id,
    text: `📢 Broadcast task started. Message ID to broadcast: ${broadcastMessage.message_id}`,
    reply_to_message_id: message.message_id
  })
  
  // Use a Promise instead of setTimeout to avoid issues in Workers
  const broadcastPromise = (async () => {
    try {
      const users = await db.getAllUsers()
      const activeUsers = users.filter(u => u.message_thread_id)
      
      if (activeUsers.length === 0) {
        await sendMessage({
          chat_id: message.chat.id,
          text: '❌ No active users found. Broadcast cancelled.',
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
          await delay(100) // avoid rate limit
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
      
      // Fix: send results to admin group instead of admin DM
      await sendMessage({
        chat_id: message.chat.id,
        text: `📢 Broadcast completed:\n✅ Success: ${success}\n❌ Failed: ${failed}\n🚫 Blocked/Deactivated: ${blocked}\n👥 Total: ${activeUsers.length}`,
        reply_to_message_id: message.message_id
      })
    } catch (error) {
      console.error('Broadcast error:', error)
      await sendMessage({
        chat_id: message.chat.id,
        text: `❌ Broadcast failed: ${error.message}`,
        reply_to_message_id: message.message_id
      })
    }
  })()
  
  // In Workers, use event.waitUntil to ensure async completes
  // We cannot access event here, so rely on the Promise
  return broadcastPromise
}

/**
 * Handle delete message command
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
      text: 'Please use this command in a topic.',
      reply_to_message_id: message.message_id
    })
    return
  }

  if (!message.reply_to_message) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: 'Please reply to the message you want to delete.',
      reply_to_message_id: message.message_id
    })
    return
  }

  const target_user = await findUserByThreadId(message_thread_id)
  if (!target_user) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: 'Target user not found.',
      reply_to_message_id: message.message_id
    })
    return
  }

  // Find corresponding user-side message ID
  const admin_message_id = message.reply_to_message.message_id
  const user_message_id = await db.getMessageMap(`a2u:${admin_message_id}`)

  if (!user_message_id) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: 'No corresponding user message found. It may be a system message or already deleted.',
      reply_to_message_id: message.message_id
    })
    return
  }

  try {
    // Delete user-side message
    await deleteMessage(target_user.user_id, user_message_id)
    
    // Delete the command message itself
    await deleteMessage(message.chat.id, message.message_id)
    
    // Send success notification
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: '✅ User-side message deleted.',
      reply_to_message_id: admin_message_id
    })
    
    console.log(`Admin deleted message: admin_msg(${admin_message_id}) -> user_msg(${user_message_id})`)
  } catch (error) {
    console.error('Error deleting message:', error)
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: `❌ Failed to delete message: ${error.description || error.message}`,
      reply_to_message_id: message.message_id
    })
  }
}

/**
 * Handle block command
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
      text: 'Please use the block command in the relevant topic.',
      reply_to_message_id: message.message_id
    })
    return
  }

  const target_user = await findUserByThreadId(message_thread_id)
  if (!target_user) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: 'Could not find the user to block.',
      reply_to_message_id: message.message_id
    })
    return
  }

  if (target_user.user_id.toString() === ADMIN_UID) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: 'You cannot block yourself.',
      reply_to_message_id: message.message_id
    })
    return
  }

  await db.blockUser(target_user.user_id, true)
  await sendMessage({
    chat_id: message.chat.id,
    message_thread_id: message_thread_id,
    text: `User ${target_user.user_id} has been blocked.`,
    reply_to_message_id: message.message_id
  })
}

/**
 * Handle unblock command
 */
async function handleUnblockCommand(message) {
  const user = message.from
  const message_thread_id = message.message_thread_id

  if (user.id.toString() !== ADMIN_UID) {
    return
  }

  // Check if user ID parameter is provided (format: /unblock 123456)
  const commandMatch = message.text?.match(/^\/unblock\s+(\d+)/)
  if (commandMatch) {
    const target_user_id = commandMatch[1]
    
    // Check if the user exists
    const target_user = await db.getUser(target_user_id)
    if (!target_user) {
      await sendMessage({
        chat_id: message.chat.id,
        message_thread_id: message_thread_id,
        text: `User not found with ID: ${target_user_id}`,
        reply_to_message_id: message.message_id
      })
      return
    }

    // Check if blocked
    const isBlocked = await db.isUserBlocked(target_user_id)
    if (!isBlocked) {
      await sendMessage({
        chat_id: message.chat.id,
        message_thread_id: message_thread_id,
        text: `User ${target_user_id} is not blocked.`,
        reply_to_message_id: message.message_id
      })
      return
    }

    await db.blockUser(target_user_id, false)
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: `✅ User ${target_user_id} (${target_user.first_name || 'Unknown'}) has been unblocked.`,
      reply_to_message_id: message.message_id
    })
    return
  }

  // If in a topic and no user ID provided, unblock that topic's user
  if (message_thread_id) {
    const target_user = await findUserByThreadId(message_thread_id)
    if (!target_user) {
      await sendMessage({
        chat_id: message.chat.id,
        message_thread_id: message_thread_id,
        text: 'Could not find the user to unblock.',
        reply_to_message_id: message.message_id
      })
      return
    }

    await db.blockUser(target_user.user_id, false)
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: `✅ User ${target_user.user_id} has been unblocked.`,
      reply_to_message_id: message.message_id
    })
    return
  }

  // Neither in a topic nor user ID provided
  await sendMessage({
    chat_id: message.chat.id,
    text: 'Please use this command in a topic, or use format: /unblock [user_id]',
    reply_to_message_id: message.message_id
  })
}

/**
 * Handle check block status command
 */
async function handleCheckBlockCommand(message) {
  const user = message.from
  const message_thread_id = message.message_thread_id

  if (user.id.toString() !== ADMIN_UID) {
    return
  }

  // If in a topic, check that topic user's block status
  if (message_thread_id) {
    const target_user = await findUserByThreadId(message_thread_id)
    if (!target_user) {
      await sendMessage({
        chat_id: message.chat.id,
        message_thread_id: message_thread_id,
        text: 'User not found.',
        reply_to_message_id: message.message_id
      })
      return
    }

    const isBlocked = await db.isUserBlocked(target_user.user_id)
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: `User ${target_user.user_id} block status: ${isBlocked ? 'Blocked' : 'Not blocked'}`,
      reply_to_message_id: message.message_id
    })
    return
  }

  // If not in a topic, list all blocked users
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
        text: '✅ No blocked users currently.',
        reply_to_message_id: message.message_id
      })
      return
    }

    let responseText = `🚫 <b>Blocked Users List</b> (Total: ${blockedUsers.length})\n\n`
    
    for (const u of blockedUsers) {
      const userName = u.first_name || 'Unknown'
      const userInfo = u.username ? `@${u.username} | ID: ${u.user_id}` : `ID: ${u.user_id}`
      responseText += `• ${userName} (${userInfo})\n`
    }

    await sendMessage({
      chat_id: message.chat.id,
      text: responseText,
      parse_mode: 'HTML',
      reply_to_message_id: message.message_id
    })
  } catch (error) {
    console.error('Error checking blocked users:', error)
    await sendMessage({
      chat_id: message.chat.id,
      text: '❌ Error querying blocked users list.',
      reply_to_message_id: message.message_id
    })
  }
}

/**
 * Handle updates
 */
async function onUpdate(update) {
  try {
    if (update.message) {
      const message = update.message
      const user = message.from
      const chat_id = message.chat.id

      // Handle /start command (support /start and /start@botname formats)
      if (message.text && (message.text === '/start' || message.text.startsWith('/start@'))) {
        return await handleStart(message)
      }

      // Handle commands from admin (support both admin group and private chat, support @botname format)
      if (user.id.toString() === ADMIN_UID && (chat_id.toString() === ADMIN_GROUP_ID || message.chat.type === 'private')) {
        const commandText = message.text?.split('@')[0] || '' // Extract command part, remove @botname
        
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
        // If other commands are used in private chat, show a hint
        if (message.chat.type === 'private' && ['/clear', '/del'].includes(message.text)) {
          await sendMessage({
            chat_id: chat_id,
            text: 'This command must be used in a topic within the admin group.',
            reply_to_message_id: message.message_id
          })
          return
        }
      }

      // Handle private chat messages (user -> admin)
      if (message.chat.type === 'private') {
        return await forwardMessageU2A(message)
      }

      // Handle admin group messages (admin -> user)
      if (chat_id.toString() === ADMIN_GROUP_ID) {
        return await forwardMessageA2U(message)
      }
    }

    // Handle edited messages
    if (update.edited_message) {
      const edited_message = update.edited_message
      const chat_id = edited_message.chat.id
      
      if (edited_message.chat.type === 'private') {
        // User edited message
        return await handleEditedMessage(edited_message, true)
      }
      
      if (chat_id.toString() === ADMIN_GROUP_ID) {
        // Admin edited message
        return await handleEditedMessage(edited_message, false)
      }
    }
  } catch (error) {
    console.error('Error processing update:', error)
  }
}

/**
 * Handle Webhook requests
 */
async function handleWebhook(event) {
  // Verify secret
  if (event.request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== SECRET) {
    return new Response('Unauthorized', { status: 403 })
  }

  // Read update
  const update = await event.request.json()
  
  // Process update asynchronously
  event.waitUntil(onUpdate(update))

  return new Response('Ok')
}

/**
 * Register Webhook
 */
async function registerWebhook(event, requestUrl, suffix, secret) {
  const webhookUrl = `${requestUrl.protocol}//${requestUrl.hostname}${suffix}`
  
  // Debug info
  console.log('🔧 Webhook registration details:')
  console.log('TOKEN:', TOKEN ? `first 10 chars: ${TOKEN.slice(0, 10)}...` : '❌ not set')
  console.log('SECRET:', secret ? '✅ set' : '❌ not set')
  console.log('Webhook URL:', webhookUrl)
  console.log('API URL:', apiUrl('setWebhook'))
  
  // Register webhook
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
  console.log('📡 Telegram API response:', result)
  
  // Register bot commands (only /start is visible, other commands are hidden)
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
            description: 'Start the bot'
          }
        ]
      }),
    })
    const commandsData = await commandsResult.json()
    console.log('📋 Commands registration response:', commandsData)
  } catch (error) {
    console.error('❌ Commands registration failed:', error)
  }
  
  return new Response(JSON.stringify(result, null, 2), {
    headers: { 'content-type': 'application/json' }
  })
}

/**
 * Unregister Webhook
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
 * Initialize database tables
 */
async function initDatabase(d1) {
  const statements = [
    // Create tables
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
    // Create indexes
    'CREATE INDEX IF NOT EXISTS idx_users_thread ON users(message_thread_id)',
    'CREATE INDEX IF NOT EXISTS idx_mappings_key ON message_mappings(mapping_key)',
    'CREATE INDEX IF NOT EXISTS idx_states_expiry ON user_states(expiry_time)'
  ]
  
  try {
    // Use batch to execute all statements
    const preparedStatements = statements.map(sql => d1.prepare(sql))
    await d1.batch(preparedStatements)
    console.log('✅ Database tables initialized successfully')
  } catch (error) {
    console.error('❌ Database initialization error:', error)
    throw error
  }
}

/**
 * Main event listener (using ES Module format)
 */
export default {
  async fetch(request, env, ctx) {
    // Initialize configuration variables
    initConfig(env)
    
    // Initialize database connection
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
