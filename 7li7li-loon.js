const KEY="qili.cookie";
const isReq=typeof $request!=="undefined";
if(isReq){
  const c=$request.headers["Cookie"]||$request.headers["cookie"]||"";
  if(c.includes("__Secure-authjs.session-token=")){
    const old=$persistentStore.read(KEY);
    $persistentStore.write(c,KEY);
    if(old!==c)$notification.post("7li7li 登录凭据已保存 ✅","","之后可手动运行签到任务，也会每天 12:07 自动签到。");
  }
  $done({});
}else{
  const cookie=$persistentStore.read(KEY);
  if(!cookie){
    $notification.post("7li7li 尚未获取登录凭据","","请保持 Loon 开启，用 Safari 登录 store.7li7li.com 并刷新一次。");
    $done(); return;
  }
  const base="https://store.7li7li.com/";
  const req=(action,cb)=>$httpClient.post({
    url:base,
    headers:{
      "accept":"text/x-component",
      "content-type":"text/plain;charset=UTF-8",
      "origin":"https://store.7li7li.com",
      "referer":base,
      "user-agent":"Mozilla/5.0",
      "next-action":action,
      "cookie":cookie
    },
    body:"[]"
  },(e,r,d)=>cb(e,r,d||""));
  req("00e6f8cf718c5dc3442767af814fd5f2e75a0c082c",(e,r,s)=>{
    if(e){$notification.post("7li7li 签到失败 ❌","",String(e));$done();return;}
    if(s.includes('"checkedIn":true')){$notification.post("7li7li 今日已签到 ☑️","","无需重复签到。");$done();return;}
    if(!s.includes('"checkedIn":false')){$notification.post("7li7li 签到失败 ❌","","无法确认签到状态，请重新登录网站刷新凭据。");$done();return;}
    req("402ed123537c7296096de7b463d70919eb4d43eee4",(e2,r2,s2)=>{
      if(!e2&&s2.includes('"success":true'))$notification.post("7li7li 签到成功 ✅","","今日签到已完成。");
      else $notification.post("7li7li 签到失败 ❌","","签到接口返回异常。");
      $done();
    });
  });
}