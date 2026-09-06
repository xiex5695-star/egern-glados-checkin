/* GLaDOS for Loon. Adapted from this repository's Egern script.
 * Credentials stay in Loon storage and are sent only to the captured GLaDOS host.
 */
(async function () {
  const KEY = 'glados.loon.account.v1';
  const hostPattern = /^https:\/\/(glados\.(?:cloud|rocks|network))(?:\/|$)/i;
  const notify = (title, body) => $notification.post('GLaDOS', title, body);
  function header(headers, name) {
    const key = Object.keys(headers || {}).find(k => k.toLowerCase() === name);
    return key ? String(headers[key]) : '';
  }
  function readAccount() {
    try { return JSON.parse($persistentStore.read(KEY) || 'null'); }
    catch (_) { return null; }
  }
  function mask(email) {
    if (typeof email !== 'string' || !email.includes('@')) return 'GLaDOS';
    const parts = email.split('@');
    return parts[0].slice(0, 2) + '***@' + parts[1];
  }
  function number(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
      ? String(Math.floor(Number(value))) : '?';
  }
  function api(method, origin, path, cookie, ua, body) {
    return new Promise((resolve, reject) => {
      const params = {
        url: origin + path, timeout: 12000,
        'auto-redirect': false, 'auto-cookie': false,
        headers: { Cookie: cookie, Origin: origin, Referer: origin + '/console/checkin',
          Accept: 'application/json', 'Content-Type': 'application/json;charset=UTF-8',
          'User-Agent': ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' }
      };
      if (body !== undefined) params.body = JSON.stringify(body);
      $httpClient[method](params, (error, response, text) => {
        if (error) return reject(new Error('网络请求失败或超时，请检查当前节点'));
        const status = Number(response && response.status);
        if (status === 401) return reject(new Error('登录已失效，请重新登录并刷新签到页'));
        if (status === 403) return reject(new Error('访问被拒绝，可能是登录失效或网站验证，请用浏览器打开签到页'));
        if (status === 429) return reject(new Error('请求过于频繁，请稍后重试'));
        if (!(status >= 200 && status < 300)) return reject(new Error('接口 HTTP ' + status));
        try {
          const data = JSON.parse(text);
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
          resolve(data);
        } catch (_) { reject(new Error('接口返回非预期数据，请在浏览器完成登录或验证')); }
      });
    });
  }
  try {
    if (typeof $request !== 'undefined' && $request) {
      const match = String($request.url || '').match(hostPattern);
      const cookie = header($request.headers, 'cookie');
      if (!match || !/(?:^|;\s*)koa:sess=[^;]+/.test(cookie)) return;
      const previous = readAccount();
      const account = { origin: 'https://' + match[1].toLowerCase(), cookie,
        ua: header($request.headers, 'user-agent'), capturedAt: new Date().toISOString() };
      if (!$persistentStore.write(JSON.stringify(account), KEY)) {
        notify('凭据保存失败', '请检查 Loon 本地存储后刷新页面。');
        return;
      }
      if (!previous || previous.cookie !== cookie || previous.origin !== account.origin) {
        notify('登录凭据已保存', '可运行“GLaDOS 手动签到”验证。凭据只保存在本机。');
      }
      return;
    }
    const account = readAccount();
    if (!account || !account.cookie) {
      notify('尚未获取登录凭据', '开启 Loon 和本插件，用 Safari 登录 https://glados.cloud/console/checkin 并刷新。');
      return;
    }
    if (!/^https:\/\/glados\.(?:cloud|rocks|network)$/.test(account.origin)) {
      throw new Error('已保存的站点地址无效，请重新获取凭据');
    }
    const { origin, cookie, ua } = account;
    const before = await api('get', origin, '/api/user/status', cookie, ua);
    if (before.code !== 0 || !before.data || typeof before.data !== 'object') {
      throw new Error('无法确认登录状态，请重新登录并刷新签到页');
    }
    const result = await api('post', origin, '/api/user/checkin', cookie, ua,
      { token: origin.slice('https://'.length) });
    const message = String(result.message || '').trim();
    const repeated = /check.?in\s+repeats?\b|repeat(?:ed)?\s*check.?in|already\s+(?:checked[ -]?in|signed[ -]?in)|today's observation logged|return tomorrow|今日已签到|今天已签到|重复签到/i.test(message);
    if (result.code !== 0 && !repeated) {
      throw new Error('服务端未确认签到成功（code=' + String(result.code) + '），请打开签到页核对');
    }
    // Optional enrichment cannot turn confirmed check-in into failure.
    let status = before;
    let points = '?';
    let refreshed = false;
    try {
      const after = await api('get', origin, '/api/user/status', cookie, ua);
      if (after.code === 0 && after.data) { status = after; refreshed = true; }
    } catch (_) { /* Keep pre-check-in balance with an explicit label. */ }
    try {
      const resultPoints = await api('get', origin, '/api/user/points', cookie, ua);
      points = number(resultPoints.points);
    } catch (_) { /* Balance lookup is optional. */ }
    notify(repeated ? '今日已签到' : '签到成功',
      mask(status.data.email) + '\n积分：' + points + '\n剩余：' + number(status.data.leftDays) + ' 天' +
      (refreshed ? '' : '（签到前数据）'));
  } catch (error) {
    notify('签到未完成', error.message || '发生未知错误，请重新获取凭据后再试');
  } finally {
    $done({});
  }
})();
