const { sendInteractiveMessage } = require("baileys_helper"); // FIXED: Removed 's' from baileys_helpers

module.exports = {
  name: "testinteractive",
  description: "Test InteractiveMessage via baileys_helper",
  execute: async (msg, { bot }) => {
    try {
      // optional reaksi biar kelihatan jalan
      await msg.react("🧪");

      await sendInteractiveMessage(bot, msg.from, {
        text: "Demo alur native tingkat lanjut",
        footer: "Semua fitur",
        interactiveButtons: [
          // Quick Reply
          {
            name: "quick_reply",
            buttonParamsJson: JSON.stringify({
              display_text: "Balas A",
              id: "reply_a",
            }),
          },

          // Single Select
          {
            name: "single_select",
            buttonParamsJson: JSON.stringify({
              title: "Pilih Satu",
              sections: [
                {
                  title: "Pilihan",
                  rows: [
                    {
                      header: "H",
                      title: "Halo",
                      description: "Ucapkan hai",
                      id: "opt_hello",
                    },
                    {
                      header: "B",
                      title: "Sampai jumpa",
                      description: "Ucapkan bye",
                      id: "opt_bye",
                    },
                  ],
                },
              ],
            }),
          },
        ],
      });
    } catch (err) {
      console.error("[TEST INTERACTIVE ERROR]", err);
      msg.reply("❌ Gagal mengirim interactive message");
    }
  },
};