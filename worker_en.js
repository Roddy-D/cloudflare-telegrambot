// === Configuration variables ===
const TOKEN = ENV_BOT_TOKEN // Obtain from @BotFather
const WEBHOOK = '/endpoint'
const SECRET = ENV_BOT_SECRET // A-Z, a-z, 0-9, _ and -
const ADMIN_UID = ENV_ADMIN_UID // Administrator user ID
const ADMIN_GROUP_ID = ENV_ADMIN_GROUP_ID // Admin group ID (must be a supergroup with topics enabled)
// === Optional variables ===
const WELCOME_MESSAGE = (typeof ENV_WELCOME_MESSAGE !== 'undefined') ? ENV_WELCOME_MESSAGE : 'Welcome to the bot' // Welcome message
const MESSAGE_INTERVAL = (typeof ENV_MESSAGE_INTERVAL !== 'undefined') ? parseInt(ENV_MESSAGE_INTERVAL) || 1 : 1 // Message interval limit (seconds)
const DELETE_TOPIC_AS_BAN = (typeof ENV_DELETE_TOPIC_AS_BAN !== 'undefined') ? ENV_DELETE_TOPIC_AS_BAN === 'true' : false // Treat topic deletion as permanent ban

/**
 * Telegram API wrapper
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
 * Database wrapper (using Cloudflare KV storage)
 */
class Database {
  // User related
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

  // Message mapping related
  async getMessageMap(key) {
    return await horr.get(`msgmap:${key}`, { type: 'json' })
  }

  async setMessageMap(key, value) {
    await horr.put(`msgmap:${key}`, JSON.stringify(value))
  }

  // Topic status related
  async getTopicStatus(thread_id) {
    return await horr.get(`topic:${thread_id}`, { type: 'json' }) || { status: 'opened' }
  }

  async setTopicStatus(thread_id, status) {
    await horr.put(`topic:${thread_id}`, JSON.stringify({ status, updated_at: Date.now() }))
  }

  // User state related
  async getUserState(user_id, key) {
    return await horr.get(`state:${user_id}:${key}`, { type: 'json' })
  }

  async setUserState(user_id, key, value) {
    await horr.put(`state:${user_id}:${key}`, JSON.stringify(value))
  }

  async deleteUserState(user_id, key) {
    await horr.delete(`state:${user_id}:${key}`)
  }

  // Blocked user related
  async isUserBlocked(user_id) {
    return await horr.get(`blocked:${user_id}`, { type: 'json' }) || false
  }

  async blockUser(user_id, blocked = true) {
    await horr.put(`blocked:${user_id}`, JSON.stringify(blocked))
  }

  // Message rate limiting
  async getLastMessageTime(user_id) {
    return await horr.get(`lastmsg:${user_id}`, { type: 'json' }) || 0
  }

  async setLastMessageTime(user_id, timestamp) {
    await horr.put(`lastmsg:${user_id}`, JSON.stringify(timestamp))
  }
}

const db = new Database()

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
    
    // Check if this is a KV write limit error
    if (isKVWriteLimitError(error)) {
      // Get existing user data to determine whether a topic already exists
      const user_data = await db.getUser(user.id).catch(() => null)
      const message_thread_id = user_data?.message_thread_id || null
      
      await handleKVLimitError(user, message_thread_id)
    }
    
    // Re-throw error for upper-level handling
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
    await updateUserDb(user)
  
  if (user.id.toString() === ADMIN_UID) {
    await sendMessage({
      chat_id: user.id,
      text: 'You have successfully activated the bot.'
    })
  } else {
    await sendMessage({
      chat_id: user.id,
      text: `${mentionHtml(user.id, user.first_name || user.id)}:\n\n${WELCOME_MESSAGE}`,
      parse_mode: 'HTML'
    })
  }
}

/**
 * Check if it is a KV write limit error
 */
function isKVWriteLimitError(error) {
  const errorMessage = (error.message || '').toLowerCase()
  return errorMessage.includes('kv put() limit exceeded') || 
         errorMessage.includes('kv write limit') ||
         errorMessage.includes('quota exceeded')
}

// Track users who have received the daily KV limit warning (in-memory)
let dailyKVAlertSent = new Set()
let lastAlertDate = new Date().toDateString() // Record the date of the last warning

/**
 * Handle KV write limit errors
 */
