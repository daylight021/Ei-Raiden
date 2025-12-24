module.exports = {
    name: "afk",
    description: "Leave your message into bot while u're afk.",
    group: true,
    execute: async (msg, { bot, args }) => {
        let text = args.join(" ")
        let _afkUser = bot.db.data.users[msg.sender];
        _afkUser.afkGroups = _afkUser.afkGroups || {}
        _afkUser.afkGroups[msg.key.remoteJid] = + new Date
        _afkUser.afkReason = text ? text : "Chat aku nanti aja!"
        msg.reply(`${msg.pushName} sekarang lagi AFK.\n**Alasan:** \`${_afkUser.afkReason}\``)
    }
}   