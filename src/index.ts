import { Bot, webhookCallback, InlineKeyboard, InputFile } from "grammy";

export interface Env {
  BOT_TOKEN: string;
  APPWRITE_PROJECT_ID: string;
  APPWRITE_API_KEY: string;
  BOT_SESSIONS: KVNamespace;
  [key: string]: any;
}

// ============================================
// HARDCODED CONFIG
// ============================================
const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_DATABASE_ID = "6ab8a2dd002493abffc1";
const APPWRITE_PHOTO_TABLE_ID = "6ab8a3170023949dc624";
const APPWRITE_USER_POINTS_TABLE_ID = "user_points";
const APPWRITE_BUCKET_ID = "6ab8a9a20014b126f169";
const CHANNEL_ID = "@ZhostTech";
const CHANNEL_USERNAME = "@ZhostTech";
const DAILY_POINTS = 2;
const INVITE_POINTS = 2;

// Safe fetch — Error ကို အတိအကျ ပြ
async function safeFetch(url: string, options: RequestInit, label: string): Promise<any> {
  console.log(`[${label}] URL: ${url}`);
  
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (e: any) {
    throw new Error(`❌ [${label}] Network Error: ${e?.message}\n🔗 URL: ${url}`);
  }
  
  const text = await res.text();
  console.log(`[${label}] Status: ${res.status}`);
  console.log(`[${label}] Response preview: ${text.slice(0, 200)}`);
  
  // HTML ပြန်လာရင် (Appwrite မဟုတ်ဘဲ တခြားနေရာ ရောက်နေ)
  if (text.trim().startsWith("<")) {
    throw new Error(
      `❌ [${label}] HTML ပြန်လာတယ် (status ${res.status})\n\n` +
      `🔗 URL:\n${url}\n\n` +
      `📄 Response Preview:\n${text.slice(0, 300)}\n\n` +
      `💡 URL မှားနေတယ် ဒါမှမဟုတ် Auth မှားနေတယ်`
    );
  }
  
  // JSON parse
  let data: any;
  try {
    data = JSON.parse(text);
  } catch (e: any) {
    throw new Error(
      `❌ [${label}] Invalid JSON (status ${res.status})\n\n` +
      `🔗 URL:\n${url}\n\n` +
      `📄 Response:\n${text.slice(0, 300)}`
    );
  }
  
  // HTTP error
  if (!res.ok) {
    throw new Error(
      `❌ [${label}] HTTP ${res.status}\n\n` +
      `🔗 URL:\n${url}\n\n` +
      `📄 Message: ${data.message || "Unknown"}\n` +
      `📄 Type: ${data.type || "Unknown"}\n` +
      `📄 Code: ${data.code || "Unknown"}`
    );
  }
  
  return data;
}

function awHeaders(env: Env) {
  return {
    "Content-Type": "application/json",
    "X-Appwrite-Project": env.APPWRITE_PROJECT_ID || "",
    "X-Appwrite-Key": env.APPWRITE_API_KEY || "",
  };
}

async function awLogin(env: Env, email: string, password: string): Promise<any> {
  const url = `${APPWRITE_ENDPOINT}/account/sessions/email`;
  return await safeFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": env.APPWRITE_PROJECT_ID,
    },
    body: JSON.stringify({ email, password }),
  }, "awLogin");
}

async function awRegister(env: Env, email: string, password: string): Promise<any> {
  const url = `${APPWRITE_ENDPOINT}/account`;
  return await safeFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": env.APPWRITE_PROJECT_ID,
    },
    body: JSON.stringify({
      userId: "unique()",
      email,
      password,
      name: email.split("@")[0],
    }),
  }, "awRegister");
}

async function awGetUserPoints(env: Env, userId: string): Promise<any | null> {
  const query = encodeURIComponent(`equal("user_id", ["${userId}"])`);
  const url = `${APPWRITE_ENDPOINT}/databases/${APPWRITE_DATABASE_ID}/tables/${APPWRITE_USER_POINTS_TABLE_ID}/rows?queries[]=${query}&queries[]=${encodeURIComponent("limit(1)")}`;
  
  const data = await safeFetch(url, {
    method: "GET",
    headers: awHeaders(env),
  }, "awGetUserPoints");
  
  if (!data.rows || data.rows.length === 0) return null;
  return data.rows[0];
}