async function handleKVLimitError(user, message_thread_id) {
  const user_id = user.id
  const userDisplayName = user.first_name || 'User'
  const currentDate = new Date().toDateString()
  
  try {
    // Check if a new day has started; if so, clear alert tracking
    if (currentDate !== lastAlertDate) {
      dailyKVAlertSent.clear()
      lastAlertDate = currentDate
      console.log(`🔄 Reset daily KV alert tracking for new date: ${currentDate}`)
    }
    
    // Check whether an alert has already been sent for this user today
    const alertKey = `${user_id}_${currentDate}`
    if (!dailyKVAlertSent.has(alertKey)) {
      // Not yet alerted for this user today; send to admin
      let alertText = `🚨 <b>KV Storage Limit Warning</b>\n\n` +
                     `⚠️ Cloudflare KV daily write quota has been reached!\n\n` +
                     `👤 User Info:\n` +
                     `• Name: ${userDisplayName}\n` +
                     `• Username: @${user.username || 'none'}\n` +
                     `• Telegram ID: <code>${user_id}</code>\n` +
                      (user.username ? '' : `• Direct contact: tg://user?id=${user_id}\n`)
      
      if (message_thread_id) {
        alertText += `• Topic ID: ${message_thread_id}\n`
        alertText += `• Status: Topic exists, messages cannot be forwarded\n\n`
      } else {
        alertText += `• Status: No topic created, cannot create a new topic\n\n`
      }
      
      alertText += `📋 <b>Impact:</b>\n` +
                  `• Cannot create new topics\n` +
                  `• Cannot update user data\n` +
                  `• Cannot forward user messages\n\n` +
                  `🔧 <b>Recommendations:</b>\n` +
                  `• Wait until UTC reset (usually 00:00 daily)\n` +
                  `• Consider upgrading your Cloudflare plan\n` +
                  `• Check for abnormal write operations\n\n` +
                  `⏰ Time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' })}\n\n` +
                  `ℹ️ Note: Only one reminder per user per day`
      
      await sendMessage({
        chat_id: ADMIN_UID,
        text: alertText,
        parse_mode: 'HTML'
      })
      
      // Record the alert as sent
      dailyKVAlertSent.add(alertKey)
      console.log(`✅ KV limit alert sent to admin for user ${user_id}`)
    } else {
      console.log(`⏭️ KV limit alert already sent for user ${user_id} today, skipping admin notification`)
    }
    
    // Always notify the user (regardless of whether the admin was notified)
    await sendMessage({
      chat_id: user_id,
      text: `Sorry, due to storage limits, your message cannot be delivered temporarily.\n\n` +
            `The recipient has been notified. Please try again tomorrow or wait until the issue is resolved.\n\n` +
            `If it's urgent, please contact the recipient directly.`
    })
    
    console.log(`✅ KV limit error handled for user ${user_id}, topic: ${message_thread_id || 'none'}`)
    
  } catch (alertError) {
    console.error('❌ Failed to handle KV limit error:', alertError)
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
    // 1. Message rate limiting
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

    // 2. Check if blocked
    const isBlocked = await db.isUserBlocked(user_id)
    if (isBlocked) {
      await sendMessage({
        chat_id: chat_id,
        text: 'You are blocked and cannot send messages.'
      })
      return
    }

    // 3. Update user info
    await updateUserDb(user)

    // 4. Get or create topic
    let user_data = await db.getUser(user_id)
    if (!user_data) {
      // If user data does not exist (possibly KV latency), wait and retry once
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
    
    // 5. Handle message forwarding
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
    
    // Check if it is a KV write limit error
    if (isKVWriteLimitError(error)) {
      const user_data = await db.getUser(user_id).catch(() => null)
      const message_thread_id = user_data?.message_thread_id || null
      
      await handleKVLimitError(user, message_thread_id)
      return
    }
    
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
      text: 'Reminder: This conversation is closed. The user’s messages may not be sent unless you reopen the conversation.',
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
      
      // Clean up message mapping records
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
 * Handle block command
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
      text: 'Please reply to a user message to use the block command.',
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

  if (!message.reply_to_message) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: 'Please reply to a user message to use the unblock command.',
      reply_to_message_id: message.message_id
    })
    return
  }

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
    text: `User ${target_user.user_id} has been unblocked.`,
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

  if (!message.reply_to_message) {
    await sendMessage({
      chat_id: message.chat.id,
      message_thread_id: message_thread_id,
      text: 'Please reply to a user message to check block status.',
      reply_to_message_id: message.message_id
    })
    return
  }

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

      // Handle /start command
      if (message.text === '/start') {
        return await handleStart(message)
      }

      // Handle commands from admin
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
 * Main event listener
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
