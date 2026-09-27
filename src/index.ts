// ============================================
// 🌸 Zhost Photo Bot - Main Entry Point
// ============================================

import { Bot, webhookCallback, InlineKeyboard } from "grammy";

export interface Env {
  BOT_TOKEN: string;
  APPWRITE_ENDPOINT: string;
  APPWRITE_PROJECT_ID: string;
  APPWRITE_API_KEY: string;
  APPWRITE_DATABASE_ID: string;
  APPWRITE_USER_TABLE_ID: string;
  APPWRITE_PHOTO_TABLE_ID: string;
  APPWRITE_BUCKET_ID: string;
  CHANNEL_ID: string;
  CHANNEL_USERNAME: string;
  APK_LINK: string;
  BOT_SESSIONS: KVNamespace;
}

// ⏱️ Auto-Delete အတွက် Delay
const AUTO_DELETE_MS = 3000;

// ============================================
// Helper: Delay
// ============================================
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Helper: Channel Join စစ်ဆေးခြင်း
// ============================================
async function isUserJoinedChannel(
  bot: Bot,
  channelId: string,
  userId: number
): Promise<boolean> {
  try {
    const member = await bot.api.getChatMember(channelId, userId);
    const status = member.status;
    return (
      status === "creator" ||
      status === "administrator" ||
      status === "member" ||
      status === "restricted"
    );
  } catch (error) {
    console.error("getChatMember Error:", error);
    return false;
  }
}

// ============================================
// Helper: Auto-Delete Message
// ============================================
async function sendTempMessage(
  bot: Bot,
  chatId: number,
  text: string,
  options: any = {},
  delayMs: number = AUTO_DELETE_MS
): Promise<void> {
  try {
    const msg = await bot.api.sendMessage(chatId, text, options);
    // Background မှာ Delay ပြီး ဖျက်
    setTimeout(async () => {
      try {
        await bot.api.deleteMessage(chatId, msg.message_id);
      } catch (e) {
        // ဖျက်လို့မရရင် ဘာမှ မလုပ်
      }
    }, delayMs);
  } catch (error) {
    console.error("sendTempMessage Error:", error);
  }
}

// ============================================
// Main Worker
// ============================================
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health Check
    if (url.pathname === "/") {
      return new Response("🌸 Zhost Photo Bot is running! 💕", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Telegram Webhook
    if (url.pathname === "/webhook") {
      try {
        const bot = new Bot(env.BOT_TOKEN);

        // ============================================
        // 📢 /start Command — Force Join Channel
        // ============================================
        bot.command("start", async (ctx) => {
          const userId = ctx.from?.id;
          const name = ctx.from?.first_name || "သူငယ်ချင်း";
          if (!userId) return;

          const joined = await isUserJoinedChannel(bot, env.CHANNEL_ID, userId);

          if (!joined) {
            // Join မဖြစ်သေးရင် Join Button ပြ
            const keyboard = new InlineKeyboard()
              .url("📢 Join ZhostTech", `https://t.me/${env.CHANNEL_USERNAME.replace("@", "")}`)
              .row()
              .text("✅ Check", "check_join");

            await ctx.reply(
              `🌸 ဟယ်လို... ${name} ရေ 💕\n\n` +
              `ငါက 𝗭𝗵𝗼𝘀𝘁'𝘀 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 ရဲ့ Admin မမ 💕\n\n` +
              `ငါ့ Channel လေးကို Join ပေးပြီးမှ\n` +
              `ဒီ Bot လေးကို သုံးလို့ရမှာနော် 🌸\n\n` +
              `👇 Join နှိပ်ပြီး "✅ Check" ကို နှိပ်လိုက်ပါ`,
              { reply_markup: keyboard }
            );
            return;
          }

          // Join ဖြစ်ပြီးသားဆိုရင် Main Menu
          await ctx.reply(
            `🌸 ဟယ်လို... ${name} ရေ 💕\n\n` +
            `ငါက 𝗭𝗵𝗼𝘀𝘁'𝘀 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 ရဲ့ Admin မမ အသစ်လေးပါ 🌸\n\n` +
            `မင်းကို ဒီ Bot လေးနဲ့ ကူညီပေးဖို့ ရောက်လာတာပါ 💫\n\n` +
            `ကဲ... ငါ ဘာကူညီပေးရမလဲ? 🥰`
          );
        });

        // ============================================
        // ✅ Check Button နှိပ်ချိန်
        // ============================================
        bot.callbackQuery("check_join", async (ctx) => {
          const userId = ctx.from?.id;
          const name = ctx.from?.first_name || "သူငယ်ချင်း";
          if (!userId) return;

          const joined = await isUserJoinedChannel(bot, env.CHANNEL_ID, userId);

          if (joined) {
            // Join ဖြစ်သွားရင်
            await ctx.answerCallbackQuery({
              text: "✨ တော်တော်လေး ရတနာရေ 💕",
              show_alert: false,
            });

            await ctx.editMessageText(
              `✨ ဟယ်... ${name} တော်တော်လေး 💕\n\n` +
              `မင်း ငါ့အခန်းလေးကို Join ပေးသွားတာ အရမ်းဝမ်းသာတယ် 🥰\n\n` +
              `ကဲ... ငါ ဘာကူညီပေးရမလဲ? 🌸`
            );
          } else {
            // Join မဖြစ်သေးရင်
            await ctx.answerCallbackQuery({
              text: "🥺 Join မလုပ်ရသေးဘူးနော်",
              show_alert: true,
            });

            // 3s နောက် Bot Message ဖျက်
            const chatId = ctx.chat?.id;
            const msgId = ctx.callbackQuery.message?.message_id;
            if (chatId && msgId) {
              setTimeout(async () => {
                try {
                  await bot.api.deleteMessage(chatId, msgId);
                } catch (e) {}
              }, AUTO_DELETE_MS);
            }
          }
        });

        // ============================================
        // 📖 /about Command
        // ============================================
        bot.command("about", async (ctx) => {
          await ctx.reply(
            `🌸 𝗔𝗯𝗼𝘂𝘁 𝗧𝗵𝗶𝘀 𝗕𝗼𝘁 💕\n\n` +
            `━━━━━━━━━━━━━━━━\n` +
            `👩‍💼 Owner: 𝗭𝗵𝗼𝘀𝘁'𝘀 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 မမ\n` +
            `🤖 Bot: Free Photo Backup Bot\n` +
            `📅 Version: 1.0.0\n` +
            `━━━━━━━━━━━━━━━━\n\n` +
            `📢 Channel: https://t.me/${env.CHANNEL_USERNAME.replace("@", "")}`
          );
        });

        // ============================================
        // Webhook Handler
        // ============================================
        const handleUpdate = webhookCallback(bot, "cloudflare-mod");
        return await handleUpdate(request);
      } catch (error: any) {
        console.error("Webhook Error:", error?.message || error);
        return new Response(`Error: ${error?.message || error}`, { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};