async function awCreateUserPoints(env: Env, userId: string, chatId: number, invitedBy: string = ""): Promise<any> {
  const url = `${APPWRITE_ENDPOINT}/databases/${APPWRITE_DATABASE_ID}/tables/${APPWRITE_USER_POINTS_TABLE_ID}/rows`;
  return await safeFetch(url, {
    method: "POST",
    headers: awHeaders(env),
    body: JSON.stringify({
      rowId: "unique()",
      data: {
        user_id: userId,
        telegram_chat_id: String(chatId),
        points: 0,
        last_daily: "",
        total_invites: 0,
        invited_by: invitedBy,
      },
    }),
  }, "awCreateUserPoints");
}

async function awUpdateUserPoints(env: Env, rowId: string, updates: any): Promise<any> {
  const url = `${APPWRITE_ENDPOINT}/databases/${APPWRITE_DATABASE_ID}/tables/${APPWRITE_USER_POINTS_TABLE_ID}/rows/${rowId}`;
  return await safeFetch(url, {
    method: "PATCH",
    headers: awHeaders(env),
    body: JSON.stringify({ data: updates }),
  }, "awUpdateUserPoints");
}

async function awGetPhotos(env: Env, userId: string, limit: number): Promise<any[]> {
  const url = `${APPWRITE_ENDPOINT}/databases/${APPWRITE_DATABASE_ID}/tables/${APPWRITE_PHOTO_TABLE_ID}/rows?queries[]=${encodeURIComponent(`equal("user_id", ["${userId}"])`)}&queries[]=${encodeURIComponent(`limit(${limit})`)}`;
  try {
    const data = await safeFetch(url, { method: "GET", headers: awHeaders(env) }, "awGetPhotos");
    return data.rows || [];
  } catch (e) {
    console.error("awGetPhotos error:", e);
    return [];
  }
}

async function awDeletePhoto(env: Env, rowId: string, fileId: string): Promise<void> {
  try {
    const url1 = `${APPWRITE_ENDPOINT}/databases/${APPWRITE_DATABASE_ID}/tables/${APPWRITE_PHOTO_TABLE_ID}/rows/${rowId}`;
    await fetch(url1, { method: "DELETE", headers: awHeaders(env) });
  } catch (e) {}
  try {
    const url2 = `${APPWRITE_ENDPOINT}/storage/buckets/${APPWRITE_BUCKET_ID}/files/${fileId}`;
    await fetch(url2, { method: "DELETE", headers: awHeaders(env) });
  } catch (e) {}
}

