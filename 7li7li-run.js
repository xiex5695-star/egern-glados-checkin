export default async function(ctx) {
  const v = ctx.env.SESSION_TOKEN;
  if (!v) throw new Error("Missing SESSION_TOKEN");
  const endpoint = "https://store.7li7li.com/";
  const common = {
    accept: "text/x-component",
    "content-type": "text/plain;charset=UTF-8",
    origin: endpoint.slice(0,-1),
    referer: endpoint,
    "user-agent": "Mozilla/5.0"
  };
  const send = async (action) => {
    const h = Object.assign({}, common);
    h["next-action"] = action;
    h["cookie"] = "__Secure-authjs." + "session-token=" + v;
    const x = await ctx.http.post(endpoint,{headers:h,body:"[]"});
    return await x.text();
  };
  const s = await send("00e6f8cf718c5dc3442767af814fd5f2e75a0c082c");
  if (s.indexOf('"checkedIn":true') >= 0) return;
  if (s.indexOf('"checkedIn":false') < 0) throw new Error("Session invalid");
  const done = await send("402ed123537c7296096de7b463d70919eb4d43eee4");
  if (done.indexOf('"success":true') < 0) throw new Error("Task failed");
}