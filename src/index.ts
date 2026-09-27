import { Bot, webhookCallback, InlineKeyboard, InputFile } from "grammy";

// ===========================================
// HARDCODED CREDENTIALS
// ===========================================
const BOT_TOKEN = "8947544923:AAG4Wrh70eqP4ybIfpsiPjWDriLXeMNgrw8";
const APPWRITE_API_KEY = "standard_3bbe927011c69872ba0e251623c062429b073adb83e47ee9e3edf31131e846683e2cbdcc75064ea65b798803d161ee703f70640040feef0bddf8e1850d098b8542beab30fc7e329fed2a3e1acfbce492223937d186af55dade513639bc3c81256effa1594413ec197982d50b4c506fa0ba3c41ade9cfc06f3285d40f0c9d413d";
const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6ab8a17c0009e545239a";
const APPWRITE_DATABASE_ID = "6ab8a2dd002493abffc1";
const APPWRITE_PHOTO_TABLE_ID = "6ab8a3170023949dc624";
// Fixed: Using the actual Appwrite table ID instead of the plain text name "user_points"
const APPWRITE_USER_POINTS_TABLE_ID = "6ab8a2ef0033fa0f19ff";
const APPWRITE_BUCKET_ID = "6ab8a9a20014b126f169";
const CHANNEL_ID = "@ZhostTech";
const CHANNEL_USERNAME = "@ZhostTech";
const DAILY_POINTS = 2;
const INVITE_POINTS = 2;

export interface Env {
  BOT_SESSIONS: KVNamespace;
  [key: string]: any;
}

// ============================================
// APPWRITE API HELPERS
// ============================================
function awHeaders(): Headers {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("X-Appwrite-Project", APPWRITE_PROJECT_ID);
  headers.set("X-Appwrite-Key", APPWRITE_API_KEY.trim());
  return headers;
}

async function awFetch(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${APPWRITE_ENDPOINT}${path}`;
  const fetchHeaders = awHeaders();
  
  if (options.headers) {
    new Headers(options.headers).forEach((value, key) => fetchHeaders.set(key, value));
  }

  const res = await fetch(url, {
    ...options,
    headers: fetchHeaders
  });
  const text = await res.text();
  
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON Response (${res.status}): ${text.slice(0, 100)}`);
  }
  
  if (!res.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return data;
}

async function awLogin(email: string, password: string): Promise<any> {
  const url = `${APPWRITE_ENDPOINT}/account/sessions/email`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Appwrite-Project": APPWRITE_PROJECT_ID },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error(`awLogin: HTML returned (${res.status})`); }
  if (!res.ok) throw new Error(`awLogin: ${data.message || "Login failed"}`);
  return data;
}

async function awRegister(email: string, password: string): Promise<any> {
  const url = `${APPWRITE_ENDPOINT}/account`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Appwrite-Project": APPWRITE_PROJECT_ID },
    body: JSON.stringify({ userId: "unique()", email, password, name: email.split("@")[0] }),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error(`awRegister: HTML returned (${res.status})`); }
  if (!res.ok) throw new Error(`awRegister: ${data.message || "Register failed"}`);
  return data;
}

async function awGetUserPoints(userId: string): Promise<any | null> {
  const q = encodeURIComponent(`equal("user_id", "${userId}")`);
  const path = `/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_USER_POINTS_TABLE_ID}/documents?queries[]=${q}&queries[]=limit(1)`;
  try {
    const data = await awFetch(path, { method: "GET" });
    return data.documents && data.documents.length > 0 ? data.documents[0] : null;
  } catch (e) { return null; }
}

async function awCreateUserPoints(userId: string, chatId: number, invitedBy: string = ""): Promise<any> {
  const payload = {
    user_id: userId,
    telegram_chat_id: String(chatId),
    points: 0,
    last_daily: "",
    total_invites: 0,
    invited_by: invitedBy,
  };
  const path = `/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_USER_POINTS_TABLE_ID}/documents`;
  return await awFetch(path, { 
    method: "POST", 
    body: JSON.stringify({ documentId: "unique()", data: payload }) 
  });
}

async function awUpdateUserPoints(documentId: string, updates: any): Promise<any> {
  const path = `/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_USER_POINTS_TABLE_ID}/documents/${documentId}`;
  return await awFetch(path, { 
    method: "PATCH", 
    body: JSON.stringify({ data: updates }) 
  });
}