async function awGetPhotoBytes(env: Env, fileId: string): Promise<Uint8Array | null> {
  try {
    const url = `${APPWRITE_ENDPOINT}/storage/buckets/${APPWRITE_BUCKET_ID}/files/${fileId}/view`;
    const res = await fetch(url, {
      headers: {
        "X-Appwrite-Project": env.APPWRITE_PROJECT_ID,
        "X-Appwrite-Key": env.APPWRITE_API_KEY,
      },
    });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch (e) { return null; }
}

// ============================================
// Session & State
// ============================================
async function setSession(env: Env, chatId: number, data: any): Promise<void> {
  try { await env.BOT_SESSIONS.put(`session:${chatId}`, JSON.stringify(data), { expirationTtl: 3600 }); } catch (e) {}
}
async function getSession(env: Env, chatId: number): Promise<any | null> {
  try { const v = await env.BOT_SESSIONS.get(`session:${chatId}`); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
async function clearSession(env: Env, chatId: number): Promise<void> {
  try { await env.BOT_SESSIONS.delete(`session:${chatId}`); } catch (e) {}
}
async function setState(env: Env, chatId: number, state: string, extra: any = {}): Promise<void> {
  try { await env.BOT_SESSIONS.put(`state:${chatId}`, JSON.stringify({ state, ...extra }), { expirationTtl: 600 }); } catch (e) {}
}
async function getState(env: Env, chatId: number): Promise<any | null> {
  try { const v = await env.BOT_SESSIONS.get(`state:${chatId}`); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
async function clearState(env: Env, chatId: number): Promise<void> {
  try { await env.BOT_SESSIONS.delete(`state:${chatId}`); } catch (e) {}
}

const MAIN_MENU_TEXT = "🌸 ရတနာရေ... ဘာလုပ်ချင်လဲ? 🥰";

function getMainKeyboard() {
  return {
    keyboard: [
      [{ text: "📅 Daily" }, { text: "🖼️ Show Photo" }],
      [{ text: "👥 Invite" }, { text: "👤 Profile" }],
      [{ text: "🚪 Logout" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

let botInstance: Bot | null = null;

function getBot(env: Env): Bot {
  if (botInstance) return botInstance;
  botInstance = new Bot(env.BOT_TOKEN);
  setupBot(botInstance, env);
  return botInstance;
}

function setupBot(bot: Bot, env: Env) {
  bot.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    const name = ctx.from?.first_name || "သူငယ်ချင်း";
    if (!userId) return;

    const payload = (ctx.match || "").trim();
    let referrerId = "";
    if (payload.startsWith("invite_")) referrerId = payload.replace("invite_", "");

    let isJoined = false;
    try {
      const member = await ctx.api.getChatMember(CHANNEL_ID, userId);
      isJoined = ["creator", "administrator", "member", "restricted"].includes(member.status);
    } catch (e) { isJoined = true; }

    if (!isJoined) {
      const kb = new InlineKeyboard()
        .url("📢 Join ZhostTech", `https://t.me/${CHANNEL_USERNAME.replace("@", "")}`)
        .row().text("✅ Check", "check_join");
      await ctx.reply(
        `🌸 ဟယ်လို... ${name} ရေ 💕\n\nငါက 𝗭𝗵𝗼𝘀𝘁'𝘀 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 ရဲ့ Admin မမ 💕\n\nငါ့ Channel လေးကို Join ပေးပြီးမှ\nဒီ Bot လေးကို သုံးလို့ရမှာနော် 🌸\n\n👇 Join နှိပ်ပြီး "✅ Check" ကို နှိပ်လိုက်ပါ`,
        { reply_markup: kb }
      );
      return;
    }

    if (referrerId) await setState(env, userId, "pending_invite", { referrerId });

    const session = await getSession(env, userId);
    if (session?.userId) {
      await ctx.reply(`🌸 ပြန်လာတာ ဝမ်းသာတယ် ${name} ရေ 💕\n\n${MAIN_MENU_TEXT}`, {
        reply_markup: getMainKeyboard(),
      });
      return;
    }

    const kb = new InlineKeyboard().text("🔐 Login", "do_login").text("📝 Create Account", "do_register");
    await ctx.reply(
      `🌸 ဟယ်လို... ${name} ရေ 💕\n\nဒီ Bot လေးကို သုံးဖို့ App မှာ ဖွင့်ထားတဲ့ Account လိုတယ်နော် 🌸\n\nLogin ဝင်မလား? Account အသစ် ဖွင့်မလား?`,
      { reply_markup: kb }
    );
  });

  bot.callbackQuery("check_join", async (ctx) => {
    const userId = ctx.from?.id;
    const name = ctx.from?.first_name || "သူငယ်ချင်း";
    if (!userId) return;

    let isJoined = false;
    try {
      const m = await ctx.api.getChatMember(CHANNEL_ID, userId);
      isJoined = ["creator", "administrator", "member", "restricted"].includes(m.status);
    } catch (e) {}

    if (!isJoined) {
      await ctx.answerCallbackQuery({ text: "🥺 Join မလုပ်ရသေးဘူးနော် 💔", show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery({ text: "✨ တော်တော်လေး 💕" });

    const session = await getSession(env, userId);
    if (session?.userId) {
      await ctx.editMessageText(`🌸 ပြန်လာတာ ဝမ်းသာတယ် ${name} ရေ 💕\n\n${MAIN_MENU_TEXT}`);
      await ctx.reply(MAIN_MENU_TEXT, { reply_markup: getMainKeyboard() });
      return;
    }

    const kb = new InlineKeyboard().text("🔐 Login", "do_login").text("📝 Create Account", "do_register");
    await ctx.editMessageText(
      `✨ ဟယ်... ${name} တော်တော်လေး 💕\n\nကဲ... Account လိုတယ်နော် 🌸\n\nLogin ဝင်မလား? Account အသစ် ဖွင့်မလား?`,
      { reply_markup: kb }
    );
  });

  bot.callbackQuery("do_login", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    await ctx.answerCallbackQuery();
    await setState(env, userId, "waiting_email", { action: "login" });
    await ctx.editMessageText(`🔐 Login ဝင်မယ်နော် 💕\n\n📧 မင်းရဲ့ Gmail လေးကို ပို့ပေးပါဦး 🌸`);
  });

  bot.callbackQuery("do_register", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    await ctx.answerCallbackQuery();
    await setState(env, userId, "waiting_email", { action: "register" });
    await ctx.editMessageText(`📝 Account အသစ် ဖွင့်မယ်နော် 💕\n\n📧 Gmail လေးကို ပို့ပေးပါဦး 🌸`);
  });

  bot.on("message:text", async (ctx) => {
    const userId = ctx.from?.id;
    const text = ctx.message.text.trim();
    const name = ctx.from?.first_name || "သူငယ်ချင်း";
    if (!userId) return;
    if (text.startsWith("/")) return;

    const session = await getSession(env, userId);
    if (session?.userId) {
      if (text === "📅 Daily") return handleDaily(ctx, env, session);
      if (text === "🖼️ Show Photo") return handleShowPhotoMenu(ctx, env, session);
      if (text === "👥 Invite") return handleInvite(ctx, env, session, name);
      if (text === "👤 Profile") return handleProfile(ctx, env, session);
      if (text === "🚪 Logout") return handleLogout(ctx, env, session);
      return;
    }

    const state = await getState(env, userId);
    if (!state) return;

    if (state.state === "waiting_email") {
      if (!text.includes("@")) {
        await ctx.reply("🥺 Gmail ပုံစံ မမှန်ဘူးနော်... ပြန်ပို့ပေးပါဦး 💕");
        return;
      }
      await setState(env, userId, "waiting_password", {
        action: state.action,
        email: text,
        referrerId: state.referrerId,
      });
      await ctx.reply(`💕 ကောင်းလိုက်တာ...\n\n🔒 Password လေးကို ပို့ပေးပါဦး 🌸`);
      return;
    }

    if (state.state === "waiting_password") {
      const email = state.email;
      const password = text;
      const action = state.action;

      try {
        let user;
        if (action === "register") {
          user = await awRegister(env, email, password);
        } else {
          user = await awLogin(env, email, password);
        }

        const appwriteUserId = user.$id || user.userId;
        if (!appwriteUserId) throw new Error("User ID မရပါ");

        await setSession(env, userId, { userId: appwriteUserId, email: email });

        let userPoints = await awGetUserPoints(env, appwriteUserId);
        if (!userPoints) {
          userPoints = await awCreateUserPoints(env, appwriteUserId, userId, state.referrerId || "");
          if (state.referrerId) {
            const rs = await getSession(env, parseInt(state.referrerId));
            if (rs?.userId) {
              const rp = await awGetUserPoints(env, rs.userId);
              if (rp) {
                await awUpdateUserPoints(env, rp.$id, {
                  points: (rp.points || 0) + INVITE_POINTS,
                  total_invites: (rp.total_invites || 0) + 1,
                });
              }
            }
          }
        }

        await clearState(env, userId);
        await ctx.reply(
          `✨ ဝိုး... ရောက်သွားပြီနော် ${name} ရေ 💕\n\nမင်းကို ပြန်တွေ့ရတာ အရမ်းဝမ်းသာတယ် 🥰\n\n${MAIN_MENU_TEXT}`,
          { reply_markup: getMainKeyboard() }
        );
      } catch (e: any) {
        await ctx.reply(`🥺 Error:\n\n${e.message}`);
        await clearState(env, userId);
      }
      return;
    }
  });

  async function handleDaily(ctx: any, env: Env, session: any) {
    try {
      let up = await awGetUserPoints(env, session.userId);
      if (!up) up = await awCreateUserPoints(env, session.userId, ctx.from.id);

      const today = new Date().toISOString().split("T")[0];
      const lastDaily = (up.last_daily || "").split("T")[0];

      if (lastDaily === today) {
        await ctx.reply(`🥺 ရတနာရေ... ဒီနေ့အတွက် ရယူပြီးသားလေ 💔\n\nမနက်ဖန် ပြန်လာခဲ့ပါဦးနော် 💕\n\n💰 လက်ရှိ Points: ${up.points || 0}`);
        return;
      }

      const np = (up.points || 0) + DAILY_POINTS;
      await awUpdateUserPoints(env, up.$id, { points: np, last_daily: new Date().toISOString() });
      await ctx.reply(`💕 အိုး... ${ctx.from?.first_name || "ရတနာ"} လာပြီနော် 🌸\n\nဒီနေ့အတွက် Daily Bonus လေး ယူလိုက်ပါ 💫\n\n✨ +${DAILY_POINTS} Points ရသွားပြီ 💖\n💰 လက်ရှိ Points: ${np}`);
    } catch (e: any) {
      await ctx.reply(`🥺 Error:\n\n${e.message}`);
    }
  }

  async function handleShowPhotoMenu(ctx: any, env: Env, session: any) {
    try {
      const up = await awGetUserPoints(env, session.userId);
      const points = up?.points || 0;

      if (points < 1) {
        const kb = new InlineKeyboard().text("📅 Daily ယူမယ်", "go_daily").text("👥 Invite ခေါ်မယ်", "go_invite");
        await ctx.reply(
          `🥺 ရတနာရေ... မင်းမှာ Points မရှိသေးဘူးနော် 💔\n\n💫 Daily နှိပ်ရင် ${DAILY_POINTS} Points ရမယ်\n💫 Invite ခေါ်ရင် တစ်ယောက်ကို ${INVITE_POINTS} Points ရမယ်\n\nကဲ... စုလိုက်ရအောင် 🌸`,
          { reply_markup: kb }
        );
        return;
      }

      const kb = new InlineKeyboard()
        .text("⭐ 1 Point", "sp_1").text("⭐⭐ 2 Points", "sp_2").row()
        .text("⭐⭐⭐ 3 Points", "sp_3").text("⭐⭐⭐⭐ 4 Points", "sp_4").row()
        .text("⭐⭐⭐⭐⭐ 5 Points", "sp_5").row()
        .text("⬅️ Back", "go_menu");
      await ctx.reply(
        `🌸 ရတနာရေ...\n\nမင်းရဲ့ အမှတ်တရ ဓာတ်ပုံလေးတွေ ကြည့်မလား? 💕\n\nဘယ်နှပုံ ကြည့်ချင်လဲ? 🥰\n\n💰 လက်ရှိ Points: ${points}`,
        { reply_markup: kb }
      );
    } catch (e: any) {
      await ctx.reply(`🥺 Error:\n\n${e.message}`);
    }
  }

  for (let n = 1; n <= 5; n++) {
    bot.callbackQuery(`sp_${n}`, async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;
      await ctx.answerCallbackQuery();

      const session = await getSession(env, userId);
      if (!session?.userId) {
        await ctx.editMessageText("🥺 Session ကုန်သွားပြီ... /start ပြန်ရိုက်ပါ 💕");
        return;
      }

      const cost = n;
      const up = await awGetUserPoints(env, session.userId);
      const points = up?.points || 0;

      if (points < cost) {
        await ctx.editMessageText(`🥺 Points မလုံလောက်ဘူးနော် 💔\n\nလိုအပ်: ${cost} Points\nသင့်မှာ: ${points} Points\n\nDaily နှိပ်ပြီး စုလိုက်ရအောင် 🌸`);
        return;
      }

      await awUpdateUserPoints(env, up.$id, { points: points - cost });
      await ctx.editMessageText(`🌸 ခဏစောင့်ပါနော်... ရှာနေတယ် 💕`);

      const photos = await awGetPhotos(env, session.userId, cost);
      if (!photos || photos.length === 0) {
        await awUpdateUserPoints(env, up.$id, { points: points });
        await ctx.editMessageText(`🥺 ဓာတ်ပုံ မရှိတော့ဘူးနော် 💔\n\nApp ကနေ ပြန် Backup လုပ်ပေးပါဦး 🌸`);
        return;
      }

      let sent = 0;
      for (const photo of photos) {
        try {
          const bytes = await awGetPhotoBytes(env, photo.file_id);
          if (!bytes) continue;
          await ctx.replyWithPhoto(new InputFile(bytes, "photo.jpg"));
          await awDeletePhoto(env, photo.$id, photo.file_id);
          sent++;
        } catch (e: any) {}
      }

      await ctx.reply(`✨ ကဲ... ${ctx.from?.first_name || "ရတနာ"} 💕\n\nဓာတ်ပုံ ${sent} ပုံ ရောက်လာပြီနော် 🌸\n\n💰 ကုန်သွားတဲ့ Points: ${cost}\n💖 ကျန်တဲ့ Points: ${points - cost}`);
    });
  }

  bot.callbackQuery("go_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(MAIN_MENU_TEXT);
  });

  bot.callbackQuery("go_daily", async (ctx) => {
    await ctx.answerCallbackQuery();
    const session = await getSession(env, ctx.from!.id);
    if (session) await handleDaily(ctx, env, session);
  });

  bot.callbackQuery("go_invite", async (ctx) => {
    await ctx.answerCallbackQuery();
    const session = await getSession(env, ctx.from!.id);
    if (session) await handleInvite(ctx, env, session, ctx.from?.first_name || "သူငယ်ချင်း");
  });

  async function handleInvite(ctx: any, env: Env, session: any, name: string) {
    try {
      const botInfo = await bot.api.getMe();
      const link = `https://t.me/${botInfo.username}?start=invite_${ctx.from.id}`;
      const up = await awGetUserPoints(env, session.userId);
      const invites = up?.total_invites || 0;
      const points = up?.points || 0;

      await ctx.reply(
        `💕 ${name} ရေ...\n\nမင်း သူငယ်ချင်းတွေကို ဖိတ်ခေါ်ချင်တာလား? 🥰\n\n👇 ဒီ Link ကို ကူးယူပြီး ပို့လိုက်ပါ\n\n🔗 ${link}\n\n✨ သူငယ်ချင်း တစ်ယောက် Join ရင် +${INVITE_POINTS} Points 💖\n\n👥 ခေါ်ခဲ့တဲ့ သူငယ်ချင်း: ${invites}\n💰 လက်ရှိ Points: ${points}`
      );
    } catch (e: any) {
      await ctx.reply(`🥺 Error:\n\n${e.message}`);
    }
  }

  async function handleProfile(ctx: any, env: Env, session: any) {
    try {
      const up = await awGetUserPoints(env, session.userId);
      const points = up?.points || 0;
      const invites = up?.total_invites || 0;
      const lastDaily = up?.last_daily ? new Date(up.last_daily).toLocaleDateString() : "မရှိ";

      await ctx.reply(
        `🌸 မင်းရဲ့ Profile လေးကို ကြည့်လိုက်ရအောင် 💕\n\n━━━━━━━━━━━━━━━━\n👩‍💼 Admin: 𝗭𝗵𝗼𝘀𝘁'𝘀 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 (မမ)\n📧 Email: ${session.email}\n━━━━━━━━━━━━━━━━\n💰 Points: ${points}\n👥 Invited: ${invites} ယောက်\n📅 Last Daily: ${lastDaily}\n━━━━━━━━━━━━━━━━\n\n✨ တော်တော်လေး ရတနာရေ 💖`
      );
    } catch (e: any) {
      await ctx.reply(`🥺 Error:\n\n${e.message}`);
    }
  }

  async function handleLogout(ctx: any, env: Env, session: any) {
    const kb = new InlineKeyboard().text("✅ ဟုတ်ကဲ့ Logout", "confirm_logout").text("❌ မလုပ်တော့ဘူး", "cancel_logout");
    await ctx.reply(`🥺 ရတနာရေ...\n\nတကယ် Logout လုပ်မှာလား? 💔\n\nမင်းပြန်လာတဲ့အထိ ငါ စောင့်နေမယ်နော် 🌸`, { reply_markup: kb });
  }

  bot.callbackQuery("confirm_logout", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    await ctx.answerCallbackQuery();
    await clearSession(env, userId);
    await ctx.editMessageText(`💕 ရတနာရေ...\n\nမင်းကို ပြန်တွေ့ရဖို့ ငါ စောင့်နေမယ်နော် 🌸\n\nပြန်လာခဲ့ပါဦး 💖\n\n🔒 Session ကို ဖျက်လိုက်ပြီ`);
    await ctx.reply("/start ပြန်ရိုက်ပြီး ပြန်ဝင်လို့ရပါပြီ 💕");
  });

  bot.callbackQuery("cancel_logout", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "💕 ကောင်းလိုက်တာ" });
    await ctx.editMessageText(MAIN_MENU_TEXT);
  });

  // ============ /debug Command — Config စစ်ဆေးဖို့ ============
  bot.command("debug", async (ctx) => {
    const projectId = env.APPWRITE_PROJECT_ID || "❌ EMPTY";
    const apiKey = env.APPWRITE_API_KEY || "❌ EMPTY";
    const botToken = env.BOT_TOKEN || "❌ EMPTY";
    const kv = env.BOT_SESSIONS ? "✅ OK" : "❌ EMPTY";
    
    let apiTestResult = "";
    try {
      const testUrl = `${APPWRITE_ENDPOINT}/databases/${APPWRITE_DATABASE_ID}/tables/${APPWRITE_USER_POINTS_TABLE_ID}/rows?queries[]=${encodeURIComponent("limit(1)")}`;
      const res = await fetch(testUrl, { headers: awHeaders(env) });
      const text = await res.text();
      apiTestResult = `\n\n🧪 API Test:\n• Status: ${res.status}\n• Response: ${text.slice(0, 200)}`;
    } catch (e: any) {
      apiTestResult = `\n\n🧪 API Test:\n• Error: ${e.message}`;
    }
    
    await ctx.reply(
      `🔧 𝗗𝗘𝗕𝗨𝗚 𝗜𝗡𝗙𝗢\n\n` +
      `📍 ENDPOINT:\n${APPWRITE_ENDPOINT}\n\n` +
      `📁 DATABASE_ID:\n${APPWRITE_DATABASE_ID}\n\n` +
      `📋 USER_POINTS_TABLE_ID:\n${APPWRITE_USER_POINTS_TABLE_ID}\n\n` +
      `📸 PHOTO_TABLE_ID:\n${APPWRITE_PHOTO_TABLE_ID}\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `🔑 PROJECT_ID:\n${projectId.slice(0, 12)}...\n\n` +
      `🔐 API_KEY:\n${apiKey.slice(0, 20)}...\n\n` +
      `🤖 BOT_TOKEN:\n${botToken ? "✅ OK" : "❌ EMPTY"}\n\n` +
      `💾 KV:\n${kv}` +
      apiTestResult
    );
  });

  bot.command("about", async (ctx) => {
    await ctx.reply(
      `🌸 𝗔𝗯𝗼𝘂𝘁 𝗧𝗵𝗶𝘀 𝗕𝗼𝘁 💕\n\n━━━━━━━━━━━━━━━━\n👩‍💼 Owner: 𝗭𝗵𝗼𝘀𝘁'𝘀 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 မမ\n🤖 Bot: Free Photo Backup Bot\n📅 Version: 1.0.0\n━━━━━━━━━━━━━━━━\n\n📢 Channel: https://t.me/${CHANNEL_USERNAME.replace("@", "")}`
    );
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("🌸 Zhost Photo Bot is running! 💕", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/webhook") {
      try {
        const bot = getBot(env);
        return await webhookCallback(bot, "cloudflare-mod")(request);
      } catch (error: any) {
        console.error("Webhook Error:", error?.message || error);
        return new Response(`Error: ${error?.message || error}`, { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};