import express from "express";
import session from "express-session";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import crypto from "node:crypto";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const db = new Database("data.db");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  ip TEXT,
  banned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'menu',
  access_key TEXT NOT NULL UNIQUE,
  download_url TEXT NOT NULL,
  vip INTEGER NOT NULL DEFAULT 0,
  hot INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  menu_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS community_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS banned_ips (
  ip TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "change-this-admin-password";
const adminHash = bcrypt.hashSync(adminPassword, 12);

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 1000 * 60 * 60 * 12 }
}));
app.use(express.static("public"));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60 });
const claimLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30 });

function clientIp(req) {
  // Put this behind a trusted reverse proxy and configure trust proxy there.
  return req.ip || req.socket.remoteAddress || "unknown";
}
function isIpBanned(ip) {
  return !!db.prepare("SELECT 1 FROM banned_ips WHERE ip = ?").get(ip);
}
function requireUser(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId);
  if (!user || user.banned || isIpBanned(clientIp(req))) {
    req.session.destroy(() => {});
    return res.status(403).json({ error: "Tài khoản hoặc IP đã bị khóa" });
  }
  req.user = user;
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.admin) return res.status(401).json({ error: "Admin login required" });
  next();
}

app.post("/api/register", authLimiter, (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if (!/^[A-Za-z0-9_]{3,12}$/.test(username))
    return res.status(400).json({ error: "Tên chỉ gồm chữ, số, _, dài 3–12 ký tự." });
  if (password.length < 6 || password.length > 128)
    return res.status(400).json({ error: "Mật khẩu phải dài 6–128 ký tự." });
  if (isIpBanned(clientIp(req))) return res.status(403).json({ error: "IP đã bị khóa." });

  try {
    const hash = bcrypt.hashSync(password, 12);
    const info = db.prepare("INSERT INTO users (username,password_hash,ip) VALUES (?,?,?)")
      .run(username, hash, clientIp(req));
    req.session.userId = Number(info.lastInsertRowid);
    res.json({ ok: true, username });
  } catch {
    res.status(409).json({ error: "Tên tài khoản đã tồn tại." });
  }
});

app.post("/api/login", authLimiter, (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if (isIpBanned(clientIp(req))) return res.status(403).json({ error: "IP đã bị khóa." });
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu." });
  if (user.banned) return res.status(403).json({ error: "Tài khoản đã bị khóa." });
  req.session.userId = user.id;
  res.json({ ok: true, username: user.username });
});

app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get("/api/me", (req, res) => {
  if (req.session.userId) {
    const u = db.prepare("SELECT id,username,banned,created_at FROM users WHERE id=?").get(req.session.userId);
    if (u && !u.banned && !isIpBanned(clientIp(req))) return res.json({ user: u });
  }
  res.json({ user: null });
});

app.get("/api/menus", requireUser, (req, res) => {
  const q = String(req.query.q || "").trim();
  const category = String(req.query.category || "").trim();
  let sql = "SELECT id,title,category,vip,hot FROM menus WHERE 1=1";
  const args = [];
  if (q) { sql += " AND title LIKE ?"; args.push(`%${q}%`); }
  if (category && category !== "all") { sql += " AND category = ?"; args.push(category); }
  sql += " ORDER BY hot DESC, id DESC";
  res.json({ menus: db.prepare(sql).all(...args) });
});

app.post("/api/claim", requireUser, claimLimiter, (req, res) => {
  const key = String(req.body.key || "").trim();
  const menu = db.prepare("SELECT * FROM menus WHERE access_key=?").get(key);
  if (!menu) return res.status(404).json({ error: "Key không hợp lệ." });
  db.prepare("INSERT INTO claims(user_id,menu_id,username) VALUES(?,?,?)")
    .run(req.user.id, menu.id, req.user.username);
  res.json({ ok: true, download_url: menu.download_url, username: req.user.username });
});

