/*
 * GLaDOS Auto Check-in for Egern
 * Auto-capture login Cookie + scheduled/manual check-in
 * Target: https://glados.cloud
 */

const STORAGE_COOKIE = "glados.cookie";
const STORAGE_ORIGIN = "glados.origin";
const STORAGE_CAPTURED_AT = "glados.captured_at";

export default async function (ctx) {
  // HTTP request mode: capture current GLaDOS login Cookie.
  if (ctx.request) {
    captureCookie(ctx);
    return;
  }

  // Any non-request invocation (schedule or generic/manual) performs check-in.
  await runCheckin(ctx);
}

function captureCookie(ctx) {
  try {
    const url = new URL(ctx.request.url);
    if (!/^glados\.(cloud|rocks|network)$/i.test(url.hostname)) return;

    const cookie = ctx.request.headers.get("cookie") || "";
    if (!cookie.includes("koa:sess=")) return;

    const origin = `${url.protocol}//${url.hostname}`;
    const previous = ctx.storage.get(STORAGE_COOKIE);

    ctx.storage.set(STORAGE_COOKIE, cookie);
    ctx.storage.set(STORAGE_ORIGIN, origin);
    ctx.storage.set(STORAGE_CAPTURED_AT, new Date().toISOString());

    if (cookie !== previous) {
      ctx.notify({
        title: "GLaDOS 登录凭据已保存 ✅",
        body: `已自动从 ${url.hostname} 保存登录凭据。之后会自动签到。`,
        sound: true,
      });
    }
  } catch (error) {
    console.log(`[GLaDOS] 捕获凭据失败: ${error?.message || error}`);
  }
}

async function runCheckin(ctx) {
  const cookie = ctx.storage.get(STORAGE_COOKIE);
  const origin = (ctx.storage.get(STORAGE_ORIGIN) || "https://glados.cloud").replace(/\/+$/, "");

  if (!cookie) {
    ctx.notify({
      title: "GLaDOS 尚未获取登录凭据",
      body: "保持 Egern 开启，然后用 Safari 登录 glados.cloud 并刷新签到页面一次。",
      sound: true,
    });
    return;
  }

  const hostname = new URL(origin).hostname;
  const headers = {
    Cookie: cookie,
    Origin: origin,
    Referer: `${origin}/console/checkin`,
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json;charset=UTF-8",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
  };

  try {
    const before = await api(ctx, "GET", `${origin}/api/user/status`, headers);
    if (!before?.data) throw new Error("无法读取账号状态，登录凭据可能已失效");

    const result = await api(
      ctx,
      "POST",
      `${origin}/api/user/checkin`,
      headers,
      { token: hostname }
    );

    const message = String(result?.message || "").trim();
    const lower = message.toLowerCase();
    const normal =
      result?.code === 0 ||
      lower.includes("checkin! got") ||
      lower.includes("checkin repeats") ||
      lower.includes("today's observation logged") ||
      lower.includes("already");

    if (!normal) throw new Error(message || "GLaDOS 返回了未知签到结果");

    const status = await api(ctx, "GET", `${origin}/api/user/status`, headers);

    let points = "?";
    try {
      const p = await api(ctx, "GET", `${origin}/api/user/points`, headers);
      if (p?.points !== undefined && !Number.isNaN(Number(p.points))) {
        points = String(Math.floor(Number(p.points)));
      }
    } catch (_) {
      // Points failure should not turn a successful check-in into a failure.
    }

    const email = status?.data?.email || before?.data?.email || "GLaDOS";
    let leftDays = status?.data?.leftDays ?? before?.data?.leftDays ?? "?";
    if (!Number.isNaN(Number(leftDays))) leftDays = Math.floor(Number(leftDays));

    const repeated = lower.includes("repeat") || lower.includes("already");

    ctx.notify({
      title: repeated ? "GLaDOS 今日已签到 ☑️" : "GLaDOS 签到成功 ✅",
      subtitle: maskEmail(email),
      body: `${message || (repeated ? "今日已经签到" : "签到成功")}\n积分：${points}\n剩余：${leftDays} 天`,
      sound: !repeated,
    });
  } catch (error) {
    const message = error?.message || String(error);
    console.log(`[GLaDOS] 签到失败: ${message}`);

    ctx.notify({
      title: "GLaDOS 签到失败 ❌",
      body: `${message}\n如果是登录失效，请打开 glados.cloud 重新登录并刷新一次，模块会自动更新凭据。`,
      sound: true,
    });
  }
}

async function api(ctx, method, url, headers, body) {
  const options = {
    headers,
    timeout: 15000,
    credentials: "include",
  };
  if (body !== undefined) options.body = body;

  const response = method === "POST"
    ? await ctx.http.post(url, options)
    : await ctx.http.get(url, options);

  const status = response.status;
  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`接口返回非 JSON 数据（HTTP ${status}）`);
  }

  if (status === 401 || status === 403) throw new Error("登录凭据已失效");
  if (status === 429) throw new Error("请求过于频繁，请稍后再试");
  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${status}: ${data?.message || "请求失败"}`);
  }

  return data;
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return email || "GLaDOS";
  const [name, domain] = email.split("@");
  if (name.length <= 2) return `${name[0] || "*"}***@${domain}`;
  return `${name.slice(0, 2)}***@${domain}`;
}
