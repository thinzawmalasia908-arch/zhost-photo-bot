import { Bot, webhookCallback, InlineKeyboard, InputFile } from "grammy";

export interface Env {
  BOT_TOKEN: string;
  APPWRITE_ENDPOINT: string;
  APPWRITE_PROJECT_ID: string;
  APPWRITE_API_KEY: string;
  APPWRITE_DATABASE_ID: string;
  APPWRITE_PHOTO_TABLE_ID: string;
  APPWRITE_USER_POINTS_TABLE_ID: string;
  APPWRITE_BUCKET_ID: string;
  CHANNEL_ID: string;
  CHANNEL_USERNAME: string;
  APK_LINK: string;
  BOT_SESSIONS: KVNamespace;
}

// ⚠️ Fallbacks
const FALLBACK_CHANNEL_ID = "@ZhostTech";
const FALLBACK_CHANNEL_USERNAME = "@ZhostTech";
const DAILY_POINTS = 2;
const INVITE_POINTS = 2;
const AUTO_DELETE_MS = 5000;

// ============================================
// Appwrite Helpers
// ============================================
function awHeaders(env: Env) {
  return {
    "Content-Type": "application/json",
    "X-Appwrite-Project": env.APPWRITE_PROJECT_ID,
    "X-Appwrite-Key": env.APPWRITE_API_KEY,
  };
}

// Login (client auth)
async function awLogin(env: Env, email: string, password: string): Promise<any> {
  const res = await fetch(`${env.APPWRITE_ENDPOINT}/account/sessions/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": env.APPWRITE_PROJECT_ID,
    },
    body: JSON.stringify({ email, password }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data.message || "Login failed");
  return data;
}

// Register new user
async function awRegister(env: Env, email: string, password: string): Promise<any> {
  const res = await fetch(`${env.APPWRITE_ENDPOINT}/account`, {
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
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data.message || "Register failed");
  return data;
}

// Get user_points row by user_id
async function awGetUserPoints(env: Env, userId: string): Promise<any | null> {
  const url = `${env.APPWRITE_ENDPOINT}/databases/${env.APPWRITE_DATABASE_ID}/tables/${env.APPWRITE_USER_POINTS_TABLE_ID}/rows?queries[]=${encodeURIComponent(`equal("user_id", ["${userId}"])`)}&queries[]=${encodeURIComponent('limit(1)')}`;
  const res = await fetch(url, { headers: awHeaders(env) });
  const data: any = await res.json();
  if (!res.ok) return null;
  return data.rows && data.rows.length > 0 ? data.rows[0] : null;
}

// Create user_points row
async function awCreateUserPoints(env: Env, userId: string, chatId: number, invitedBy: string = ""): Promise<any> {
  const res = await fetch(`${env.APPWRITE_ENDPOINT}/databases/${env.APPWRITE_DATABASE_ID}/tables/${env.APPWRITE_USER_POINTS_TABLE_ID}/rows`, {
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
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data.message || "Create user failed");
  return data;
}

// Update user_points
async function awUpdateUserPoints(env: Env, rowId: string, updates: any): Promise<any> {
  const res = await fetch(`${env.APPWRITE_ENDPOINT}/databases/${env.APPWRITE_DATABASE_ID}/tables/${env.APPWRITE_USER_POINTS_TABLE_ID}/rows/${rowId}`, {
    method: "PATCH",
    headers: awHeaders(env),
    body: JSON.stringify({ data: updates }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data.message || "Update failed");
  return data;
}

// Get photos for user
async function awGetPhotos(env: Env, userId: string, limit: number): Promise<any[]> {
  const url = `${env.APPWRITE_ENDPOINT}/databases/${env.APPWRITE_DATABASE_ID}/tables/${env.APPWRITE_PHOTO_TABLE_ID}/rows?queries[]=${encodeURIComponent(`equal("user_id", ["${userId}"])`)}&queries[]=${encodeURIComponent(`limit(${limit})`)}`;
  const res = await fetch(url, { headers: awHeaders(env) });
  const data: any = await res.json();
  if (!res.ok) return [];
  return data.rows || [];
}

// Delete photo (row + file)
async function awDeletePhoto(env: Env, rowId: string, fileId: string): Promise<void> {
  try {
    await fetch(`${env.APPWRITE_ENDPOINT}/databases/${env.APPWRITE_DATABASE_ID}/tables/${env.APPWRITE_PHOTO_TABLE_ID}/rows/${rowId}`, {
      method: "DELETE",
      headers: awHeaders(env),
    });
  } catch (e) {}
  try {
    await fetch(`${env.APPWRITE_ENDPOINT}/storage/buckets/${env.APPWRITE_BUCKET_ID}/files/${fileId}`, {
      method: "DELETE",
      headers: awHeaders(env),
    });
  } catch (e) {}
}

// Get photo file bytes
async function awGetPhotoBytes(env: Env, fileId: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`${env.APPWRITE_ENDPOINT}/storage/buckets/${env.APPWRITE_BUCKET_ID}/files/${fileId}/view`, {
      headers: {
        "X-Appwrite-Project": env.APPWRITE_PROJECT_ID,
        "X-Appwrite-Key": env.APPWRITE_API_KEY,
      },
    });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    return null;
  }
}

// Get user by email
async function awFindUserByEmail(env: Env, email: string): Promise<any | null> {
  const url = `${env.APPWRITE_ENDPOINT}/users?search=${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: awHeaders(env) });
  const data: any = await res.json();
  if (!res.ok) return null;
  const users = data.users || [];
  return users.find((u: any) => u.email === email) || null;
}