async function awGetPhotos(userId: string, limit: number): Promise<any[]> {
  const q = encodeURIComponent(`equal("user_id", "${userId}")`);
  const path = `/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_PHOTO_TABLE_ID}/documents?queries[]=${q}&queries[]=limit(${limit})`;
  try {
    const data = await awFetch(path, { method: "GET" });
    return data.documents || [];
  } catch (e) { return []; }
}

async function awDeletePhoto(documentId: string, fileId: string): Promise<void> {
  try {
    await fetch(`${APPWRITE_ENDPOINT}/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_PHOTO_TABLE_ID}/documents/${documentId}`, { 
      method: "DELETE", headers: awHeaders() 
    });
  } catch (e) {}
  try {
    await fetch(`${APPWRITE_ENDPOINT}/storage/buckets/${APPWRITE_BUCKET_ID}/files/${fileId}`, { 
      method: "DELETE", headers: awHeaders() 
    });
  } catch (e) {}
}

async function awGetPhotoBytes(fileId: string): Promise<Uint8Array | null> {
  try {
    const url = `${APPWRITE_ENDPOINT}/storage/buckets/${APPWRITE_BUCKET_ID}/files/${fileId}/view`;
    const headers = new Headers();
    headers.set("X-Appwrite-Project", APPWRITE_PROJECT_ID);
    headers.set("X-Appwrite-Key", APPWRITE_API_KEY.trim());
    
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch (e) { return null; }
}

// ============================================
// KV SESSION HELPERS
// ============================================
async function setSession(env: Env, chatId: number, data: any) { try { await env.BOT_SESSIONS.put(`session:${chatId}`, JSON.stringify(data), { expirationTtl: 3600 }); } catch (e) {} }
async function getSession(env: Env, chatId: number): Promise<any | null> { try { const v = await env.BOT_SESSIONS.get(`session:${chatId}`); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
async function clearSession(env: Env, chatId: number) { try { await env.BOT_SESSIONS.delete(`session:${chatId}`); } catch (e) {} }
async function setState(env: Env, chatId: number, state: string, extra: any = {}) { try { await env.BOT_SESSIONS.put(`state:${chatId}`, JSON.stringify({ state, ...extra }), { expirationTtl: 600 }); } catch (e) {} }
async function getState(env: Env, chatId: number): Promise<any | null> { try { const v = await env.BOT_SESSIONS.get(`state:${chatId}`); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
async function clearState(env: Env, chatId: number) { try { await env.BOT_SESSIONS.delete(`state:${chatId}`); } catch (e) {} }

// ============================================
// BOT SETUP
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

let botInstance: Bot | null = null;

function getBot(env: Env): Bot {
  if (botInstance) return botInstance;
  botInstance = new Bot(BOT_TOKEN);
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
      const kb = new InlineKeyboard().url("📢 Join ZhostTech", `https://t.me/${CHANNEL_USERNAME.replace("@", "")}`).row().text("✅ Check", "check_join");
      await ctx.reply(`🌸 ဟယ်လို... ${name} ရေ 💕\n\nငါက 𝗭𝗵𝗼𝘀𝘁'𝘀 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 ရဲ့ Admin မမ 💕\n\nငါ့ Channel လေးကို Join ပေးပြီးမှ\nဒီ Bot လေးကို သုံးလို့ရမှာနော် 🌸\n\n👇 Join နှိပ်ပြီး "✅ Check" ကို နှိပ်လိုက်ပါ`, { reply_markup: kb });
      return;
    }

    if (referrerId) await setState(env, userId, "pending_invite", { referrerId });

    const session = await getSession(env, userId);
    if (session?.userId) {
      await ctx.reply(`🌸 ပြန်လာတာ ဝမ်းသာတယ် ${name} ရေ 💕\n\n${MAIN_MENU_TEXT}`, { reply_markup: getMainKeyboard() });
      return;
    }

    const kb = new InlineKeyboard().text("🔐 Login", "do_login").text("📝 Create Account", "do_register");
    await ctx.reply(`🌸 ဟယ်လို... ${name} ရေ 💕\n\nဒီ Bot လေးကို သုံးဖို့ App မှာ ဖွင့်ထားတဲ့ Account လိုတယ်နော် 🌸\n\nLogin ဝင်မလား? Account အသစ် ဖွင့်မလား?`, { reply_markup: kb });
  });

  bot.command("debug", async (ctx) => {
    let testResult = "";
    try {
      const url = `${APPWRITE_ENDPOINT}/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_USER_POINTS_TABLE_ID}/documents?queries[]=limit(1)`;
      const headers = awHeaders();
      const res = await fetch(url, { headers });
      const text = await res.text();
      testResult += `\n• DocumentsDB: ${res.status}\n• Preview: ${text.slice(0, 150)}`;
    } catch (e: any) { testResult = `\n• Error: ${e.message}`; }
    await ctx.reply(`🔧 DEBUG\n\n📍 ${APPWRITE_ENDPOINT}\n🔑 ${APPWRITE_PROJECT_ID}\n🔐 API KEY: OK\n📁 ${APPWRITE_DATABASE_ID}\n📋 ${APPWRITE_USER_POINTS_TABLE_ID}\n📸 ${APPWRITE_PHOTO_TABLE_ID}${testResult}`);
  });

  bot.command("about", async (ctx) => {
    await ctx.reply(`🌸 𝗔𝗯𝗼𝘂𝘁 𝗧𝗵𝗶𝘀 𝗕𝗼𝘁 💕\n\n👩‍💼 Owner: 𝗭𝗵𝗼𝘀𝘁'𝘀 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 မမ\n🤖 Bot: Free Photo Backup Bot\n📅 Version: 1.0.0\n\n📢 Channel: https://t.me/${CHANNEL_USERNAME.replace("@", "")}`);
  });

  bot.callbackQuery("check_join", async (ctx) => {
    const userId = ctx.from?.id;
    const name = ctx.from?.first_name || "သူငယ်ချင်း";
    if (!userId) return;
    let isJoined = false;
    try { const m = await ctx.api.getChatMember(CHANNEL_ID, userId); isJoined = ["creator", "administrator", "member", "restricted"].includes(m.status); } catch (e) {}
    if (!isJoined) { await ctx.answerCallbackQuery({ text: "🥺 Join မလုပ်ရသေးဘူးနော် 💔", show_alert: true }); return; }
    await ctx.answerCallbackQuery({ text: "✨ တော်တော်လေး 💕" });
    const session = await getSession(env, userId);
    if (session?.userId) {
      await ctx.editMessageText(`🌸 ပြန်လာတာ ဝမ်းသာတယ် ${name} ရေ 💕\n\n${MAIN_MENU_TEXT}`);
      await ctx.reply(MAIN_MENU_TEXT, { reply_markup: getMainKeyboard() });
      return;
    }
    const kb = new InlineKeyboard().text("🔐 Login", "do_login").text("📝 Create Account", "do_register");
    await ctx.editMessageText(`✨ ဟယ်... ${name} တော်တော်လေး 💕\n\nကဲ... Account လိုတယ်နော် 🌸\n\nLogin ဝင်မလား? Account အသစ် ဖွင့်မလား?`, { reply_markup: kb });
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
      if (!text.includes("@") || text.startsWith("@")) {
        await ctx.reply("🥺 Gmail ပုံစံ မမှန်ဘူးနော်... ပြန်ပို့ပေးပါဦး 💕\n\nဥပမာ - zawmyo@gmail.com");
        return;
      }
      await setState(env, userId, "waiting_password", { action: state.action, email: text, referrerId: state.referrerId });
      await ctx.reply(`💕 ကောင်းလိုက်တာ...\n\n🔒 Password လေးကို ပို့ပေးပါဦး 🌸\n\n(အနည်းဆုံး ၈ လုံး ရှိရမယ်နော်)`);
      return;
    }

    if (state.state === "waiting_password") {
      const email = state.email;
      const password = text;
      const action = state.action;
      if (password.length < 8) {
        await ctx.reply("🥺 Password က အနည်းဆုံး ၈ လုံး ရှိရမယ်နော်... ပြန်ပို့ပေးပါဦး 💕");
        return;
      }
      try {
        let user;
        if (action === "register") { user = await awRegister(email, password); }
        else { user = await awLogin(email, password); }
        const appwriteUserId = user.$id || user.userId;
        if (!appwriteUserId) throw new Error("User ID မရပါ");
        
        await setSession(env, userId, { userId: appwriteUserId, email: email });
        let userPoints = await awGetUserPoints(appwriteUserId);
        
        if (!userPoints) { 
          userPoints = await awCreateUserPoints(appwriteUserId, userId, state.referrerId || ""); 
        }
        
        await clearState(env, userId);
        await ctx.reply(`✨ ဝိုး... ရောက်သွားပြီနော် ${name} ရေ 💕\n\nမင်းကို ပြန်တွေ့ရတာ အရမ်းဝမ်းသာတယ် 🥰\n\n${MAIN_MENU_TEXT}`, { reply_markup: getMainKeyboard() });
      } catch (e: any) {
        await ctx.reply(`🥺 Error:\n\n${e.message}`);
        await clearState(env, userId);
      }
      return;
    }
  });

  async function handleDaily(ctx: any, env: Env, session: any) {
    try {
      let up = await awGetUserPoints(session.userId);
      if (!up) up = await awCreateUserPoints(session.userId, ctx.from.id);
      const today = new Date().toISOString().split("T")[0];
      const lastDaily = (up.last_daily || "").split("T")[0];
      if (lastDaily === today) {
        await ctx.reply(`🥺 ရတနာရေ... ဒီနေ့အတွက် ရယူပြီးသားလေ 💔\n\nမနက်ဖန် ပြန်လာခဲ့ပါဦးနော် 💕\n\n💰 လက်ရှိ Points: ${up.points || 0}`);
        return;
      }
      const np = (up.points || 0) + DAILY_POINTS;
      const documentId = up.$id;
      await awUpdateUserPoints(documentId, { points: np, last_daily: new Date().toISOString() });
      await ctx.reply(`💕 အိုး... ${ctx.from?.first_name || "ရတနာ"} လာပြီနော် 🌸\n\nဒီနေ့အတွက် Daily Bonus လေး ယူလိုက်ပါ 💫\n\n✨ +${DAILY_POINTS} Points ရသွားပြီ 💖\n💰 လက်ရှိ Points: ${np}`);
    } catch (e: any) { await ctx.reply(`🥺 Error:\n\n${e.message}`); }
  }

  async function handleShowPhotoMenu(ctx: any, env: Env, session: any) {
    try {
      const up = await awGetUserPoints(session.userId);
      const points = up?.points || 0;
      if (points < 1) {
        const kb = new InlineKeyboard().text("📅 Daily ယူမယ်", "go_daily").text("👥 Invite ခေါ်မယ်", "go_invite");
        await ctx.reply(`🥺 ရတနာရေ... မင်းမှာ Points မရှိသေးဘူးနော် 💔\n\n💫 Daily နှိပ်ရင် ${DAILY_POINTS} Points ရမယ်\n💫 Invite ခေါ်ရင် တစ်ယောက်ကို ${INVITE_POINTS} Points ရမယ်\n\nကဲ... စုလိုက်ရအောင် 🌸`, { reply_markup: kb });
        return;
      }
      const kb = new InlineKeyboard().text("⭐ 1 Point", "sp_1").text("⭐⭐ 2 Points", "sp_2").row().text("⭐⭐⭐ 3 Points", "sp_3").text("⭐⭐⭐⭐ 4 Points", "sp_4").row().text("⭐⭐⭐⭐⭐ 5 Points", "sp_5").row().text("⬅️ Back", "go_menu");
      await ctx.reply(`🌸 ရတနာရေ...\n\nမင်းရဲ့ အမှတ်တရ ဓာတ်ပုံလေးတွေ ကြည့်မလား? 💕\n\nဘယ်နှပုံ ကြည့်ချင်လဲ? 🥰\n\n💰 လက်ရှိ Points: ${points}`, { reply_markup: kb });
    } catch (e: any) { await ctx.reply(`🥺 Error:\n\n${e.message}`); }
  }

  for (let n = 1; n <= 5; n++) {
    bot.callbackQuery(`sp_${n}`, async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;
      await ctx.answerCallbackQuery();
      const session = await getSession(env, userId);
      if (!session?.userId) { await ctx.editMessageText("🥺 Session ကုန်သွားပြီ... /start ပြန်ရိုက်ပါ 💕"); return; }
      const cost = n;
      const up = await awGetUserPoints(session.userId);
      const points = up?.points || 0;
      const documentId = up?.$id;
      if (points < cost) { await ctx.editMessageText(`🥺 Points မလုံလောက်ဘူးနော် 💔\n\nလိုအပ်: ${cost} Points\nသင့်မှာ: ${points} Points\n\nDaily နှိပ်ပြီး စုလိုက်ရအောင် 🌸`); return; }
      
      await awUpdateUserPoints(documentId, { points: points - cost });
      await ctx.editMessageText(`🌸 ခဏစောင့်ပါနော်... ရှာနေတယ် 💕`);
      
      const photos = await awGetPhotos(session.userId, cost);
      if (!photos || photos.length === 0) {
        await awUpdateUserPoints(documentId, { points: points });
        await ctx.editMessageText(`🥺 ဓာတ်ပုံ မရှိတော့ဘူးနော် 💔\n\nApp ကနေ ပြန် Backup လုပ်ပေးပါဦး 🌸`);
        return;
      }
      let sent = 0;
      for (const photo of photos) {
        try {
          const bytes = await awGetPhotoBytes(photo.file_id);
          if (!bytes) continue;
          await ctx.replyWithPhoto(new InputFile(bytes, "photo.jpg"));
          const photoDocId = photo.$id;
          await awDeletePhoto(photoDocId, photo.file_id);
          sent++;
        } catch (e: any) {}
      }
      await ctx.reply(`✨ ကဲ... ${ctx.from?.first_name || "ရတနာ"} 💕\n\nဓာတ်ပုံ ${sent} ပုံ ရောက်လာပြီနော် 🌸\n\n💰 ကုန်သွားတဲ့ Points: ${cost}\n💖 ကျန်တဲ့ Points: ${points - cost}`);
    });
  }

  bot.callbackQuery("go_menu", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.editMessageText(MAIN_MENU_TEXT); });
  bot.callbackQuery("go_daily", async (ctx) => { await ctx.answerCallbackQuery(); const session = await getSession(env, ctx.from!.id); if (session) await handleDaily(ctx, env, session); });
  bot.callbackQuery("go_invite", async (ctx) => { await ctx.answerCallbackQuery(); const session = await getSession(env, ctx.from!.id); if (session) await handleInvite(ctx, env, session, ctx.from?.first_name || "သူငယ်ချင်း"); });

  async function handleInvite(ctx: any, env: Env, session: any, name: string) {
    try {
      const botInfo = await bot.api.getMe();
      const link = `https://t.me/${botInfo.username}?start=invite_${ctx.from.id}`;
      const up = await awGetUserPoints(session.userId);
      const invites = up?.total_invites || 0;
      const points = up?.points || 0;
      await ctx.reply(`💕 ${name} ရေ...\n\nမင်း သူငယ်ချင်းတွေကို ဖိတ်ခေါ်ချင်တာလား? 🥰\n\n👇 ဒီ Link ကို ကူးယူပြီး ပို့လိုက်ပါ\n\n🔗 ${link}\n\n✨ သူငယ်ချင်း တစ်ယောက် Join ရင် +${INVITE_POINTS} Points 💖\n\n👥 ခေါ်ခဲ့တဲ့ သူငယ်ချင်း: ${invites}\n💰 လက်ရှိ Points: ${points}`);
    } catch (e: any) { await ctx.reply(`🥺 Error:\n\n${e.message}`); }
  }

  async function handleProfile(ctx: any, env: Env, session: any) {
    try {
      const up = await awGetUserPoints(session.userId);
      const points = up?.points || 0;
      const invites = up?.total_invites || 0;
      const lastDaily = up?.last_daily ? new Date(up.last_daily).toLocaleDateString() : "မရှိ";
      await ctx.reply(`🌸 မင်းရဲ့ Profile လေးကို ကြည့်လိုက်ရအောင် 💕\n\n━━━━━━━━━━━━━━━━\n👩‍💼 Admin: 𝗭𝗵𝗼𝘀𝘁'𝘀 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 (မမ)\n📧 Email: ${session.email}\n━━━━━━━━━━━━━━━━\n💰 Points: ${points}\n👥 Invited: ${invites} ယောက်\n📅 Last Daily: ${lastDaily}\n━━━━━━━━━━━━━━━━\n\n✨ တော်တော်လေး ရတနာရေ 💖`);
    } catch (e: any) { await ctx.reply(`🥺 Error:\n\n${e.message}`); }
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

  bot.callbackQuery("cancel_logout", async (ctx) => { await ctx.answerCallbackQuery({ text: "💕 ကောင်းလိုက်တာ" }); await ctx.editMessageText(MAIN_MENU_TEXT); });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response("🌸 Zhost Photo Bot is running! 💕", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
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