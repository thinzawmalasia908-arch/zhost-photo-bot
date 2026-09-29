import { Bot, webhookCallback, InlineKeyboard, InputFile } from "grammy";

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6ab8a17c0009e545239a";
const DATABASE_ID = "6ab8a2dd002493abffc1";
const PHOTO_TABLE_ID = "6ab8a3170023949dc624";
const USER_TABLE_ID = "user_points";
const BUCKET_ID = "6ab8a9a20014b126f169";

const CHANNEL_ID = "@ZhostTech";
const CHANNEL_USERNAME = "@ZhostTech";
const DAILY_POINTS = 3;
const INVITE_POINTS = 5;

export interface Env {
  BOT_TOKEN: string;
  APPWRITE_API_KEY: string;
  BOT_SESSIONS: KVNamespace;
  [key: string]: any;
}

// ==================== Appwrite REST Helpers ====================

function awHeaders(env: Env, withBody = false): Headers {
  const h = new Headers();
  h.set("X-Appwrite-Project", APPWRITE_PROJECT_ID);
  h.set("X-Appwrite-Key", env.APPWRITE_API_KEY);
  if (withBody) h.set("Content-Type", "application/json");
  return h;
}

async function awFetch(env: Env, method: string, path: string, body?: any): Promise<any> {
  const res = await fetch(`${APPWRITE_ENDPOINT}${path}`, {
    method,
    headers: awHeaders(env, !!body),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

// ============ Appwrite Auth ============

async function awLogin(email: string, password: string): Promise<{ id: string }> {
  const res = await fetch(`${APPWRITE_ENDPOINT}/account/sessions/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": APPWRITE_PROJECT_ID,
    },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error("Login failed"); }
  if (!res.ok) {
    throw new Error("Gmail (သို့) Password မှားနေတယ်ရှင် 🥺");
  }
  return { id: data.userId };
}

async function awRegister(email: string, password: string): Promise<{ id: string }> {
  const res = await fetch(`${APPWRITE_ENDPOINT}/account`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": APPWRITE_PROJECT_ID,
    },
    body: JSON.stringify({
      userId: "unique()",
      email,
      password,
      name: email.split("@")[0],
    }),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error("Register failed"); }
  if (!res.ok) {
    const msg = data.message || "အကောင့်ဖွင့်တာ အဆင်မပြေဘူးရှင်";
    if (String(msg).toLowerCase().includes("already")) {
      throw new Error("ဒီ Gmail နဲ့ အကောင့်ရှိပြီးသားပါ 🥺 Login ဝင်ကြည့်ပါ");
    }
    throw new Error(msg);
  }
  return { id: data.$id };
}

// ============ User Points ============

async function awGetUserPoints(env: Env, userId: string): Promise<any | null> {
  try {
    const res = await awFetch(
      env,
      "GET",
      `/databases/${DATABASE_ID}/collections/${USER_TABLE_ID}/documents/${encodeURIComponent(userId)}`
    );
    if (res?.$id) return res;
    return null;
  } catch { return null; }
}

async function awCreateUserPoints(env: Env, userId: string, chatId: number, invitedBy = ""): Promise<any> {
  try {
    return await awFetch(env, "POST", `/databases/${DATABASE_ID}/collections/${USER_TABLE_ID}/documents`, {
      documentId: userId,
      data: {
        user_id: userId,
        telegram_chat_id: String(chatId),
        points: 0,
        last_daily: "",
        total_invites: 0,
        invited_by: invitedBy,
      },
    });
  } catch (e) {
    console.log("awCreateUserPoints error", e);
    return null;
  }
}

async function awUpdateUserPoints(env: Env, docId: string, updates: any): Promise<any> {
  return await awFetch(
    env,
    "PATCH",
    `/databases/${DATABASE_ID}/collections/${USER_TABLE_ID}/documents/${encodeURIComponent(docId)}`,
    { data: updates }
  );
}

// ============ Photos ============

async function awGetPhotos(env: Env, userId: string, limit: number): Promise<any[]> {
  try {
    const res = await awFetch(
      env,
      "GET",
      `/databases/${DATABASE_ID}/collections/${PHOTO_TABLE_ID}/documents?limit=500`
    );
    const all = res?.documents || [];
    const mine = all.filter((d: any) => d.user_id === userId);
    return mine.slice(0, limit);
  } catch { return []; }
}

async function awDeletePhoto(env: Env, docId: string, fileId: string): Promise<void> {
  try {
    await awFetch(env, "DELETE", `/databases/${DATABASE_ID}/collections/${PHOTO_TABLE_ID}/documents/${docId}`);
  } catch {}
  try {
    await awFetch(env, "DELETE", `/storage/buckets/${BUCKET_ID}/files/${fileId}`);
  } catch {}
}

async function awGetPhotoBytes(env: Env, fileId: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`${APPWRITE_ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${fileId}/view`, {
      headers: awHeaders(env),
    });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch { return null; }
}

// ==================== KV Session ====================

const setSession = async (env: Env, id: number, d: any) => { try { await env.BOT_SESSIONS.put(`s:${id}`, JSON.stringify(d), { expirationTtl: 86400 * 30 }); } catch {} };
const getSession = async (env: Env, id: number): Promise<any | null> => { try { const v = await env.BOT_SESSIONS.get(`s:${id}`); return v ? JSON.parse(v) : null; } catch { return null; } };
const clearSession = async (env: Env, id: number) => { try { await env.BOT_SESSIONS.delete(`s:${id}`); } catch {} };
const setState = async (env: Env, id: number, s: string, e: any = {}) => { try { await env.BOT_SESSIONS.put(`st:${id}`, JSON.stringify({ state: s, ...e }), { expirationTtl: 600 }); } catch {} };
const getState = async (env: Env, id: number): Promise<any | null> => { try { const v = await env.BOT_SESSIONS.get(`st:${id}`); return v ? JSON.parse(v) : null; } catch { return null; } };
const clearState = async (env: Env, id: number) => { try { await env.BOT_SESSIONS.delete(`st:${id}`); } catch {} };
const setRef = async (env: Env, id: number, ref: string) => { try { await env.BOT_SESSIONS.put(`r:${id}`, ref, { expirationTtl: 3600 }); } catch {} };
const getRef = async (env: Env, id: number): Promise<string> => { try { return (await env.BOT_SESSIONS.get(`r:${id}`)) || ""; } catch { return ""; } };
const clearRef = async (env: Env, id: number) => { try { await env.BOT_SESSIONS.delete(`r:${id}`); } catch {} };

// ==================== UI ====================

const BTN_DAILY = "🎁 Daily ယူမယ်";
const BTN_SHOW = "🖼️ Point နဲ့ ဓာတ်ပုံလဲမယ်";
const BTN_INVITE = "💌 သူငယ်ချင်းဖိတ်မယ်";
const BTN_PROFILE = "👤 Profile လေး";
const BTN_LOGOUT = "🚪 အကောင့်ထွက်မယ်";

const MAIN_MENU = "ဟယ်လို... ဘာလေးလုပ်ပေးရမလဲရှင် 🌸 ပြောပါနော် 🥰";

function mainKeyboard() {
  return {
    keyboard: [
      [{ text: BTN_DAILY }, { text: BTN_SHOW }],
      [{ text: BTN_INVITE }, { text: BTN_PROFILE }],
      [{ text: BTN_LOGOUT }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

let botInstance: Bot | null = null;
function getBot(env: Env): Bot {
  if (botInstance) return botInstance;
  botInstance = new Bot(env.BOT_TOKEN || "");
  setupBot(botInstance, env);
  return botInstance;
}

// ==================== Bot Logic ====================

function setupBot(bot: Bot, env: Env) {

  bot.command("start", async (ctx) => {
    const uid = ctx.from?.id;
    const name = ctx.from?.first_name || "အကို";
    if (!uid) return;

    const payload = (ctx.match || "").trim();
    let ref = "";
    if (payload.startsWith("invite_")) ref = payload.replace("invite_", "");

    let joined = false;
    try {
      const m = await ctx.api.getChatMember(CHANNEL_ID, uid);
      joined = ["creator", "administrator", "member", "restricted"].includes(m.status);
    } catch { joined = true; }

    if (!joined) {
      const kb = new InlineKeyboard()
        .url("📢 Channel လေးကို Join မယ်", `https://t.me/${CHANNEL_USERNAME.replace("@", "")}`)
        .row().text("✅ Join ပြီးပါပြီ", "check_join");
      await ctx.reply(
        `ဟယ်လို ${name} ရေ... 🌸\n\nမမရဲ့ 𝗭𝗵𝗼𝘀𝘁 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝘆 Channel လေးကို Join ပြီးမှ ဒီ Bot လေးကို သုံးလို့ရမှာမို့ အရင်ဆုံး Join ပေးပါဦးနော် 🥺\n\n👇 Join ပြီးရင် '✅ Join ပြီးပါပြီ' ကို နှိပ်ပေးပါရှင်`,
        { reply_markup: kb }
      );
      if (ref) await setRef(env, uid, ref);
      return;
    }

    if (ref) await setRef(env, uid, ref);

    const sess = await getSession(env, uid);
    if (sess?.userId) {
      await ctx.reply(`ပြန်လာပြီပဲ ${name} ရေ... လွမ်းနေတာ ဟီး 🌸\n\n${MAIN_MENU}`, { reply_markup: mainKeyboard() });
      return;
    }

    const kb = new InlineKeyboard()
      .text("🔐 အကောင့်ဝင်မယ်", "do_login")
      .text("📝 အသစ်ဖွင့်မယ်", "do_register");
    await ctx.reply(
      `ကဲ... ${name} ရေ၊ Bot လေးကို သုံးဖို့ App ထဲမှာ ဖွင့်ထားတဲ့ အကောင့်လေး အရင်လိုတယ်နော် 🌸\n\nအကောင့် ဝင်မလား? အသစ်ဖွင့်မလားရှင်?`,
      { reply_markup: kb }
    );
  });

  bot.callbackQuery("check_join", async (ctx) => {
    const uid = ctx.from?.id;
    const name = ctx.from?.first_name || "အကို";
    if (!uid) return;
    let joined = false;
    try {
      const m = await ctx.api.getChatMember(CHANNEL_ID, uid);
      joined = ["creator", "administrator", "member", "restricted"].includes(m.status);
    } catch {}
    if (!joined) {
      await ctx.answerCallbackQuery({ text: "အာ... Channel ကို Join ရသေးဘူးနော် 🥺", show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery({ text: "ကျေးဇူးပါနော် 🥰" });
    const sess = await getSession(env, uid);
    if (sess?.userId) {
      try { await ctx.editMessageText(`ပြန်လာပြီပဲ ${name} ရေ... 🌸`); } catch {}
      await ctx.reply(MAIN_MENU, { reply_markup: mainKeyboard() });
      return;
    }
    const kb = new InlineKeyboard().text("🔐 အကောင့်ဝင်မယ်", "do_login").text("📝 အကောင့်အသစ်ဖွင့်မယ်", "do_register");
    try {
      await ctx.editMessageText(`Channel လေးကို Join ပေးလို့ ကျေးဇူးပါ ${name} ရေ 🥰\n\nအကောင့် ဝင်မလား? အသစ်ဖွင့်မလားရှင်?`, { reply_markup: kb });
    } catch {}
  });

  bot.callbackQuery("do_login", async (ctx) => {
    const uid = ctx.from?.id; if (!uid) return;
    await ctx.answerCallbackQuery();
    const ref = await getRef(env, uid);
    await setState(env, uid, "waiting_email", { action: "login", ref });
    await ctx.editMessageText(`အိုကေ အကောင့်ဝင်မယ်နော် 🔐\n\n📧 Gmail လေး အရင်ပို့ပေးပါဦးရှင် 🌸`);
  });

  bot.callbackQuery("do_register", async (ctx) => {
    const uid = ctx.from?.id; if (!uid) return;
    await ctx.answerCallbackQuery();
    const ref = await getRef(env, uid);
    await setState(env, uid, "waiting_email", { action: "register", ref });
    await ctx.editMessageText(`အကောင့်အသစ် ဖွင့်မယ်နော် 📝\n\n📧 မှတ်ပုံတင်ဖို့ Gmail လေး အရင်ပို့ပေးပါရှင် 🌸`);
  });

  bot.on("message:text", async (ctx) => {
    const uid = ctx.from?.id;
    const text = ctx.message.text.trim();
    const name = ctx.from?.first_name || "အကို";
    if (!uid || text.startsWith("/")) return;

    const sess = await getSession(env, uid);
    if (sess?.userId) {
      if (text === BTN_DAILY) return handleDaily(ctx, env, sess);
      if (text === BTN_SHOW) return handleShowMenu(ctx, env, sess);
      if (text === BTN_INVITE) return handleInvite(ctx, env, sess, name);
      if (text === BTN_PROFILE) return handleProfile(ctx, env, sess);
      if (text === BTN_LOGOUT) return handleLogout(ctx, env, sess);
      return;
    }

    const state = await getState(env, uid);
    if (!state) return;

    if (state.state === "waiting_email") {
      if (!text.includes("@") || text.startsWith("@")) {
        await ctx.reply("အာ... Gmail ပုံစံ မမှန်ဘူးဖြစ်နေတယ် 🥺 ပြန်ပို့ပါ");
        return;
      }
      await setState(env, uid, "waiting_password", { action: state.action, email: text, ref: state.ref || "" });
      await ctx.reply(`ရပြီရှင်... 🌸\n\n🔑 အခု Password လေး ထပ်ပို့ပေးပါဦးနော်\n(အနည်းဆုံး ၈ လုံး ရှိရမယ်နော် 🥺)`);
      return;
    }

    if (state.state === "waiting_password") {
      const email = state.email;
      const password = text;
      const action = state.action;
      const ref = state.ref || "";
      if (password.length < 8) {
        await ctx.reply("ဟင့်... Password က ၈ လုံးမပြည့်ဘူးဖြစ်နေတယ် 🥺 ပြန်ပို့ပါ 🔒");
        return;
      }
      try {
        let user;
        if (action === "register") user = await awRegister(email, password);
        else user = await awLogin(email, password);

        await setSession(env, uid, { userId: user.id, email });

        let up = await awGetUserPoints(env, user.id);
        if (!up) {
          up = await awCreateUserPoints(env, user.id, uid, ref);
          if (ref) {
            try {
              const refTgId = parseInt(ref);
              const refSess = await getSession(env, refTgId);
              if (refSess?.userId) {
                const refUp = await awGetUserPoints(env, refSess.userId);
                if (refUp) {
                  await awUpdateUserPoints(env, refUp.$id, {
                    points: (refUp.points || 0) + INVITE_POINTS,
                    total_invites: (refUp.total_invites || 0) + 1,
                  });
                }
              }
            } catch (e) { console.log("Invite bonus error", e); }
          }
        }

        await clearRef(env, uid);
        await clearState(env, uid);
        await ctx.reply(`ယေး... အောင်မြင်သွားပြီ ${name} ရေ 🌸\n\nအခုပဲ စသုံးလို့ရပါပြီနော် 🥰\n\n${MAIN_MENU}`, { reply_markup: mainKeyboard() });
      } catch (e: any) {
        await ctx.reply(`အာ... အဆင်မပြေဘူးဖြစ်နေတယ် 🥺\n\n${e.message}`);
        await clearState(env, uid);
      }
    }
  });

  async function handleDaily(ctx: any, env: Env, sess: any) {
    try {
      let up = await awGetUserPoints(env, sess.userId);
      if (!up) up = await awCreateUserPoints(env, sess.userId, ctx.from.id);

      const today = new Date().toISOString().split("T")[0];
      const last = (up?.last_daily || "").split("T")[0];
      if (last === today) {
        await ctx.reply(`ဟယ်... ဒီနေ့အတွက် ယူပြီးသွားပြီလေ 🥺\n\nမနက်ဖြန်မှ ပြန်လာယူလှည့်ပါဦးနော် 🌸\n\n🎁 လက်ရှိ Points: ${up?.points || 0}`);
        return;
      }
      const np = (up?.points || 0) + DAILY_POINTS;
      await awUpdateUserPoints(env, up.$id, { points: np, last_daily: new Date().toISOString() });
      await ctx.reply(`ကဲ... ဒီနေ့အတွက် လက်ဆောင်လေး ရပြီနော် 🎁\n\n🎁 +${DAILY_POINTS} Points ရသွားတယ် 🌸\n💰 စုစုပေါင်း: ${np} Points 🥰`);
    } catch (e: any) {
      await ctx.reply(`အာ... Error 🥺\n\n${e.message}`);
    }
  }

  async function handleShowMenu(ctx: any, env: Env, sess: any) {
    try {
      const up = await awGetUserPoints(env, sess.userId);
      const points = up?.points || 0;
      if (points < 1) {
        const kb = new InlineKeyboard().text("🎁 Daily ယူမယ်", "go_daily").text("💌 ဖိတ်မယ်", "go_invite");
        await ctx.reply(`အာ... Points မလုံလောက်သေးဘူး 🥺\n\n🎁 Daily = ${DAILY_POINTS}\n💌 Invite = ${INVITE_POINTS}\n\nPoints စုပါ 🌸`, { reply_markup: kb });
        return;
      }
      const kb = new InlineKeyboard()
        .text("🌸 1 Point", "sp_1").text("🌸🌸 2 Points", "sp_2").row()
        .text("🌸🌸🌸 3 Points", "sp_3").text("🌸🌸🌸🌸 4 Points", "sp_4").row()
        .text("🌸🌸🌸🌸🌸 5 Points", "sp_5").row()
        .text("⬅️ နောက်ဆုတ်မယ်", "go_menu");
      await ctx.reply(`ဘယ်နှပုံ ကြည့်ချင်တာလဲ 🌸\n\n1 ပုံ = 1 Point 🖼️\n\n💰 Points: ${points}`, { reply_markup: kb });
    } catch (e: any) { await ctx.reply(`Error 🥺 ${e.message}`); }
  }

  for (let n = 1; n <= 5; n++) {
    bot.callbackQuery(`sp_${n}`, async (ctx) => {
      const uid = ctx.from?.id; if (!uid) return;
      try { await ctx.answerCallbackQuery(); } catch {}

      const sess = await getSession(env, uid);
      if (!sess?.userId) {
        try { await ctx.editMessageText("Session ကုန်ပြီ 🥺 /start ပြန်နှိပ်ပါ"); } catch {}
        return;
      }
      const cost = n;
      const up = await awGetUserPoints(env, sess.userId);
      const points = up?.points || 0;
      if (points < cost) {
        try { await ctx.editMessageText(`Points မလုံလောက်ဘူး 🥺\nလိုတာ: ${cost}\nရှိတာ: ${points}`); } catch {}
        return;
      }

      await awUpdateUserPoints(env, up.$id, { points: points - cost });
      try { await ctx.editMessageText("ခဏလေး... ရှာပေးနေတယ် 🌸"); } catch {}

      const photos = await awGetPhotos(env, sess.userId, cost);
      if (!photos || photos.length === 0) {
        await awUpdateUserPoints(env, up.$id, { points });
        try { await ctx.editMessageText("ဟင့်... Cloud မှာ ပုံ မရှိတော့ဘူး 🥺 App ကနေ ပြန် Backup လုပ်ပါ 🌸"); } catch {}
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
          await new Promise(r => setTimeout(r, 500));
        } catch (e: any) { console.log("photo err", e.message); }
      }

      try {
        await ctx.reply(`ရပြီရှင်... ပုံ ${sent} ပုံ ရောက်ပြီနော် 🖼️🌸\n\nကုန်: ${sent}\nကျန်: ${points - sent}`);
      } catch {}
    });
  }

  bot.callbackQuery("go_menu", async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch {}
    try { await ctx.editMessageText(MAIN_MENU); } catch {}
  });
  bot.callbackQuery("go_daily", async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch {}
    const sess = await getSession(env, ctx.from!.id);
    if (sess) await handleDaily(ctx, env, sess);
  });
  bot.callbackQuery("go_invite", async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch {}
    const sess = await getSession(env, ctx.from!.id);
    if (sess) await handleInvite(ctx, env, sess, ctx.from?.first_name || "အကို");
  });

  async function handleInvite(ctx: any, env: Env, sess: any, name: string) {
    try {
      const info = await bot.api.getMe();
      const link = `https://t.me/${info.username}?start=invite_${ctx.from.id}`;
      const up = await awGetUserPoints(env, sess.userId);
      const invites = up?.total_invites || 0;
      const points = up?.points || 0;
      await ctx.reply(`သူငယ်ချင်းတွေကို ဖိတ်ချင်တာလားရှင် 🌸\n\n👇 Link လေးကို Copy ကူးပြီး ပို့ပါ\n\n🔗 ${link}\n\nတစ်ယောက်ဝင်တိုင်း +${INVITE_POINTS} Points 🥰\n\n💌 ခေါ်ထားတဲ့သူ: ${invites} ယောက်\n💰 Points: ${points}`);
    } catch (e: any) { await ctx.reply(`Error 🥺 ${e.message}`); }
  }

  async function handleProfile(ctx: any, env: Env, sess: any) {
    try {
      const up = await awGetUserPoints(env, sess.userId);
      const points = up?.points || 0;
      const invites = up?.total_invites || 0;
      const lastDaily = up?.last_daily ? new Date(up.last_daily).toLocaleDateString() : "မယူရသေးပါ";
      const name = ctx.from?.first_name || "အကို";
      await ctx.reply(`🌸 ${name} ရဲ့ Profile 🌸\n\n━━━━━━━━━━━━━━━━\n📧 အကောင့်: ${sess.email}\n━━━━━━━━━━━━━━━━\n💰 Points: ${points}\n💌 ဖိတ်ထားတဲ့သူ: ${invites} ယောက်\n🎁 Daily နောက်ဆုံး: ${lastDaily}\n━━━━━━━━━━━━━━━━\n\nမိုက်တယ်နော် 🥰`);
    } catch (e: any) { await ctx.reply(`Error 🥺 ${e.message}`); }
  }

  async function handleLogout(ctx: any, env: Env, sess: any) {
    const kb = new InlineKeyboard().text("✅ ဟုတ် ထွက်မယ်", "confirm_logout").text("❌ မထွက်တော့ဘူး", "cancel_logout");
    await ctx.reply(`တကယ်ပဲ အကောင့်ထွက်တော့မှာလားဟင် 🥺 🚪`, { reply_markup: kb });
  }

  bot.callbackQuery("confirm_logout", async (ctx) => {
    const uid = ctx.from?.id; if (!uid) return;
    try { await ctx.answerCallbackQuery(); } catch {}
    await clearSession(env, uid);
    try { await ctx.editMessageText(`အကောင့်ထွက်သွားပါပြီရှင် 🌸 ပြန်လာခဲ့ဖို့ စောင့်နေမယ်နော် 🥺`); } catch {}
    await ctx.reply("ပြန်ဝင်ချင်ရင် /start လေး ပြန်နှိပ်ပေးပါနော် 🥰");
  });

  bot.callbackQuery("cancel_logout", async (ctx) => {
    try { await ctx.answerCallbackQuery({ text: "ဟီး... မထွက်တော့ဘူးမလား 🥰" }); } catch {}
    try { await ctx.editMessageText(MAIN_MENU); } catch {}
  });
}

// ==================== FETCH HANDLER ====================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("Zhost Photo Bot (Appwrite) OK", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // ✅ CLEANUP TOOL
    if (url.pathname === "/cleanup") {
      return new Response(CLEANUP_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
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

// ==================== CLEANUP HTML ====================

const CLEANUP_HTML = `<!DOCTYPE html>
<html lang="my">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Zhost Cleanup</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;padding:20px}
.c{background:#fff;border-radius:20px;padding:25px;max-width:500px;margin:0 auto;box-shadow:0 20px 60px rgba(0,0,0,.3)}
h1{font-size:20px;color:#333;text-align:center;margin-bottom:6px}
.s{font-size:12px;color:#888;text-align:center;margin-bottom:20px}
.w{background:#fff3cd;border-left:4px solid #ffc107;padding:12px;border-radius:8px;font-size:13px;color:#856404;margin-bottom:18px;line-height:1.6}
.i{background:#e3f2fd;padding:10px;border-radius:8px;font-size:11px;color:#0d47a1;font-family:monospace;margin-bottom:15px;word-break:break-all;line-height:1.7}
label{display:block;font-size:13px;color:#555;margin-bottom:8px;font-weight:600}
input{width:100%;padding:13px;border:2px solid #e0e0e0;border-radius:12px;font-size:13px;font-family:monospace;margin-bottom:12px}
input:focus{outline:none;border-color:#667eea}
button{width:100%;padding:15px;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:10px}
button:active{transform:scale(.98)}
button:disabled{opacity:.5}
.br{background:linear-gradient(135deg,#ff4757,#c0392b);color:#fff}
.bg{background:#f0f0f0;color:#555}
.o{margin-top:15px;padding:15px;border-radius:12px;font-size:12px;line-height:1.7;white-space:pre-wrap;word-break:break-word;font-family:monospace;max-height:400px;overflow-y:auto;display:none}
.o.show{display:block}
.o.info{background:#e3f2fd;color:#0d47a1}
.o.ok{background:#e8f5e9;color:#1b5e20}
.o.err{background:#ffebee;color:#b71c1c}
</style>
</head>
<body>
<div class="c">
<h1>🗑️ Zhost Cleanup</h1>
<p class="s">Data Cleanup Tool</p>
<div class="i" id="env"></div>
<div class="w">⚠️ <strong>သတိ:</strong> Data အကုန် ဖျက်မယ်။ Table structure ကို မဖျက်ပါ။</div>
<label>🔑 Appwrite API Key</label>
<input type="password" id="key" placeholder="standard_xxx...">
<button class="bg" id="b1" onclick="test()">🔍 Connection စမ်း</button>
<button class="br" id="b2" onclick="run()">🗑️ အကုန် ဖျက်မယ်</button>
<div class="o" id="out"></div>
</div>
<script>
var EP="https://fra.cloud.appwrite.io/v1";
var PJ="6ab8a17c0009e545239a";
var DB="6ab8a2dd002493abffc1";
var PT="6ab8a3170023949dc624";
var UT="user_points";
var BK="6ab8a9a20014b126f169";
var total=0;
document.getElementById("env").innerHTML="Protocol: <b>"+location.protocol+"</b><br>Host: <b>"+location.host+"</b><br>Endpoint: <b>"+EP+"</b>";
var out=document.getElementById("out");
function log(s){out.innerHTML+=s+"\\n";out.scrollTop=out.scrollHeight}
function show(m,t){out.className="o show "+t;out.innerHTML=m}
function dis(b){document.getElementById("b1").disabled=b;document.getElementById("b2").disabled=b}
async function api(m,p,k){try{var r=await fetch(EP+p,{method:m,headers:{"X-Appwrite-Project":PJ,"X-Appwrite-Key":k,"Content-Type":"application/json"}});var t=await r.text();var d=null;try{d=t?JSON.parse(t):null}catch(e){d=t}return{ok:r.ok,status:r.status,st:r.statusText,data:d}}catch(e){return{ok:false,status:0,err:e.name+": "+e.message}}}
async function test(){var k=document.getElementById("key").value.trim();if(!k){show("❌ API Key ထည့်ပါ","err");return}dis(true);show("⏳ စမ်းနေတယ်...","info");var r=await api("GET","/databases/"+DB,k);dis(false);if(r.ok){show("✅ OK!\\n\\nStatus: "+r.status+"\\nURL: "+EP+"/databases/"+DB,"ok")}else if(r.status===0){show("❌ Network Error\\n\\n"+r.err+"\\n\\n💡 ဖြစ်နိုင်တာ:\\n① Appwrite Platform မထည့်ရသေး\\n② Network block\\n③ Endpoint မှား","err")}else{show("❌ HTTP "+r.status+" "+r.st+"\\n\\n"+JSON.stringify(r.data,null,2).slice(0,600),"err")}}
async function delDocs(k,db,c){var n=0;for(var i=0;i<100;i++){var r=await api("GET","/databases/"+db+"/collections/"+c+"/documents?limit=100",k);if(!r.ok){log("❌ List ["+r.status+"]");return n}var ds=(r.data&&r.data.documents)||[];if(!ds.length)break;for(var j=0;j<ds.length;j++){var x=await api("DELETE","/databases/"+db+"/collections/"+c+"/documents/"+ds[j].$id,k);if(x.ok){n++;total++}}log("  "+n+" deleted");if(ds.length<100)break}return n}
async function delFiles(k,b){var n=0;for(var i=0;i<100;i++){var r=await api("GET","/storage/buckets/"+b+"/files?limit=100",k);if(!r.ok){log("❌ Files ["+r.status+"]");return n}var fs=(r.data&&r.data.files)||[];if(!fs.length)break;for(var j=0;j<fs.length;j++){var x=await api("DELETE","/storage/buckets/"+b+"/files/"+fs[j].$id,k);if(x.ok){n++;total++}}log("  "+n+" files");if(fs.length<100)break}return n}
async function delUsers(k){var n=0;for(var i=0;i<100;i++){var r=await api("GET","/users?limit=100",k);if(!r.ok){log("⚠️ Users skip ["+r.status+"]");return n}var us=(r.data&&r.data.users)||[];if(!us.length)break;for(var j=0;j<us.length;j++){var x=await api("DELETE","/users/"+us[j].$id,k);if(x.ok){n++;total++}}log("  "+n+" users");if(us.length<100)break}return n}
async function run(){var k=document.getElementById("key").value.trim();if(!k){show("❌ API Key ထည့်ပါ","err");return}if(!confirm("⚠️ Data အကုန် ဖျက်မယ် — သေချာလား?"))return;if(!confirm("🛑 နောက်ဆုံး အတည်ပြုချက်"))return;dis(true);out.className="o show info";out.innerHTML="";total=0;log("🚀 Started...");log("");try{log("📸 Photos...");await delDocs(k,DB,PT);log("📁 Files...");await delFiles(k,BK);log("👥 User Points...");await delDocs(k,DB,UT);log("👤 Users...");await delUsers(k);log("\\n✅ DONE — Total: "+total);out.className="o show ok"}catch(e){log("\\n❌ Error: "+e.name+": "+e.message);out.className="o show err"}dis(false)}
</script>
</body></html>`;