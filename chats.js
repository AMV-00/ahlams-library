/* Dobby chat history: every conversation is saved in Supabase (table `config`, key "chat:<id>", RLS = only her),
   so it is there on every device. 🕘 in the chat header lists them; tap one to continue it, × deletes it. */
(function () {
"use strict";
const A = () => window.LibApp, $ = id => document.getElementById(id);
const T = {
  ar: { btn: "المحادثات السابقة", empty: "ما فيه محادثات محفوظة.", del: "حذف المحادثة", err: "ما قدرت أجيب المحادثات.", back: "رجوع للمحادثة", today: "اليوم", untitled: "محادثة" },
  en: { btn: "Past chats", empty: "No saved chats yet.", del: "Delete chat", err: "Couldn't load chats.", back: "Back to chat", today: "Today", untitled: "Chat" }
};
const L = () => T[A().lang()] || T.ar;
let cur = null, savedLen = 0, saving = false;

const titleOf = h => { const u = h.find(m => m.role === "user"); return (u ? u.content : L().untitled).replace(/\s+/g, " ").trim().slice(0, 70); };
async function save() {
  const app = A(), h = app.history();
  if (saving || app.busy() || !h.length || h.length === savedLen || !h.some(m => m.role === "assistant")) return;
  saving = true;
  try {
    if (!cur) cur = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const msgs = h.slice(-80).map(m => ({ role: m.role, content: String(m.content).slice(0, 12000) }));
    const { error } = await app.sb.from("config").upsert({ key: "chat:" + cur, value: { title: titleOf(h), updated: new Date().toISOString(), messages: msgs } });
    if (error) console.error("[chats] save failed:", error.message); else savedLen = h.length;
  } finally { saving = false; }
}
function fmt(iso) {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return L().today + " " + d.toLocaleTimeString(A().lang() === "ar" ? "ar-SA" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(A().lang() === "ar" ? "ar-SA" : "en-GB", { day: "numeric", month: "short" });
}
async function showList() {
  if (window.LibClf) LibClf.hide();
  const box = $("chatList"); box.innerHTML = ""; box.hidden = false; $("msgs").hidden = true; $("histBtn").setAttribute("aria-expanded", "true");
  const { data, error } = await A().sb.from("config").select("key,value").like("key", "chat:%");
  if (error) { box.textContent = L().err; return; }
  const rows = (data || []).filter(r => r.value && r.value.messages).sort((a, b) => String(b.value.updated).localeCompare(String(a.value.updated))).slice(0, 60);
  if (!rows.length) { const p = document.createElement("p"); p.className = "cl-empty"; p.textContent = L().empty; box.append(p); return; }
  for (const r of rows) {
    const id = r.key.slice(5), row = document.createElement("div"); row.className = "cl-row" + (id === cur ? " on" : "");
    const open = document.createElement("button"); open.type = "button"; open.className = "cl-open";
    const t = document.createElement("span"); t.className = "cl-t"; t.textContent = r.value.title || L().untitled;
    const s = document.createElement("small"); s.textContent = fmt(r.value.updated) + " · " + r.value.messages.length;
    open.append(t, s); open.onclick = () => load(id, r.value.messages);
    const x = document.createElement("button"); x.type = "button"; x.className = "cl-del"; x.textContent = "×"; x.title = L().del; x.setAttribute("aria-label", L().del + ": " + (r.value.title || ""));
    x.onclick = async () => { const { error: e } = await A().sb.from("config").delete().eq("key", r.key); if (!e) { row.remove(); if (id === cur) { cur = null; savedLen = 0; } } };
    row.append(open, x); box.append(row);
  }
}
function hideList() { $("chatList").hidden = true; $("msgs").hidden = false; $("histBtn").setAttribute("aria-expanded", "false"); }
function load(id, messages) {
  const app = A(); if (app.busy()) return;
  if (window.LibDobby) LibDobby.stop();
  const h = app.history(); h.length = 0;
  $("msgs").innerHTML = "";
  for (const m of messages) {
    if (m.role === "user") app.addMsg("me", m.content, true);
    else { const b = app.addMsg("cat", m.content, true); app.setReply(b, m.content); }
  }
  cur = id; savedLen = h.length; hideList(); $("msgs").scrollTop = 1e9;
}
/** New chat: the next message starts a new saved conversation. */
function reset() { cur = null; savedLen = 0; hideList(); }
function paint() { const b = $("histBtn"); if (b) { b.title = L().btn; b.setAttribute("aria-label", L().btn); } }

function init() {
  const b = $("histBtn"); if (!b) return;
  b.addEventListener("click", () => $("chatList").hidden ? showList() : hideList());
  setInterval(save, 2500);                                   // saves after each finished reply (text or voice)
  addEventListener("pagehide", save);
  paint();
}
window.LibChats = { reset, paint, save, hideList };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
