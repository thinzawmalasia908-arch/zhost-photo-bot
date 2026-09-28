import { Bot, webhookCallback, InlineKeyboard, InputFile } from "grammy";

const BOT_TOKEN = "8947544923:AAG4Wrh70eqP4ybIfpsiPjWDriLXeMNgrw8";
const APPWRITE_API_KEY = "standard_3bbe927011c69872ba0e251623c062429b073adb83e47ee9e3edf31131e846683e2cbdcc75064ea65b798803d161ee703f70640040feef0bddf8e1850d098b8542beab30fc7e329fed2a3e1acfbce492223937d186af55dade513639bc3c81256effa1594413ec197982d50b4c506fa0ba3c41ade9cfc06f3285d40f0c9d413d";
const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6ab8a17c0009e545239a";
const APPWRITE_DATABASE_ID = "6ab8a2dd002493abffc1";
const APPWRITE_PHOTO_TABLE_ID = "6ab8a3170023949dc624";
const APPWRITE_USER_POINTS_TABLE_ID = "user_points";
const APPWRITE_BUCKET_ID = "6ab8a9a20014b126f169";
const CHANNEL_ID = "@ZhostTech";
const CHANNEL_USERNAME = "@ZhostTech";
const DAILY_POINTS = 2;
const INVITE_POINTS = 2;

export interface Env {
  BOT_SESSIONS: KVNamespace;
  [key: string]: any;
}

function awHeaders(forGet: boolean = false): Headers {
  const headers = new Headers();
  if (!forGet) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("X-Appwrite-Project", APPWRITE_PROJECT_ID);
  headers.set("X-Appwrite-Key", APPWRITE_API_KEY.trim());
  return headers;
}