// ============================================
// Session Helpers (KV)
// ============================================
async function setSession(env: Env, chatId: number, data: any): Promise<void> {
  try {
    await env.BOT_SESSIONS.put(`session:${chatId}`, JSON.stringify(data), { expirationTtl: 3600 });
  } catch (e) { console.error("KV set error:", e); }
}

async function getSession(env: Env, chatId: number): Promise<any | null> {
  try {
    const v = await env.BOT_SESSIONS.get(`session:${chatId}`);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}

async function clearSession(env: Env, chatId: number): Promise<void> {
  try { await env.BOT_SESSIONS.delete(`session:${chatId}`); } catch (e) {}
}

async function setState(env: Env, chatId: number, state: string, extra: any = {}): Promise<void> {
  try {
    await env.BOT_SESSIONS.put(`state:${chatId}`, JSON.stringify({ state, ...extra }), { expirationTtl: 600 });
  } catch (e) {}
}

async function getState(env: Env, chatId: number): Promise<any | null> {
  try {
    const v = await env.BOT_SESSIONS.get(`state:${chatId}`);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}

async function clearState(env: Env, chatId: number): Promise<void> {
  try { await env.BOT_SESSIONS.delete(`state:${chatId}`); } catch (e) {}
}

// ============================================
// Main Menu Keyboard
// ============================================
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

// ============================================
// Get Bot Instance
// ============================================
let botInstance: Bot | null = null;
let currentEnv: Env | null = null;

function getBot(env: Env): Bot {
  if (botInstance && currentEnv === env) return botInstance;
  botInstance = new Bot(env.BOT_TOKEN);
  currentEnv = env;
  setupBot(botInstance, env);
  return botInstance;
}

// ============================================
// Bot Setup
// ============================================
function setupBot(bot: Bot, env: Env) {
  const channelId = (env.CHANNEL_ID || "").trim() || FALLBACK_CHANNEL_ID;
  const channelUsername = (env.CHANNEL_USERNAME || "").trim() || FALLBACK_CHANNEL_USERNAME;

  // ==========================================
  // /start Command
  // ==========================================
  bot.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    const name = ctx.from?.first_name || "သူငယ်ချင်း";
    if (!userId) return;

    // Check invite payload
    const payload = ctx.match?.trim() || "";
    if (payload.startsWith("invite_")) {
      const referrerId = payload.replace("invite_", "");
      await setState(env, userId, "pending_invite", { referrerId });
    }

    // Check channel join
    let isJoined = false;
    try {
      const member = await ctx.api.getChatMember(channelId, userId);
      isJoined = ["creator", "administrator", "member", "restricted"].includes(member.status);
    } catch (e) { isJoined = true; }

    if (!isJoined) {
      const kb = new InlineKeyboard()
        .url("📢 Join ZhostTech", `https://t.me/${channelUsername.replace("@", "")}`)
        .row()
        .text("✅ Check", "check_join");
      await ctx.reply(
        `🌸 ဟယ်လို... ${name} ရေ 💕\n\n` +
          `ငါက 𝗭𝗵𝗼𝘀𝘁'𝘀 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 ရဲ့ Admin မမ 💕\n\n` +
          `ငါ့ Channel လေးကို Join ပေးပြီးမှ\nဒီ Bot လေးကို သုံးလို့ရမှာနော် 🌸\n\n` +
          `👇 Join နှိပ်ပြီး "✅ Check" ကို နှိပ်လိုက်ပါ`,
        { reply_markup: kb }
      );
      return;
    }

    // Check if user already logged in
    const session = await getSession(env, userId);
    if (session?.userId) {
      await ctx.reply(
        `🌸 ပြန်လာတာ ဝမ်းသာတယ် ${name} ရေ 💕\n\n${MAIN_MENU_TEXT}`,
        { reply_markup: getMainKeyboard() }
      );
      return;
    }

    // Show Login/Register options
    const kb = new InlineKeyboard()
      .text("🔐 Login", "do_login")
      .text("📝 Create Account", "do_register");
    await ctx.reply(
      `🌸 ဟယ်လို... ${name} ရေ 💕\n\n` +
        `ငါက 𝗭𝗵𝗼𝘀𝘁'𝘀 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 ရဲ့ Admin မမ 💕\n\n` +
        `ဒီ Bot လေးကို သုံးဖို့ App မှာ ဖွင့်ထားတဲ့\n` +
        `Account လေး လိုတယ်နော် 🌸\n\n` +
        `Login ဝင်မလား? Account အသစ် ဖွင့်မလား?`,
      { reply_markup: kb }
    );
  });

  // ==========================================
  // Check Join
  // ==========================================
  bot.callbackQuery("check_join", async (ctx) => {
    const userId = ctx.from?.id;
    const name = ctx.from?.first_name || "သူငယ်ချင်း";
    if (!userId) return;

    let isJoined = false;
    try {
      const m = await ctx.api.getChatMember(channelId, userId);
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

    const kb = new InlineKeyboard()
      .text("🔐 Login", "do_login")
      .text("📝 Create Account", "do_register");
    await ctx.editMessageText(
      `✨ ဟယ်... ${name} တော်တော်လေး 💕\n\n` +
        `ကဲ... ဒီ Bot လေးကို သုံးဖို့ App Account လိုတယ်နော် 🌸\n\n` +
        `Login ဝင်မလား? Account အသစ် ဖွင့်မလား?`,
      { reply_markup: kb }
    );
  });

  // ==========================================
  // Login Flow
  // ==========================================
  bot.callbackQuery("do_login", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    await ctx.answerCallbackQuery();
    await setState(env, userId, "waiting_email", { action: "login" });
    await ctx.editMessageText(
      `🔐 Login ဝင်မယ်နော် 💕\n\n📧 မင်းရဲ့ Gmail လေးကို ပို့ပေးပါဦး 🌸`
    );
  });

  // ==========================================
  // Register Flow
  // ==========================================
  bot.callbackQuery("do_register", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    await ctx.answerCallbackQuery();
    await setState(env, userId, "waiting_email", { action: "register" });
    await ctx.editMessageText(
      `📝 Account အသစ် ဖွင့်မယ်နော် 💕\n\n📧 Gmail လေးကို ပို့ပေးပါဦး 🌸`
    );
  });

  // ==========================================
  // Text Message Handler (State Machine)
  // ==========================================
  bot.on("message:text", async (ctx) => {
    const userId = ctx.from?.id;
    const text = ctx.message.text.trim();
    const name = ctx.from?.first_name || "သူငယ်ချင်း";
    if (!userId) return;

    // Skip command messages
    if (text.startsWith("/")) return;

    // ============ Main Menu Buttons ============
    const session = await getSession(env, userId);
    if (session?.userId) {
      if (text === "📅 Daily") return handleDaily(ctx, env, session);
      if (text === "🖼️ Show Photo") return handleShowPhotoMenu(ctx, env, session);
      if (text === "👥 Invite") return handleInvite(ctx, env, session, name);
      if (text === "👤 Profile") return handleProfile(ctx, env, session);
      if (text === "🚪 Logout") return handleLogout(ctx, env, session);
      return;
    }

    // ============ Login State Machine ============
    const state = await getState(env, userId);
    if (!state) return;

    // Waiting for email
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

    // Waiting for password
    if (state.state === "waiting_password") {
      const email = state.email;
      const password = text;
      const action = state.action;

      try {
        let user;
        if (action === "register") {
          try {
            user = await awRegister(env, email, password);
          } catch (e: any) {
            await ctx.reply(
              `🥺 Account ဖွင့်လို့ မရဘူးနော် 💔\n\n${e.message}\n\n` +
                `ဒီ Gmail နဲ့ Account ရှိပြီးသားလား? Login ဝင်ကြည့်ပါဦး 🌸`
            );
            await clearState(env, userId);
            return;
          }
        } else {
          user = await awLogin(env, email, password);
          // user.$id or user.userId
        }

        const appwriteUserId = user.$id || user.userId;
        if (!appwriteUserId) throw new Error("User ID မရပါ");

        // Save session
        await setSession(env, userId, {
          userId: appwriteUserId,
          email: email,
        });

        // Check / create user_points
        let userPoints = await awGetUserPoints(env, appwriteUserId);
        if (!userPoints) {
          userPoints = await awCreateUserPoints(env, appwriteUserId, userId, state.referrerId || "");
          // Give referrer bonus
          if (state.referrerId) {
            const referrerSession = await getSession(env, parseInt(state.referrerId));
            if (referrerSession?.userId) {
              const refPoints = await awGetUserPoints(env, referrerSession.userId);
              if (refPoints) {
                await awUpdateUserPoints(env, refPoints.$id, {
                  points: (refPoints.points || 0) + INVITE_POINTS,
                  total_invites: (refPoints.total_invites || 0) + 1,
                });
              }
            }
          }
        }

        await clearState(env, userId);
        await ctx.reply(
          `✨ ဝိုး... ရောက်သွားပြီနော် ${name} ရေ 💕\n\n` +
            `မင်းကို ပြန်တွေ့ရတာ အရမ်းဝမ်းသာတယ် 🥰\n\n` +
            `${MAIN_MENU_TEXT}`,
          { reply_markup: getMainKeyboard() }
        );
      } catch (e: any) {
        await ctx.reply(`🥺 Error: ${e.message}\n\nပြန်ကြိုးစားပါဦး 💔`);
        await clearState(env, userId);
      }
      return;
    }
  });

  // ==========================================
  // Daily Handler
  // ==========================================
  async function handleDaily(ctx: any, env: Env, session: any) {
    try {
      let userPoints = await awGetUserPoints(env, session.userId);
      if (!userPoints) {
        userPoints = await awCreateUserPoints(env, session.userId, ctx.from.id);
      }

      const today = new Date().toISOString().split("T")[0];
      const lastDaily = (userPoints.last_daily || "").split("T")[0];

      if (lastDaily === today) {
        await ctx.reply(
          `🥺 ရတနာရေ... ဒီနေ့အတွက် ရယူပြီးသားလေ 💔\n\n` +
            `မနက်ဖန် ပြန်လာခဲ့ပါဦးနော် 💕\n\n` +
            `💰 လက်ရှိ Points: ${userPoints.points || 0}`
        );
        return;
      }

      const newPoints = (userPoints.points || 0) + DAILY_POINTS;
      await awUpdateUserPoints(env, userPoints.$id, {
        points: newPoints,
        last_daily: new Date().toISOString(),
      });

      await ctx.reply(
        `💕 အိုး... ${ctx.from?.first_name || "ရတနာ"} လာပြီနော် 🌸\n\n` +
          `ဒီနေ့အတွက် Daily Bonus လေး ယူလိုက်ပါ 💫\n\n` +
          `✨ +${DAILY_POINTS} Points ရသွားပြီ 💖\n` +
          `💰 လက်ရှိ Points: ${newPoints}`
      );
    } catch (e: any) {
      await ctx.reply(`🥺 Error: ${e.message}`);
    }
  }

  // ==========================================
  // Show Photo Menu
  // ==========================================
  async function handleShowPhotoMenu(ctx: any, env: Env, session: any) {
    try {
      const userPoints = await awGetUserPoints(env, session.userId);
      const points = userPoints?.points || 0;

      if (points < 1) {
        const kb = new InlineKeyboard()
          .text("📅 Daily ယူမယ်", "go_daily")
          .text("👥 Invite ခေါ်မယ်", "go_invite");
        await ctx.reply(
          `🥺 ရတနာရေ... မင်းမှာ Points မရှိသေးဘူးနော် 💔\n\n` +
            `💫 Daily နှိပ်ရင် ${DAILY_POINTS} Points ရမယ်\n` +
            `💫 Invite ခေါ်ရင် တစ်ယောက်ကို ${INVITE_POINTS} Points ရမယ်\n\n` +
            `ကဲ... စုလိုက်ရအောင် 🌸`,
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
        `🌸 ရတနာရေ...\n\nမင်းရဲ့ အမှတ်တရ ဓာတ်ပုံလေးတွေ ကြည့်မလား? 💕\n\n` +
          `ဘယ်နှပုံ ကြည့်ချင်လဲ? 🥰\n\n💰 လက်ရှိ Points: ${points}`,
        { reply_markup: kb }
      );
    } catch (e: any) {
      await ctx.reply(`🥺 Error: ${e.message}`);
    }
  }

  // Show Photo Callbacks
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
      const userPoints = await awGetUserPoints(env, session.userId);
      const points = userPoints?.points || 0;

      if (points < cost) {
        await ctx.editMessageText(
          `🥺 Points မလုံလောက်ဘူးနော် 💔\n\n` +
            `လိုအပ်: ${cost} Points\nသင့်မှာ: ${points} Points\n\n` +
            `Daily နှိပ်ပြီး စုလိုက်ရအောင် 🌸`
        );
        return;
      }

      // Deduct points
      await awUpdateUserPoints(env, userPoints.$id, { points: points - cost });

      await ctx.editMessageText(`🌸 ခဏစောင့်ပါနော်... ရှာနေတယ် 💕`);

      // Get photos
      const photos = await awGetPhotos(env, session.userId, cost);
      if (!photos || photos.length === 0) {
        // Refund
        await awUpdateUserPoints(env, userPoints.$id, { points: points });
        await ctx.editMessageText(
          `🥺 ဓာတ်ပုံ မရှိတော့ဘူးနော် 💔\n\nApp ကနေ ပြန် Backup လုပ်ပေးပါဦး 🌸`
        );
        return;
      }

      // Send each photo, then delete
      let sent = 0;
      for (const photo of photos) {
        try {
          const bytes = await awGetPhotoBytes(env, photo.file_id);
          if (!bytes) continue;
          await ctx.replyWithPhoto(new InputFile(bytes, "photo.jpg"));
          // Delete after sending
          await awDeletePhoto(env, photo.$id, photo.file_id);
          sent++;
        } catch (e: any) {
          console.error("Photo send error:", e?.message || e);
        }
      }

      await ctx.reply(
        `✨ ကဲ... ${ctx.from?.first_name || "ရတနာ"} 💕\n\n` +
          `ဓာတ်ပုံ ${sent} ပုံ ရောက်လာပြီနော် 🌸\n\n` +
          `💰 ကုန်သွားတဲ့ Points: ${cost}\n` +
          `💖 ကျန်တဲ့ Points: ${points - cost}`
      );
    });
  }

  // ==========================================
  // Back to Menu / Daily / Invite shortcuts
  // ==========================================
  bot.callbackQuery("go_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(MAIN_MENU_TEXT);
  });

  bot.callbackQuery("go_daily", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = await getSession(env, userId);
    if (!session) return;
    await handleDaily(ctx, env, session);
  });

  bot.callbackQuery("go_invite", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = await getSession(env, userId);
    if (!session) return;
    await handleInvite(ctx, env, session, ctx.from?.first_name || "သူငယ်ချင်း");
  });

  // ==========================================
  // Invite Handler
  // ==========================================
  async function handleInvite(ctx: any, env: Env, session: any, name: string) {
    try {
      const botInfo = await bot.api.getMe();
      const link = `https://t.me/${botInfo.username}?start=invite_${ctx.from.id}`;
      const userPoints = await awGetUserPoints(env, session.userId);
      const invites = userPoints?.total_invites || 0;
      const points = userPoints?.points || 0;

      await ctx.reply(
        `💕 ${name} ရေ...\n\nမင်း သူငယ်ချင်းတွေကို ဖိတ်ခေါ်ချင်တာလား? 🥰\n\n` +
          `👇 ဒီ Link ကို ကူးယူပြီး ပို့လိုက်ပါ\n\n` +
          `🔗 ${link}\n\n` +
          `✨ သူငယ်ချင်း တစ်ယောက် Join ရင် +${INVITE_POINTS} Points 💖\n\n` +
          `👥 ခေါ်ခဲ့တဲ့ သူငယ်ချင်း: ${invites}\n💰 လက်ရှိ Points: ${points}`
      );
    } catch (e: any) {
      await ctx.reply(`🥺 Error: ${e.message}`);
    }
  }

  // ==========================================
  // Profile Handler
  // ==========================================
  async function handleProfile(ctx: any, env: Env, session: any) {
    try {
      const userPoints = await awGetUserPoints(env, session.userId);
      const points = userPoints?.points || 0;
      const invites = userPoints?.total_invites || 0;
      const lastDaily = userPoints?.last_daily ? new Date(userPoints.last_daily).toLocaleDateString() : "မရှိ";

      // Count photos
      const photos = await awGetPhotos(env, session.userId, 1);
      const photoCount = photos.length > 0 ? "ရှိ" : "မရှိ";

      await ctx.reply(
        `🌸 မင်းရဲ့ Profile လေးကို ကြည့်လိုက်ရအောင် 💕\n\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `👩‍💼 Admin: 𝗭𝗵𝗼𝘀𝘁'𝘀 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 (မမ)\n` +
          `📧 Email: ${session.email}\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `💰 Points: ${points}\n` +
          `👥 Invited: ${invites} ယောက်\n` +
          `🖼️ Backup Photos: ${photoCount}\n` +
          `📅 Last Daily: ${lastDaily}\n` +
          `━━━━━━━━━━━━━━━━\n\n` +
          `✨ တော်တော်လေး ရတနာရေ 💖`
      );
    } catch (e: any) {
      await ctx.reply(`🥺 Error: ${e.message}`);
    }
  }

  // ==========================================
  // Logout Handler
  // ==========================================
  async function handleLogout(ctx: any, env: Env, session: any) {
    const userId = ctx.from?.id;
    if (!userId) return;
    const kb = new InlineKeyboard()
      .text("✅ ဟုတ်ကဲ့ Logout", "confirm_logout")
      .text("❌ မလုပ်တော့ဘူး", "cancel_logout");
    await ctx.reply(
      `🥺 ရတနာရေ...\n\nတကယ် Logout လုပ်မှာလား? 💔\n\n` +
        `မင်းပြန်လာတဲ့အထိ ငါ စောင့်နေမယ်နော် 🌸`,
      { reply_markup: kb }
    );
  }

  bot.callbackQuery("confirm_logout", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    await ctx.answerCallbackQuery();
    await clearSession(env, userId);
    await ctx.editMessageText(
      `💕 ရတနာရေ...\n\nမင်းကို ပြန်တွေ့ရဖို့ ငါ စောင့်နေမယ်နော် 🌸\n\n` +
        `ပြန်လာခဲ့ပါဦး 💖\n\n🔒 Session ကို ဖျက်လိုက်ပြီ`
    );
    await ctx.reply("/start ပြန်ရိုက်ပြီး ပြန်ဝင်လို့ရပါပြီ 💕");
  });

  bot.callbackQuery("cancel_logout", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "💕 ကောင်းလိုက်တာ" });
    await ctx.editMessageText(MAIN_MENU_TEXT);
  });

  // ==========================================
  // /about
  // ==========================================
  bot.command("about", async (ctx) => {
    await ctx.reply(
      `🌸 𝗔𝗯𝗼𝘂𝘁 𝗧𝗵𝗶𝘀 𝗕𝗼𝘁 💕\n\n` +
        `━━━━━━━━━━━━━━━━\n👩‍💼 Owner: 𝗭𝗵𝗼𝘀𝘁'𝘀 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 မမ\n` +
        `🤖 Bot: Free Photo Backup Bot\n📅 Version: 1.0.0\n━━━━━━━━━━━━━━━━\n\n` +
        `📢 Channel: https://t.me/${channelUsername.replace("@", "")}`
    );
  });
}

// ============================================
// Main Worker
// ============================================
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