app.get("/api/live", (req, res) => {
  res.json({
    items: db.prepare("SELECT username, menu_id, claimed_at FROM claims ORDER BY id DESC LIMIT 8").all()
  });
});

app.get("/api/chat/messages", requireUser, (req,res) => {
  res.json({messages: db.prepare("SELECT id,username,message,created_at FROM community_messages ORDER BY id DESC LIMIT 100").all().reverse()});
});
app.post("/api/chat/messages", requireUser, rateLimit({windowMs:60000,limit:30}), (req,res) => {
  const message=String(req.body.message||"").trim();
  if(!message) return res.status(400).json({error:"Tin nhắn trống."});
  if(message.length>500) return res.status(400).json({error:"Tin nhắn tối đa 500 ký tự."});
  db.prepare("INSERT INTO community_messages(user_id,username,message) VALUES(?,?,?)").run(req.user.id,req.user.username,message);
  res.json({ok:true});
});
app.delete("/api/admin/chat/messages", requireAdmin, (req,res) => {
  db.prepare("DELETE FROM community_messages").run();
  res.json({ok:true});
});

app.post("/api/admin/login", authLimiter, (req, res) => {
  const username = String(req.body.username || "");
  const password = String(req.body.password || "");
  if (username !== adminUsername || !bcrypt.compareSync(password, adminHash))
    return res.status(401).json({ error: "Admin credentials invalid" });
  req.session.admin = true;
  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.admin = false;
  res.json({ ok: true });
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
  res.json({
    users: db.prepare("SELECT id,username,ip,banned,created_at FROM users ORDER BY id DESC").all()
  });
});

app.post("/api/admin/users/:id/ban", requireAdmin, (req, res) => {
  const user = db.prepare("SELECT id,ip FROM users WHERE id=?").get(Number(req.params.id));
  if (!user) return res.status(404).json({ error: "User not found" });
  db.prepare("UPDATE users SET banned=1 WHERE id=?").run(user.id);
  if (user.ip) db.prepare("INSERT OR IGNORE INTO banned_ips(ip) VALUES(?)").run(user.ip);
  res.json({ ok: true });
});

app.post("/api/admin/users/:id/unban", requireAdmin, (req, res) => {
  const user = db.prepare("SELECT id,ip FROM users WHERE id=?").get(Number(req.params.id));
  if (!user) return res.status(404).json({ error: "User not found" });
  db.prepare("UPDATE users SET banned=0 WHERE id=?").run(user.id);
  if (user.ip) db.prepare("DELETE FROM banned_ips WHERE ip=?").run(user.ip);
  res.json({ ok: true });
});

app.get("/api/admin/claims", requireAdmin, (req, res) => {
  res.json({ claims: db.prepare("SELECT * FROM claims ORDER BY id DESC LIMIT 200").all() });
});

app.post("/api/admin/menus", requireAdmin, (req, res) => {
  const title = String(req.body.title || "").trim();
  const category = String(req.body.category || "menu").trim();
  const access_key = String(req.body.access_key || "").trim();
  const download_url = String(req.body.download_url || "").trim();
  const vip = req.body.vip ? 1 : 0;
  const hot = req.body.hot ? 1 : 0;
  if (!title || !access_key || !/^https?:\/\//i.test(download_url))
    return res.status(400).json({ error: "Thiếu dữ liệu hoặc download URL không hợp lệ." });
  try {
    db.prepare("INSERT INTO menus(title,category,access_key,download_url,vip,hot) VALUES(?,?,?,?,?,?)")
      .run(title, category, access_key, download_url, vip, hot);
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: "Key đã tồn tại." });
  }
});

app.delete("/api/admin/menus/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM menus WHERE id=?").run(Number(req.params.id));
  res.json({ ok: true });
});

app.get("/admin", (req, res) => res.sendFile(new URL("./public/admin.html", import.meta.url).pathname));

app.listen(PORT, () => console.log(`Muop VIP running on http://localhost:${PORT}`));
