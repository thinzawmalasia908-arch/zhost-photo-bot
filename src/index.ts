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

// ============================================
// Bot instance ကို Cache လုပ်ထားမယ်
// ============================================
let botInstance: Bot | null = null;
let botInitPromise: Promise<void> | null = null;

async function getBot(env: Env): Promise<Bot> {
  if (botInstance && botInitPromise) {
    await botInitPromise;
    return botInstance;
  }

  botInstance = new Bot(env.BOT_TOKEN);

  // ==========================================
  // 📢 /start Command
  // ==========================================
  botInstance.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    const name = ctx.from?.first_name || "သူငယ်ချင်း";
    if (!userId) return;

    try {
      const member = await ctx.api.getChatMember(env.CHANNEL_ID, userId);
      const status = member.status;
      const isJoined =
        status === "creator" ||
        status === "administrator" ||
        status === "member" ||
        status === "restricted";

      if (!isJoined) {
        const keyboard = new InlineKeyboard()
          .url(
            "📢 Join ZhostTech",
            `https://t.me/${env.CHANNEL_USERNAME.replace("@", "")}`
          )
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

      await ctx.reply(
        `🌸 ဟယ်လို... ${name} ရေ 💕\n\n` +
          `ငါက 𝗭𝗵𝗼𝘀𝘁'𝘀 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 ရဲ့ Admin မမ အသစ်လေးပါ 🌸\n\n` +
          `မင်းကို ဒီ Bot လေးနဲ့ ကူညီပေးဖို့ ရောက်လာတာပါ 💫\n\n` +
          `ကဲ... ငါ ဘာကူညီပေးရမလဲ? 🥰`
      );
    } catch (error: any) {
      console.error("Start error:", error?.message || error);
      await ctx.reply(
        `🥺 ရတနာရေ... တစ်ခုခု မှားနေတယ်နော် 💔\n\n` +
          `Error: ${error?.message || "Unknown"}\n\n` +
          `ခဏနေမှ ပြန်ကြိုးစားကြည့်ပါဦး 🌸`
      );
    }
  });

  // ==========================================
  // ✅ Check Button
  // ==========================================
  botInstance.callbackQuery("check_join", async (ctx) => {
    const userId = ctx.from?.id;
    const name = ctx.from?.first_name || "သူငယ်ချင်း";
    if (!userId) return;

    try {
      const member = await ctx.api.getChatMember(env.CHANNEL_ID, userId);
      const status = member.status;
      const isJoined =
        status === "creator" ||
        status === "administrator" ||
        status === "member" ||
        status === "restricted";

      if (isJoined) {
        await ctx.answerCallbackQuery({
          text: "✨ တော်တော်လေး 💕",
          show_alert: false,
        });
        await ctx.editMessageText(
          `✨ ဟယ်... ${name} တော်တော်လေး 💕\n\n` +
            `မင်း ငါ့အခန်းလေးကို Join ပေးသွားတာ အရမ်းဝမ်းသာတယ် 🥰\n\n` +
            `ကဲ... ငါ ဘာကူညီပေးရမလဲ? 🌸`
        );
      } else {
        await ctx.answerCallbackQuery({
          text: "🥺 Join မလုပ်ရသေးဘူးနော် 💔",
          show_alert: true,
        });
      }
    } catch (error: any) {
      console.error("check_join error:", error?.message || error);
      await ctx.answerCallbackQuery({
        text: "Error: " + (error?.message || "Unknown"),
        show_alert: true,
      });
    }
  });

  // ==========================================
  // 📖 /about Command
  // ==========================================
  botInstance.command("about", async (ctx) => {
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

  // ⚠️ အရေးကြီးဆုံး — bot ကို initialize လုပ်ရမယ်
  botInitPromise = botInstance.init();
  await botInitPromise;
  return botInstance;
}

// ============================================
// Main Worker
// ============================================
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("🌸 Zhost Photo Bot is running! 💕", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/webhook") {
      try {
        const bot = await getBot(env);
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