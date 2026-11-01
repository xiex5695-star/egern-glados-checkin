/*
 * GLaDOS Egern check-in (2026 session compatibility)
 * Cookies and User-Agent remain in Egern local storage.
 */
const STORAGE_COOKIE = "glados.cookie";
const STORAGE_ORIGIN = "glados.origin";
const STORAGE_CAPTURED_AT = "glados.captured_at";
const STORAGE_UA = "glados.user_agent";
const DEFAULT_ORIGIN = "https://glados.cloud";

export default async function (ctx) {
  if (ctx.request) {
    captureCookie(ctx);
    return;
  }
  await runCheckin(ctx);
}

function header(headers, key) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(key) || headers.get(key.toLowerCase()) || "";
  const found = Object.keys(headers).find(k => k.toLowerCase() === key.toLowerCase());
  return found ? String(headers[found] || "") : "";
}

function hasPair(cookie, prefix) {
  return cookie.split(";").map(s => s.trim()).some(s => s.startsWith(prefix + ":sess=")) &&
    cookie.split(";").map(s => s.trim()).some(s => s.startsWith(prefix + ":sess.sig="));
}

function captureCookie(ctx) {
  try {
    const url = new URL(ctx.request.url);
    if (url.protocol !== "https:" || !/^glados\.(cloud|rocks|network)$/i.test(url.hostname)) return;
    const cookie = header(ctx.request.headers, "cookie");
    if (!cookie) return;
    // New sessions must include BOTH signed cookies. Never overwrite a working
    // session with an incomplete request's cookie header.
    const modern = hasPair(cookie, "gld");
    const legacy = hasPair(cookie, "koa");
    if (!modern && !legacy) return;
    const previous = ctx.storage.get(STORAGE_COOKIE) || "";
    if (!modern && hasPair(previous, "gld")) return;
    const ua = header(ctx.request.headers, "user-agent");
    ctx.storage.set(STORAGE_COOKIE, cookie);
    ctx.storage.set(STORAGE_ORIGIN, DEFAULT_ORIGIN);
    ctx.storage.set(STORAGE_CAPTURED_AT, new Date().toISOString());
    if (ua) ctx.storage.set(STORAGE_UA, ua);
    if (previous !== cookie) {
      ctx.notify({
        title: modern ? "GLaDOS 新版凭据已保存 ✅" : "GLaDOS 检测到旧版凭据 ⚠️",
        body: modern ? "已保存完整新版会话及浏览器设备信息。" : "只有旧版 koa 会话；请在 glados.cloud 重新登录以获取 gld:sess 和签名。",
        sound: true,
      });
    }
  } catch (e) {
    console.log("[GLaDOS] Cookie 捕获失败（不记录敏感凭据）");
  }
}

function describeError(result) {
  const message = String(result?.message || "");
  const reason = String(result?.reason || "");
  const code = result?.code;
  if (reason.includes("device-mismatch") || message.toLowerCase().includes("automated check-in"))
    return "设备校验拒绝（device-mismatch / automated check-in）；请检查登录浏览器与请求设备信息，服务端限制无法由脚本保证解决";
  if (code === -2 || message.includes("没有权限") || /unauthori[sz]ed|permission|forbidden/i.test(message))
    return "账号认证被拒绝（code=" + String(code ?? "?") + "）；请重新登录并刷新签到页获取完整新版 Cookie";
  return "服务端拒绝（code=" + String(code ?? "?") + (reason ? ", reason=" + reason.slice(0, 60) : "") + "）";
}

function checkedStatus(result) {
  if (!result || typeof result !== "object" || !result.data || typeof result.data !== "object" ||
    result.code === -2 || /没有权限|unauthori[sz]ed|forbidden/i.test(String(result.message || ""))) {
    throw new Error("无法读取账号信息：" + describeError(result));
  }
  return result.data;
}

async function runCheckin(ctx) {
  const cookie = ctx.storage.get(STORAGE_COOKIE) || "";
  if (!cookie) {
    ctx.notify({ title: "GLaDOS 尚未捕获 Cookie", body: "请开启 Egern MITM，用 Safari 重新登录 glados.cloud 并打开签到页面。", sound: true });
    return;
  }
  if (!hasPair(cookie, "gld")) {
    ctx.notify({ title: "GLaDOS 缺少新版会话", body: "当前保存的 Cookie 没有完整 gld:sess + gld:sess.sig。请用 Safari 重新登录并刷新签到页面。", sound: true });
    return;
  }

  const origin = DEFAULT_ORIGIN;
  const ua = ctx.storage.get(STORAGE_UA) || "";
  const headers = {
    Cookie: cookie,
    Origin: origin,
    Referer: origin + "/console/checkin",
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json;charset=UTF-8",
  };
  if (ua) headers["User-Agent"] = ua;

  try {
    const before = checkedStatus(await api(ctx, "GET", origin + "/api/user/status", headers));
    const result = await api(ctx, "POST", origin + "/api/user/checkin", headers, {token: "glados.cloud"});
    const msg = String(result?.message || "");
    const lower = msg.toLowerCase();
    const repeated = /repeat|already|today's observation logged|return tomorrow/.test(lower);
    const success = result?.code === 0 || lower.includes("checkin! got") || repeated;
    if (!success) throw new Error("签到失败：" + describeError(result));

    let status = before;
    try { status = checkedStatus(await api(ctx, "GET", origin + "/api/user/status", headers)); }
    catch (_) { /* Keep the verified pre-check-in account status. */ }
    let points = "?";
    try {
      const p = await api(ctx, "GET", origin + "/api/user/points", headers);
      if (p?.points !== undefined && Number.isFinite(Number(p.points))) points = String(Math.floor(Number(p.points)));
    } catch (_) { /* Points are optional. */ }
    const left = status.leftDays;
    const days = left !== undefined && left !== null && Number.isFinite(Number(left)) ? String(Math.floor(Number(left))) : "?";
    ctx.notify({
      title: repeated ? "GLaDOS 今日已签到 ☑️" : "GLaDOS 签到成功 ✅",
      subtitle: maskEmail(status.email),
      body: (msg || (repeated ? "今日已签到" : "签到成功")).slice(0, 120) + "\n积分：" + points + "\n剩余：" + days + " 天",
      sound: !repeated,
    });
  } catch (e) {
    const message = String(e?.message || e).slice(0, 240);
    console.log("[GLaDOS] " + message);
    ctx.notify({
      title: "GLaDOS 签到 / 账号查询失败 ❌",
      body: message + "\nCookie：" + (hasPair(cookie, "gld") ? "新版完整" : "不完整") +
        "；浏览器 UA：" + (ua ? "已保存" : "未捕获") + "。请勿公开 Cookie。",
      sound: true,
    });
  }
}

async function api(ctx, method, url, headers, body) {
  const opts = {headers, timeout: 15000, credentials: "include"};
  if (body !== undefined) opts.body = body;
  const response = method === "POST" ? await ctx.http.post(url, opts) : await ctx.http.get(url, opts);
  const status = response.status;
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); }
  catch (_) { throw new Error("接口返回非 JSON（HTTP " + status + "），请检查网络、MITM 或服务端拦截"); }
  if (status === 401 || status === 403) throw new Error("认证失败：HTTP " + status);
  if (status === 429) throw new Error("请求频率受限：HTTP 429");
  if (status < 200 || status >= 300) throw new Error("接口异常：HTTP " + status + "，" + describeError(data));
  return data;
}

function maskEmail(email) {
  if (typeof email !== "string" || !email.includes("@")) return "GLaDOS";
  const parts = email.split("@");
  return parts[0].slice(0, 2) + "***@" + parts[1];
}
