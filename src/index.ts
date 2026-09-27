// ============================================
// 🌸 Zhost Photo Bot - TEST VERSION
// ============================================

import { Bot, webhookCallback } from "grammy";

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

        bot.command("start", async (ctx) => {
          console.log("=== /start command received ===");
          console.log("User ID:", ctx.from?.id);
          console.log("User Name:", ctx.from?.first_name);
          console.log("CHANNEL_ID:", env.CHANNEL_ID);

          const name = ctx.from?.first_name || "သူငယ်ချင်း";

          await ctx.reply(`🌸 ဟယ်လို... ${name} ရေ 💕\n\nTEST OK! ✅`);

          console.log("=== Reply sent successfully ===");
        });

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