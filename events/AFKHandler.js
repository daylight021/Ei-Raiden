module.exports = (msg, bot) => {
    console.log(`[AFK_DEBUG] Processing message from ${msg.sender} in ${msg.key.remoteJid}`)
    let afkUser = bot.db.data.users[msg.sender]
    // Initialize afkGroups if not exists
    afkUser.afkGroups = afkUser.afkGroups || {}
    if (afkUser.afkGroups[msg.key.remoteJid] > -1) {
      console.log(`[AFK_DEBUG] Sending welcome back to ${msg.sender}`)
      msg.reply(`Welcome back, ${afkUser.name || msg.pushName}!\nYou're back into the chat after being AFK for ${clockString(new Date - afkUser.afkGroups[msg.key.remoteJid])} with reason \`${afkUser.afkReason.toLowerCase()}.\``.trim())
      afkUser.afkGroups[msg.key.remoteJid] = -1
      // If no groups have AFK, clear afkReason
      if (Object.values(afkUser.afkGroups).every(v => v === -1)) {
        afkUser.afkReason = ''
      }
    }
    // Skip processing afkJids if the message is from the bot and quotes someone, to avoid self-reply
    if (msg.sender === bot.user.id && msg.quoted) {
      console.log(`[AFK_DEBUG] Skipping bot's quoted message`)
      return true
    }

    let afkJids = [...new Set([...(msg.mentionedJid || []), ...(msg.quoted ? [msg.quoted.sender] : [])])]
    console.log(`[AFK_DEBUG] afkJids: ${JSON.stringify(afkJids)}`)
    for (let jid of afkJids) {
      let afkUser = bot.db.data.users[jid]
      if (!afkUser) {
        console.log(`[AFK_DEBUG] No user data for ${jid}`)
        continue
      }
      afkUser.afkGroups = afkUser.afkGroups || {}
      let afkTime = afkUser.afkGroups[msg.key.remoteJid]
      console.log(`[AFK_DEBUG] Checking AFK for ${jid} in ${msg.key.remoteJid}: ${afkTime}`)
      if (!afkTime || afkTime < 0) {
        console.log(`[AFK_DEBUG] User ${jid} not AFK in this group`)
        continue
      }
      let reason = afkUser.afkReason || 'Please chat me later'
      console.log(`[AFK_DEBUG] Sending AFK message for ${jid}`)
      msg.reply(`I'm currently not available since ${clockString(new Date - afkUser.afkGroups[msg.key.remoteJid])} ago.\nReason: \`${reason}\``.trim())
    }
    return true
}

function clockString(ms) {
    let h = isNaN(ms) ? '--' : Math.floor(ms / 3600000)
    let m = isNaN(ms) ? '--' : Math.floor(ms / 60000) % 60
    let s = isNaN(ms) ? '--' : Math.floor(ms / 1000) % 60
    return h > 1 ? `${h} hours` : m > 1 ? `${m} minutes` : `${s} second`
}