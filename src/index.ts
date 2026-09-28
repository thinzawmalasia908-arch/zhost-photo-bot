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
  if (!res.ok) throw new Error(`awLogin: ${data.message || "အကောင့်ဝင်တာ အဆင်မပြေဘူးဖြစ်နေတယ်ရှင်"}`);
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
  if (!res.ok) throw new Error(`awRegister: ${data.message || "အကောင့်ဖွင့်တာ အဆင်မပြေဘူးဖြစ်နေတယ်ရှင်"}`);
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

const MAIN_MENU_TEXT = "ဟယ်လို... ဘာလေးလုပ်ပေးရမလဲရှင် 🌸 ပြောပါနော် 🥰";

function getMainKeyboard() {
  return {
    keyboard: [
      [{ text: "🎁 Daily လေးယူမယ်" }, { text: "🖼️ ဓာတ်ပုံလေးတွေကြည့်မယ်" }],
      [{ text: "💌 သူငယ်ချင်းတွေကိုဖိတ်မယ်" }, { text: "👤 Profile လေး" }],
      [{ text: "🚪 အကောင့်ထွက်မယ်နော်" }],
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
    const name = ctx.from?.first_name || "အကို";
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
      const kb = new InlineKeyboard().url("📢 Channel လေးကို Join မယ်", `https://t.me/${CHANNEL_USERNAME.replace("@", "")}`).row().text("✅ Join ပြီးပါပြီ", "check_join");
      await ctx.reply(`ဟယ်လို ${name} ရေ... 🌸\n\nမမရဲ့ 𝗭𝗵𝗼𝘀𝘁 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 Channel လေးကို Join ပြီးမှ ဒီ Bot လေးကို သုံးလို့ရမှာမို့လို့ အရင်ဆုံး Join ပေးပါဦးနော် 🥺\n\n👇 Join ပြီးရင် '✅ Join ပြီးပါပြီ' ကို နှိပ်ပေးပါရှင်`, { reply_markup: kb });
      return;
    }

    if (referrerId) await setState(env, userId, "pending_invite", { referrerId });

    const session = await getSession(env, userId);
    if (session?.userId) {
      await ctx.reply(`ပြန်လာပြီပဲ ${name} ရေ... လွမ်းနေတာ ဟီး 🌸\n\n${MAIN_MENU_TEXT}`, { reply_markup: getMainKeyboard() });
      return;
    }

    const kb = new InlineKeyboard().text("🔐 အကောင့်ဝင်မယ်", "do_login").text("📝 အကောင့်အသစ်ဖွင့်မယ်", "do_register");
    await ctx.reply(`ကဲ... ${name} ရေ၊ Bot လေးကို သုံးဖို့ App ထဲမှာဖွင့်ထားတဲ့ အကောင့်လေး အရင်လိုတယ်နော် 🌸\n\nအကောင့် ဝင်မလား? အသစ်ဖွင့်မလားရှင်?`, { reply_markup: kb });
  });

  bot.command("debug", async (ctx) => {
    const session = await getSession(env, ctx.from!.id);
    let info = `🔧 Debug အချက်အလက်လေးတွေပါ...\n\n📁 DB: ${APPWRITE_DATABASE_ID}\n📋 Table: ${APPWRITE_USER_POINTS_TABLE_ID}\n`;
    if (session?.userId) {
      info += `\n👤 User ID:\n${session.userId}\n`;
      info += `\n📧 Email: ${session.email}\n`;
      try {
        const up = await awGetUserPoints(session.userId);
        info += `\n📄 Record တွေ့လား?: ${up ? "တွေ့တယ် 🌸" : "မတွေ့ဘူး 🥺"}\n`;
        if (up) info += `💰 Points: ${up.points}\n📅 Last Sync: ${up.last_daily || "မရှိသေးဘူး"}\n`;
      } catch (e: any) {
        info += `\n🥺 Error: ${e.message}\n`;
      }
      try {
        const photos = await awGetPhotos(session.userId, 100);
        info += `\n📸 ဓာတ်ပုံ: ${photos.length} ပုံ\n`;
      } catch (e: any) {
        info += `\n🥺 Photos Error: ${e.message}\n`;
      }
    } else {
      info += `\n🥺 အကောင့်မဝင်ရသေးဘူးနော်\n`;
    }
    await ctx.reply(info);
  });

  bot.command("about", async (ctx) => {
    await ctx.reply(`🌸 အကြောင်းလေးတွေ ပြောပြမယ်နော် 🌸\n\n👩‍💼 ပိုင်ရှင်: @ZawMyoNaing_Official (မမ)\n🤖 Bot: ဓာတ်ပုံလေးတွေ သိမ်းပေးတဲ့ Bot\n📅 ဗားရှင်း: 1.0.0 (Cute Version 🥰)\n\n📢 Channel: https://t.me/${CHANNEL_USERNAME.replace("@", "")}`);
  });

  bot.callbackQuery("check_join", async (ctx) => {
    const userId = ctx.from?.id;
    const name = ctx.from?.first_name || "အကို";
    if (!userId) return;
    let isJoined = false;
    try { const m = await ctx.api.getChatMember(CHANNEL_ID, userId); isJoined = ["creator", "administrator", "member", "restricted"].includes(m.status); } catch (e) {}
    if (!isJoined) { await ctx.answerCallbackQuery({ text: "အာ... Channel ကို မ Join ရသေးဘူးနော် 🥺 အရင် Join ပေးပါဦးရှင်", show_alert: true }); return; }
    await ctx.answerCallbackQuery({ text: "ကျေးဇူးပါနော်... Join ပြီးသွားပြီ 🥰" });
    const session = await getSession(env, userId);
    if (session?.userId) {
      try { await ctx.editMessageText(`ပြန်လာပြီပဲ ${name} ရေ... 🌸\n\n${MAIN_MENU_TEXT}`); } catch (e) {}
      await ctx.reply(MAIN_MENU_TEXT, { reply_markup: getMainKeyboard() });
      return;
    }
    const kb = new InlineKeyboard().text("🔐 အကောင့်ဝင်မယ်", "do_login").text("📝 အကောင့်အသစ်ဖွင့်မယ်", "do_register");
    try { await ctx.editMessageText(`Channel လေးကို Join ပေးလို့ ကျေးဇူးပါ ${name} ရေ 🥰\n\nကဲ... အကောင့် ဝင်မလား? အသစ်ဖွင့်မလားရှင်?`, { reply_markup: kb }); } catch (e) {}
  });

  bot.callbackQuery("do_login", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    await ctx.answerCallbackQuery();
    await setState(env, userId, "waiting_email", { action: "login" });
    await ctx.editMessageText(`အိုကေ အကောင့်ဝင်မယ်နော် 🔐\n\n📧 Gmail လေး အရင်ပို့ပေးပါဦးရှင် 🌸`);
  });

  bot.callbackQuery("do_register", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    await ctx.answerCallbackQuery();
    await setState(env, userId, "waiting_email", { action: "register" });
    await ctx.editMessageText(`အကောင့်အသစ် ဖွင့်မယ်နော် 📝\n\n📧 မှတ်ပုံတင်ဖို့ Gmail လေး အရင်ပို့ပေးပါရှင် 🌸`);
  });

  bot.on("message:text", async (ctx) => {
    const userId = ctx.from?.id;
    const text = ctx.message.text.trim();
    const name = ctx.from?.first_name || "အကို";
    if (!userId) return;

    if (text.startsWith("/")) return;

    const session = await getSession(env, userId);
    if (session?.userId) {
      if (text === "🎁 Daily လေးယူမယ်") return handleDaily(ctx, env, session);
      if (text === "🖼️ ဓာတ်ပုံလေးတွေကြည့်မယ်") return handleShowPhotoMenu(ctx, env, session);
      if (text === "💌 သူငယ်ချင်းတွေကိုဖိတ်မယ်") return handleInvite(ctx, env, session, name);
      if (text === "👤 Profile လေး") return handleProfile(ctx, env, session);
      if (text === "🚪 အကောင့်ထွက်မယ်နော်") return handleLogout(ctx, env, session);
      return;
    }

    const state = await getState(env, userId);
    if (!state) return;

    if (state.state === "waiting_email") {
      if (!text.includes("@") || text.startsWith("@")) {
        await ctx.reply("အာ... Gmail ပုံစံလေးက မမှန်ဘူးဖြစ်နေတယ် 🥺 ပြန်ပို့ပေးပါဦးနော်\n(ဥပမာ - admin@gmail.com)");
        return;
      }
      await setState(env, userId, "waiting_password", { action: state.action, email: text, referrerId: state.referrerId });
      await ctx.reply(`ရပြီရှင်... 🌸\n\n🔑 အခု Password လေး ထပ်ပို့ပေးပါဦးနော်\n(အနည်းဆုံး ၈ လုံးတော့ ရှိရမယ်နော် 🥺)`);
      return;
    }

    if (state.state === "waiting_password") {
      const email = state.email;
      const password = text;
      const action = state.action;
      if (password.length < 8) {
        await ctx.reply("ဟင့်... Password က ၈ လုံးမပြည့်ဘူးဖြစ်နေတယ် 🥺 ပြန်ပို့ပေးပါဦးနော် 🔒");
        return;
      }
      try {
        let user;
        if (action === "register") { user = await awRegister(email, password); }
        else { user = await awLogin(email, password); }

        const appwriteUserId = user.$id;
        if (!appwriteUserId) throw new Error("အကောင့် ID ယူလို့မရဘူးဖြစ်နေတယ်");

        await setSession(env, userId, { userId: appwriteUserId, email: email });
        let userPoints = await awGetUserPoints(appwriteUserId);

        if (!userPoints) {
          userPoints = await awCreateUserPoints(appwriteUserId, userId, state.referrerId || "");
        }

        await clearState(env, userId);
        await ctx.reply(`ယေး... အောင်မြင်သွားပြီ ${name} ရေ 🌸\n\nအခုပဲ စသုံးလို့ရပါပြီနော် 🥰\n\n${MAIN_MENU_TEXT}`, { reply_markup: getMainKeyboard() });
      } catch (e: any) {
        await ctx.reply(`အာ... အဆင်မပြေဘူးဖြစ်နေတယ် 🥺\n\n${e.message}`);
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
        await ctx.reply(`ဟယ်... ဒီနေ့အတွက် ယူပြီးသွားပြီလေ 🥺\n\nမနက်ဖြန်မှ ပြန်လာယူလှည့်ပါဦးနော် 🌸\n\n🎁 လက်ရှိ Points လေးကတော့: ${up.points || 0} ပါရှင်`);
        return;
      }

      const np = (up.points || 0) + DAILY_POINTS;
      await awUpdateUserPoints(userId, { points: np, last_daily: new Date().toISOString() });

      await ctx.reply(`ကဲ... ဒီနေ့အတွက် လက်ဆောင်လေး ရပြီနော် 🎁\n\n🎁 +${DAILY_POINTS} Points တောင် ရသွားတယ် 🌸\n💰 စုစုပေါင်း: ${np} Points ရှိသွားပြီနော် 🥰`);
    } catch (e: any) {
      await ctx.reply(`အာ... Error တက်နေတယ် 🥺\n\n${e.message}`);
    }
  }

  async function handleShowPhotoMenu(ctx: any, env: Env, session: any) {
    try {
      const up = await awGetUserPoints(session.userId);
      const points = up?.points || 0;
      if (points < 1) {
        const kb = new InlineKeyboard().text("🎁 Daily လေးယူမယ်", "go_daily").text("💌 သူငယ်ချင်းဖိတ်မယ်", "go_invite");
        await ctx.reply(`အာ... အမှတ်လေးတွေ မလုံလောက်သေးဘူးဖြစ်နေတယ် 🥺\n\n🎁 Daily ယူရင် ${DAILY_POINTS} Points ရမယ်နော်\n💌 သူငယ်ချင်းတွေကို ဖိတ်ရင်လည်း တစ်ယောက်ကို ${INVITE_POINTS} Points ရမယ်ရှင်\n\nPoints လေးတွေ အရင်စုလိုက်ဦးနော် 🌸`, { reply_markup: kb });
        return;
      }
      const kb = new InlineKeyboard().text("🌸 1 Point", "sp_1").text("🌸🌸 2 Points", "sp_2").row().text("🌸🌸🌸 3 Points", "sp_3").text("🌸🌸🌸🌸 4 Points", "sp_4").row().text("🌸🌸🌸🌸🌸 5 Points", "sp_5").row().text("⬅️ နောက်ဆုတ်မယ်", "go_menu");
      await ctx.reply(`ဘယ်နှပုံ ကြည့်ချင်တာလဲ ပြော... 🌸\n\nတစ်ပုံကို 1 Point ကျမယ်နော် 🖼️\n\n💰 လက်ရှိ Points: ${points}`, { reply_markup: kb });
    } catch (e: any) {
      await ctx.reply(`အာ... Error တက်နေတယ် 🥺\n\n${e.message}`);
    }
  }

  for (let n = 1; n <= 5; n++) {
    bot.callbackQuery(`sp_${n}`, async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;
      try { await ctx.answerCallbackQuery(); } catch (e) {}

      const session = await getSession(env, userId);
      if (!session?.userId) {
        try { await ctx.editMessageText("Session ကုန်သွားပြီ 🥺 /start ပြန်ရိုက်ပြီး ပြန်ဝင်ပေးပါဦးနော် 🌸"); } catch (e) {}
        return;
      }
      const cost = n;
      const up = await awGetUserPoints(session.userId);
      const points = up?.points || 0;
      if (points < cost) {
        try { await ctx.editMessageText(`Points မလုံလောက်ဘူးဖြစ်နေတယ် 🥺\n\nလိုတာက: ${cost} Points\nရှိတာက: ${points} Points\n\nDaily လေး အရင်ယူလိုက်ပါလားဟင် 🌸`); } catch (e) {}
        return;
      }

      await awUpdateUserPoints(session.userId, { points: points - cost });
      try { await ctx.editMessageText(`ခဏလေးစောင့်ပေးနော်... ရှာပေးနေတယ် 🌸`); } catch (e) {}

      const photos = await awGetPhotos(session.userId, cost);
      if (!photos || photos.length === 0) {
        await awUpdateUserPoints(session.userId, { points: points });
        try { await ctx.editMessageText(`ဟင့်... Cloud ပေါ်မှာ ဓာတ်ပုံလေးတွေ မရှိတော့ဘူး 🥺 App ထဲကနေ ပြန် Backup လုပ်ပေးပါဦးနော် 🌸`); } catch (e) {}
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
        await ctx.reply(`ရပြီရှင်... ဓာတ်ပုံ ${sent} ပုံ ရောက်လာပြီနော် 🖼️🌸\n\nကုန်သွားတဲ့ Points: ${cost}\nလက်ကျန် Points: ${points - cost}`);
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
    if (session) await handleInvite(ctx, env, session, ctx.from?.first_name || "အကို");
  });

  async function handleInvite(ctx: any, env: Env, session: any, name: string) {
    try {
      const botInfo = await bot.api.getMe();
      const link = `https://t.me/${botInfo.username}?start=invite_${ctx.from.id}`;
      const up = await awGetUserPoints(session.userId);
      const invites = up?.total_invites || 0;
      const points = up?.points || 0;
      await ctx.reply(`သူငယ်ချင်းတွေကို ဖိတ်ချင်တာလားရှင် 🌸\n\n👇 အောက်က Link လေးကို Copy ကူးပြီး ပို့ပေးလိုက်ပါနော်\n\n🔗 ${link}\n\nသူငယ်ချင်း တစ်ယောက်ဝင်လာတိုင်း +${INVITE_POINTS} Points ရမှာနော် 🥰\n\n💌 ခေါ်ထားတဲ့သူငယ်ချင်း: ${invites} ယောက်\n💰 လက်ရှိ Points: ${points}`);
    } catch (e: any) { await ctx.reply(`အာ... Error တက်နေတယ် 🥺\n\n${e.message}`); }
  }

  async function handleProfile(ctx: any, env: Env, session: any) {
    try {
      const up = await awGetUserPoints(session.userId);
      const points = up?.points || 0;
      const invites = up?.total_invites || 0;
      const lastDaily = up?.last_daily ? new Date(up.last_daily).toLocaleDateString() : "မယူရသေးပါ";
      const name = ctx.from?.first_name || "အကို";
      await ctx.reply(`🌸 ${name} ရဲ့ Profile လေးပါ 🌸\n\n━━━━━━━━━━━━━━━━\n📧 အကောင့်: ${session.email}\n━━━━━━━━━━━━━━━━\n💰 လက်ရှိ Points: ${points}\n💌 ဖိတ်ထားတဲ့သူ: ${invites} ယောက်\n🎁 နောက်ဆုံး Daily ယူခဲ့တာ: ${lastDaily}\n━━━━━━━━━━━━━━━━\n\nမိုက်တယ်နော် 🥰`);
    } catch (e: any) { await ctx.reply(`အာ... Error တက်နေတယ် 🥺\n\n${e.message}`); }
  }

  async function handleLogout(ctx: any, env: Env, session: any) {
    const kb = new InlineKeyboard().text("✅ ဟုတ် ထွက်မယ်", "confirm_logout").text("❌ မထွက်တော့ဘူး", "cancel_logout");
    await ctx.reply(`တကယ်ပဲ အကောင့်ထွက်တော့မှာလားဟင် 🥺 🚪`, { reply_markup: kb });
  }

  bot.callbackQuery("confirm_logout", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await clearSession(env, userId);
    try { await ctx.editMessageText(`အကောင့်ထွက်သွားပါပြီရှင် 🌸 ပြန်လာခဲ့ဖို့ စောင့်နေမယ်နော် 🥺`); } catch (e) {}
    await ctx.reply("ပြန်ဝင်ချင်ရင် /start လေး ပြန်နှိပ်ပေးပါနော် 🥰");
  });

  bot.callbackQuery("cancel_logout", async (ctx) => {
    try { await ctx.answerCallbackQuery({ text: "ဟီး... မထွက်တော့ဘူးမလား 🥰" }); } catch (e) {}
    try { await ctx.editMessageText(MAIN_MENU_TEXT); } catch (e) {}
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response("🌸 Zhost Photo Bot လေး အလုပ်လုပ်နေပါတယ်ရှင် 💕", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
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
