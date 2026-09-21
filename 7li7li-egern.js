const KEY = "qili.session";

export default async function (ctx) {
  if (ctx.request) {
    try {
      const cookie = ctx.request.headers.get("cookie") || "";
      const m = cookie.match(/__Secure-authjs\.session-token=([^;]+)/);
      if (!m) return;
      const old = ctx.storage.get(KEY);
      ctx.storage.set(KEY, m[1]);
      if (old !== m[1]) ctx.notify({title:"7li7li 登录凭据已保存 ✅",body:"之后会每天 12:07 自动签到。",sound:true});
    } catch (e) { console.log(String(e)); }
    return;
  }

  const token = ctx.storage.get(KEY);
  if (!token) {
    ctx.notify({title:"7li7li 尚未获取登录凭据",body:"保持 Egern 开启，用 Safari 登录 store.7li7li.com 并刷新一次。",sound:true});
    return;
  }

  const base = "https://store.7li7li.com/";
  const send = async (action) => {
    const r = await ctx.http.post(base,{
      headers:{
        "accept":"text/x-component",
        "content-type":"text/plain;charset=UTF-8",
        "origin":"https://store.7li7li.com",
        "referer":base,
        "user-agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
        "next-action":action,
        "cookie":"__Secure-authjs."+"session-token="+token
      },
      body:"[]", timeout:15000, credentials:"include"
    });
    if (r.status === 401 || r.status === 403) throw new Error("登录凭据已失效");
    if (r.status < 200 || r.status >= 300) throw new Error("HTTP "+r.status);
    return await r.text();
  };

  try {
    const s = await send("00e6f8cf718c5dc3442767af814fd5f2e75a0c082c");
    if (s.includes('"checkedIn":true')) {
      ctx.notify({title:"7li7li 今日已签到 ☑️",body:"无需重复签到。"});
      return;
    }
    if (!s.includes('"checkedIn":false')) throw new Error("无法确认签到状态");
    const r = await send("402ed123537c7296096de7b463d70919eb4d43eee4");
    if (!r.includes('"success":true')) throw new Error("签到返回异常");
    ctx.notify({title:"7li7li 签到成功 ✅",body:"今日签到已完成。",sound:true});
  } catch(e) {
    ctx.notify({title:"7li7li 签到失败 ❌",body:(e?.message||String(e))+"\n如登录失效，请重新登录网站并刷新一次。",sound:true});
  }
}