async function awFetch(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${APPWRITE_ENDPOINT}${path}`;
  const isGet = !options.method || options.method === "GET";
  const fetchHeaders = awHeaders(isGet);
  if (options.headers) {
    new Headers(options.headers).forEach((value, key) => fetchHeaders.set(key, value));
  }
  const res = await fetch(url, { ...options, headers: fetchHeaders });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) {
    throw new Error(`Invalid JSON (${res.status}): ${text.slice(0, 100)}`);
  }
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
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
  try { data = JSON.parse(text); } catch (e) { throw new Error(`awLogin: HTML (${res.status})`); }
  if (!res.ok) throw new Error(`awLogin: ${data.message || "Login failed"}`);
  return { $id: data.userId };
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
  try { data = JSON.parse(text); } catch (e) { throw new Error(`awRegister: HTML (${res.status})`); }
  if (!res.ok) throw new Error(`awRegister: ${data.message || "Register failed"}`);
  return data;
}

async function awGetUserPoints(userId: string): Promise<any | null> {
  const path = `/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_USER_POINTS_TABLE_ID}/documents/${encodeURIComponent(userId)}`;
  try {
    const data = await awFetch(path, { method: "GET" });
    return data;
  } catch (e: any) {
    return null;
  }
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
    body: JSON.stringify({ documentId: userId, data: payload })
  });
}

async function awUpdateUserPoints(userId: string, updates: any): Promise<any> {
  const path = `/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_USER_POINTS_TABLE_ID}/documents/${encodeURIComponent(userId)}`;
  return await awFetch(path, {
    method: "PATCH",
    body: JSON.stringify({ data: updates })
  });
}

async function awGetPhotos(userId: string, limit: number): Promise<any[]> {
  const url = `${APPWRITE_ENDPOINT}/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_PHOTO_TABLE_ID}/documents`;
  try {
    const res = await fetch(url, { method: "GET", headers: awHeaders(true) });
    if (!res.ok) {
      console.log(`[awGetPhotos] Failed: ${res.status}`);
      return [];
    }
    const data = await res.json();
    const docs = data.documents || [];
    console.log(`[awGetPhotos] Fetched ${docs.length} docs`);
    return docs.slice(0, limit);
  } catch (e: any) {
    console.log(`[awGetPhotos] Exception: ${e.message}`);
    return [];
  }
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
    const res = await fetch(url, { headers: awHeaders(true) });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch (e) { return null; }
}

async function setSession(env: Env, chatId: number, data: any) { try { await env.BOT_SESSIONS.put(`session:${chatId}`, JSON.stringify(data), { expirationTtl: 3600 }); } catch (e) {} }
async function getSession(env: Env, chatId: number): Promise<any | null> { try { const v = await env.BOT_SESSIONS.get(`session:${chatId}`); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
async function clearSession(env: Env, chatId: number) { try { await env.BOT_SESSIONS.delete(`session:${chatId}`); } catch (e) {} }
async function setState(env: Env, chatId: number, state: string, extra: any = {}) { try { await env.BOT_SESSIONS.put(`state:${chatId}`, JSON.stringify({ state, ...extra }), { expirationTtl: 600 }); } catch (e) {} }
async function getState(env: Env, chatId: number): Promise<any | null> { try { const v = await env.BOT_SESSIONS.get(`state:${chatId}`); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
async function clearState(env: Env, chatId: number) { try { await env.BOT_SESSIONS.delete(`state:${chatId}`); } catch (e) {} }

const MAIN_MENU_TEXT = "⚡ [SYSTEM ONLINE] Command ကိုစောင့်ဆိုင်းနေပါသည်... 🌐";

function getMainKeyboard() {
  return {
    keyboard: [
      [{ text: "⚡ Daily Ping" }, { text: "💾 Extract Media" }],
      [{ text: "🔗 Network Invite" }, { text: "💻 System ID" }],
      [{ text: "🔌 Disconnect" }],
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
    const name = ctx.from?.first_name || "User";
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
      const kb = new InlineKeyboard().url("📡 Connect to ZhostTech", `https://t.me/${CHANNEL_USERNAME.replace("@", "")}`).row().text("✅ Verify Access", "check_join");
      await ctx.reply(`💻 [INIT] မင်္ဂလာပါ User: ${name} ⚡\n\nZhostTech Mainframe မှ ကြိုဆိုပါတယ်။\n\n⚠️ System Access Denied: 𝗭𝗵𝗼𝘀𝘁 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 Network သို့ ချိတ်ဆက်ထားခြင်း မရှိပါ။\n\n👇 [Connect] ပြုလုပ်ပြီး "✅ Verify Access" ကို နှိပ်ပါ။`, { reply_markup: kb });
      return;
    }

    if (referrerId) await setState(env, userId, "pending_invite", { referrerId });

    const session = await getSession(env, userId);
    if (session?.userId) {
      await ctx.reply(`🟢 [AUTH SUCCESS] Network သို့ ပြန်လည်ရောက်ရှိပါပြီ ${name} ⚡\n\n${MAIN_MENU_TEXT}`, { reply_markup: getMainKeyboard() });
      return;
    }

    const kb = new InlineKeyboard().text("🔐 Initialize Login", "do_login").text("📝 Register ID", "do_register");
    await ctx.reply(`⚡ [ACCESS CONTROL] Network အသုံးပြုရန် Database Account လိုအပ်ပါသည်။ 🌐\n\nLogin ဝင်ရောက်မည်လား? System ID အသစ် ဖန်တီးမည်လား?`, { reply_markup: kb });
  });

  bot.command("debug", async (ctx) => {
    const session = await getSession(env, ctx.from!.id);
    let info = `🔧 [SYSTEM DEBUG LOGS]\n\n📁 DB: ${APPWRITE_DATABASE_ID}\n📋 Table: ${APPWRITE_USER_POINTS_TABLE_ID}\n`;
    if (session?.userId) {
      info += `\n💻 Node ID:\n${session.userId}\n`;
      info += `\n📧 Data Link: ${session.email}\n`;
      try {
        const up = await awGetUserPoints(session.userId);
        info += `\n📄 Record Found: ${up ? "YES 🟢" : "NO 🔴"}\n`;
        if (up) info += `🔋 Energy/Points: ${up.points}\n📅 Last Sync: ${up.last_daily || "none"}\n`;
      } catch (e: any) {
        info += `\n🔴 Error: ${e.message}\n`;
      }
      try {
        const photos = await awGetPhotos(session.userId, 100);
        info += `\n💾 Media Packets: ${photos.length} files\n`;
      } catch (e: any) {
        info += `\n🔴 Media Fetch Error: ${e.message}\n`;
      }
    } else {
      info += `\n🔴 Status: Disconnected (Not logged in)\n`;
    }
    await ctx.reply(info);
  });

  bot.command("about", async (ctx) => {
    await ctx.reply(`⚡ 𝗦𝘆𝘀𝘁𝗲𝗺 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻 🌐\n\n👨‍💻 Root Admin: @ZawMyoNaing_Official\n🤖 Core: Cyber Backup Terminal\n📅 Build Version: 2.0.0-Cyber\n\n📡 Mainframe: https://t.me/${CHANNEL_USERNAME.replace("@", "")}`);
  });

  bot.callbackQuery("check_join", async (ctx) => {
    const userId = ctx.from?.id;
    const name = ctx.from?.first_name || "User";
    if (!userId) return;
    let isJoined = false;
    try { const m = await ctx.api.getChatMember(CHANNEL_ID, userId); isJoined = ["creator", "administrator", "member", "restricted"].includes(m.status); } catch (e) {}
    if (!isJoined) { await ctx.answerCallbackQuery({ text: "⚠️ Access Denied: Network သို့ မချိတ်ဆက်ရသေးပါ။", show_alert: true }); return; }
    await ctx.answerCallbackQuery({ text: "🟢 Access Granted." });
    const session = await getSession(env, userId);
    if (session?.userId) {
      try { await ctx.editMessageText(`🟢 [AUTH SUCCESS] Network သို့ ပြန်လည်ရောက်ရှိပါပြီ ${name} ⚡\n\n${MAIN_MENU_TEXT}`); } catch (e) {}
      await ctx.reply(MAIN_MENU_TEXT, { reply_markup: getMainKeyboard() });
      return;
    }
    const kb = new InlineKeyboard().text("🔐 Initialize Login", "do_login").text("📝 Register ID", "do_register");
    try { await ctx.editMessageText(`🟢 Verification အောင်မြင်ပါသည်။\n\n⚡ [ACCESS CONTROL] Network အသုံးပြုရန် Database Account လိုအပ်ပါသည်။\n\nLogin ဝင်ရောက်မည်လား? System ID အသစ် ဖန်တီးမည်လား?`, { reply_markup: kb }); } catch (e) {}
  });

  bot.callbackQuery("do_login", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    await ctx.answerCallbackQuery();
    await setState(env, userId, "waiting_email", { action: "login" });
    await ctx.editMessageText(`🔐 [LOGIN SEQUENCE INITIATED] ⚡\n\n📧 ကျေးဇူးပြု၍ သင့်၏ Email Address ကို Terminal သို့ ထည့်သွင်းပါ။ 🌐`);
  });

  bot.callbackQuery("do_register", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    await ctx.answerCallbackQuery();
    await setState(env, userId, "waiting_email", { action: "register" });
    await ctx.editMessageText(`📝 [REGISTRATION PROTOCOL INITIATED] ⚡\n\n📧 ကျေးဇူးပြု၍ မှတ်ပုံတင်ရန် Email Address ကို ထည့်သွင်းပါ။ 🌐`);
  });

  bot.on("message:text", async (ctx) => {
    const userId = ctx.from?.id;
    const text = ctx.message.text.trim();
    const name = ctx.from?.first_name || "User";
    if (!userId) return;

    if (text.startsWith("/")) return;

    const session = await getSession(env, userId);
    if (session?.userId) {
      if (text === "⚡ Daily Ping") return handleDaily(ctx, env, session);
      if (text === "💾 Extract Media") return handleShowPhotoMenu(ctx, env, session);
      if (text === "🔗 Network Invite") return handleInvite(ctx, env, session, name);
      if (text === "💻 System ID") return handleProfile(ctx, env, session);
      if (text === "🔌 Disconnect") return handleLogout(ctx, env, session);
      return;
    }

    const state = await getState(env, userId);
    if (!state) return;

    if (state.state === "waiting_email") {
      if (!text.includes("@") || text.startsWith("@")) {
        await ctx.reply("⚠️ [INVALID INPUT] Email ပုံစံ မမှန်ကန်ပါ။ ပြန်လည် ထည့်သွင်းပေးပါ။ 🌐\n\nFormat: admin@zhost.com");
        return;
      }
      await setState(env, userId, "waiting_password", { action: state.action, email: text, referrerId: state.referrerId });
      await ctx.reply(`🟢 Data လက်ခံရရှိပါသည်။\n\n🔑 [ENCRYPTION] Password ကို ထည့်သွင်းပါ။ ⚡\n\n(အနည်းဆုံး ၈ လုံး ပါဝင်ရမည်)`);
      return;
    }

    if (state.state === "waiting_password") {
      const email = state.email;
      const password = text;
      const action = state.action;
      if (password.length < 8) {
        await ctx.reply("⚠️ [SECURITY WARNING] Password သည် အနည်းဆုံး ၈ လုံး ရှိရပါမည်။ ပြန်လည် ထည့်သွင်းပေးပါ။ 🔒");
        return;
      }
      try {
        let user;
        if (action === "register") { user = await awRegister(email, password); }
        else { user = await awLogin(email, password); }

        const appwriteUserId = user.$id;
        if (!appwriteUserId) throw new Error("System ID မရရှိပါ");

        await setSession(env, userId, { userId: appwriteUserId, email: email });
        let userPoints = await awGetUserPoints(appwriteUserId);

        if (!userPoints) {
          userPoints = await awCreateUserPoints(appwriteUserId, userId, state.referrerId || "");
        }

        await clearState(env, userId);
        await ctx.reply(`🟢 [SYSTEM CONNECTED] လင့်ခ်ချိတ်ဆက်မှု အောင်မြင်ပါသည်။ ${name} ⚡\n\nDatabase သို့ ဝင်ရောက်ခွင့် ရရှိပါပြီ။\n\n${MAIN_MENU_TEXT}`, { reply_markup: getMainKeyboard() });
      } catch (e: any) {
        await ctx.reply(`🔴 [SYSTEM ERROR]:\n\n${e.message}`);
        await clearState(env, userId);
      }
      return;
    }
  });

  async function handleDaily(ctx: any, env: Env, session: any) {
    try {
      const userId = session.userId;
      let up = await awGetUserPoints(userId);
      if (!up) up = await awCreateUserPoints(userId, ctx.from.id);

      const today = new Date().toISOString().split("T")[0];
      const lastDaily = (up.last_daily || "").split("T")[0];

      if (lastDaily === today) {
        await ctx.reply(`⚠️ [REQUEST LIMIT] ဒီနေ့အတွက် Data Points ထုတ်ယူပြီးဖြစ်ပါသည်။ 🚫\n\nNext Reset: မနက်ဖြန်တွင် ပြန်လည် ကြိုးစားပါ။\n\n🔋 လက်ရှိ Energy Points: ${up.points || 0}`);
        return;
      }

      const np = (up.points || 0) + DAILY_POINTS;
      await awUpdateUserPoints(userId, { points: np, last_daily: new Date().toISOString() });

      await ctx.reply(`🟢 [DAILY PROTOCOL EXECUTED] User: ${ctx.from?.first_name || "Unknown"} ⚡\n\nDaily Bonus ရရှိပါသည်။ 🌐\n\n🔋 +${DAILY_POINTS} Points ထည့်သွင်းပြီးပါပြီ။\n💰 Total Points: ${np}`);
    } catch (e: any) {
      await ctx.reply(`🔴 [ERROR]:\n\n${e.message}`);
    }
  }

  async function handleShowPhotoMenu(ctx: any, env: Env, session: any) {
    try {
      const up = await awGetUserPoints(session.userId);
      const points = up?.points || 0;
      if (points < 1) {
        const kb = new InlineKeyboard().text("⚡ Run Daily Ping", "go_daily").text("🔗 Network Invite", "go_invite");
        await ctx.reply(`⚠️ [INSUFFICIENT ENERGY] သင့်အကောင့်တွင် Points မလုံလောက်ပါ။ 🚫\n\n🔋 Daily Ping မှ ${DAILY_POINTS} Points ရရှိနိုင်ပါသည်။\n🔋 Network Invite မှ ${INVITE_POINTS} Points ရရှိနိုင်ပါသည်။\n\nPoints စုဆောင်းရန် အောက်ပါ Command များကို အသုံးပြုပါ။ ⚡`, { reply_markup: kb });
        return;
      }
      const kb = new InlineKeyboard().text("💠 1 Point", "sp_1").text("💠💠 2 Points", "sp_2").row().text("💠💠💠 3 Points", "sp_3").text("💠💠💠💠 4 Points", "sp_4").row().text("💠💠💠💠💠 5 Points", "sp_5").row().text("⬅️ Return", "go_menu");
      await ctx.reply(`💾 [MEDIA EXTRACTOR] ⚡\n\nBackup ပြုလုပ်ထားသော Media ဖိုင်များကို ဒေါင်းလုဒ်ဆွဲရန် Data Point ပမာဏ ရွေးချယ်ပါ။ 🌐\n\n🔋 လက်ရှိ Energy Points: ${points}`, { reply_markup: kb });
    } catch (e: any) {
      await ctx.reply(`🔴 [ERROR]:\n\n${e.message}`);
    }
  }

  for (let n = 1; n <= 5; n++) {
    bot.callbackQuery(`sp_${n}`, async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;
      try { await ctx.answerCallbackQuery(); } catch (e) {}

      const session = await getSession(env, userId);
      if (!session?.userId) {
        try { await ctx.editMessageText("⚠️ [SESSION EXPIRED] Session သက်တမ်း ကုန်ဆုံးသွားပါသည်။ /start ဖြင့် ပြန်လည်ချိတ်ဆက်ပါ။ 🔄"); } catch (e) {}
        return;
      }
      const cost = n;
      const up = await awGetUserPoints(session.userId);
      const points = up?.points || 0;
      if (points < cost) {
        try { await ctx.editMessageText(`⚠️ [INSUFFICIENT ENERGY] Points မလုံလောက်ပါ။ 🚫\n\nလိုအပ်ချက်: ${cost} Points\nလက်ရှိပမာဏ: ${points} Points\n\nDaily Protocol ဖြင့် Points ပြန်လည်ဖြည့်တင်းပါ။ ⚡`); } catch (e) {}
        return;
      }

      await awUpdateUserPoints(session.userId, { points: points - cost });
      try { await ctx.editMessageText(`⚙️ [PROCESSING] Data Packets များကို ရှာဖွေနေပါသည်... 🌐`); } catch (e) {}

      const photos = await awGetPhotos(session.userId, cost);
      if (!photos || photos.length === 0) {
        await awUpdateUserPoints(session.userId, { points: points });
        try { await ctx.editMessageText(`⚠️ [404 NOT FOUND] Cloud ပေါ်တွင် Media ဖိုင်များ မရှိတော့ပါ။ 🚫\n\nApplication မှတစ်ဆင့် Backup ထပ်မံပြုလုပ်ပေးပါ။ ⚡`); } catch (e) {}
        return;
      }

      let sent = 0;
      for (const photo of photos) {
        try {
          const bytes = await awGetPhotoBytes(photo.file_id);
          if (!bytes) continue;
          await ctx.replyWithPhoto(new InputFile(bytes, "photo.jpg"));
          await awDeletePhoto(photo.$id, photo.file_id);
          sent++;
          await new Promise(r => setTimeout(r, 500));
        } catch (e: any) {
          console.log(`[sp_${n}] Photo send error: ${e.message}`);
        }
      }

      try {
        await ctx.reply(`🟢 [EXTRACTION COMPLETE] ⚡\n\nMedia ${sent} ဖိုင် ဒေါင်းလုဒ်ဆွဲခြင်း အောင်မြင်ပါသည်။ 🌐\n\n🔋 အသုံးပြုခဲ့သော Points: ${cost}\n💰 ကျန်ရှိသော Points: ${points - cost}`);
      } catch (e) {}
    });
  }

  bot.callbackQuery("go_menu", async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    try { await ctx.editMessageText(MAIN_MENU_TEXT); } catch (e) {}
  });
  bot.callbackQuery("go_daily", async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    const session = await getSession(env, ctx.from!.id);
    if (session) await handleDaily(ctx, env, session);
  });
  bot.callbackQuery("go_invite", async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    const session = await getSession(env, ctx.from!.id);
    if (session) await handleInvite(ctx, env, session, ctx.from?.first_name || "User");
  });

  async function handleInvite(ctx: any, env: Env, session: any, name: string) {
    try {
      const botInfo = await bot.api.getMe();
      const link = `https://t.me/${botInfo.username}?start=invite_${ctx.from.id}`;
      const up = await awGetUserPoints(session.userId);
      const invites = up?.total_invites || 0;
      const points = up?.points || 0;
      await ctx.reply(`🔗 [NETWORK INVITE SYSTEM] ⚡\n\nအခြား Node များကို Network သို့ ဖိတ်ခေါ်ရန် အောက်ပါ Link ကို အသုံးပြုပါ။ 🌐\n\n🔗 ${link}\n\n🔋 User တစ်ဦးချိတ်ဆက်တိုင်း +${INVITE_POINTS} Points ရရှိပါမည်။\n\n👥 ချိတ်ဆက်ပြီးသော Nodes: ${invites}\n💰 လက်ရှိ Points: ${points}`);
    } catch (e: any) { await ctx.reply(`🔴 [ERROR]:\n\n${e.message}`); }
  }

  async function handleProfile(ctx: any, env: Env, session: any) {
    try {
      const up = await awGetUserPoints(session.userId);
      const points = up?.points || 0;
      const invites = up?.total_invites || 0;
      const lastDaily = up?.last_daily ? new Date(up.last_daily).toLocaleDateString() : "No Data";
      await ctx.reply(`💻 𝗦𝘆𝘀𝘁𝗲𝗺 𝗜𝗗 𝗗𝗮𝘁𝗮 ⚡\n\n━━━━━━━━━━━━━━━━\n👨‍💻 Server Admin: @ZawMyoNaing_Official\n📧 Database Link: ${session.email}\n━━━━━━━━━━━━━━━━\n🔋 Energy Points: ${points}\n👥 Network Nodes: ${invites} users\n📅 Last Daily Sync: ${lastDaily}\n━━━━━━━━━━━━━━━━\n\n🟢 Status: Online`);
    } catch (e: any) { await ctx.reply(`🔴 [ERROR]:\n\n${e.message}`); }
  }

  async function handleLogout(ctx: any, env: Env, session: any) {
    const kb = new InlineKeyboard().text("⚠️ Confirm Disconnect", "confirm_logout").text("❌ Cancel", "cancel_logout");
    await ctx.reply(`⚠️ [WARNING] System\n\nZhost Mainframe မှ Disconnect ပြုလုပ်မည်မှာ သေချာပါသလား? 🔌`, { reply_markup: kb });
  }

  bot.callbackQuery("confirm_logout", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await clearSession(env, userId);
    try { await ctx.editMessageText(`🔌 [DISCONNECTED] ⚡\n\nSession Terminated. Server နှင့် အဆက်အသွယ် ဖြတ်တောက်လိုက်ပါပြီ။ 🌐`); } catch (e) {}
    await ctx.reply("ပြန်လည်ချိတ်ဆက်ရန် /start Command ကို အသုံးပြုပါ။ ⚡");
  });

  bot.callbackQuery("cancel_logout", async (ctx) => {
    try { await ctx.answerCallbackQuery({ text: "🟢 Action Cancelled" }); } catch (e) {}
    try { await ctx.editMessageText(MAIN_MENU_TEXT); } catch (e) {}
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response("⚡ Zhost Cyber Terminal is Online! 🌐", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
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
