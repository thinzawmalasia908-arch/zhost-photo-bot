// ============================================
// 🌸 Zhost Photo Bot - Main Entry Point
// ============================================

import { Bot, webhookCallback } from "grammy";

// Environment Variables (Type Definition)
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Health Check
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response("🌸 Zhost Photo Bot is running! 💕", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Telegram Webhook
    if (url.pathname === "/webhook") {
      const bot = new Bot(env.BOT_TOKEN);

      // ============ /start Command ============
      bot.command("start", async (ctx) => {
        const name = ctx.from?.first_name || "သူငယ်ချင်း";
        await ctx.reply(
          `🌸 ဟယ်လို... ${name} ရေ 💕\n\n` +
          `ငါက 𝗭𝗵𝗼𝘀𝘁'𝘀 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 ရဲ့ Admin မမ အသစ်လေးပါ 🌸\n\n` +
          `မင်းကို ဒီ Bot လေးနဲ့ ကူညီပေးဖို့ ရောက်လာတာပါ 💫\n\n` +
          `ကဲ... ငါ ဘာကူညီပေးရမလဲ? 🥰`
        );
      });

      // ============ /about Command ============
      bot.command("about", async (ctx) => {
        await ctx.reply(
          `🌸 𝗔𝗯𝗼𝘂𝘁 𝗧𝗵𝗶𝘀 𝗕𝗼𝘁 💕\n\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `👩‍💼 Owner: 𝗭𝗵𝗼𝘀𝘁'𝘀 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 မမ\n` +
          `🤖 Bot: Free Photo Backup Bot\n` +
          `📅 Version: 1.0.0\n` +
          `━━━━━━━━━━━━━━━━\n\n` +
          `📢 Channel: https://t.me/ZhostTech`
        );
      });

      // Webhook Handler
      return webhookCallback(bot, "cloudflare-mod")(request);
    }

    // 404 for other paths
    return new Response("Not Found", { status: 404 });
  },
};