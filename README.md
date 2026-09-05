# GLaDOS Auto Check-in for Egern

一个给 Egern 使用的 GLaDOS 自动签到模块。

## 功能

- 自动抓取 `glados.cloud` 登录 Cookie
- Cookie 更新后自动覆盖本机保存值
- 每天 07:15 自动签到
- 每天 15:15 自动补签
- 成功 / 重复签到 / 失败分别通知
- 显示积分和剩余天数
- Cookie 不写进 GitHub，只保存在 Egern 本机 `ctx.storage`

## 安装

在 Egern 中添加模块 URL：

`https://raw.githubusercontent.com/xiex5695-star/egern-glados-checkin/main/glados-egern.module.yaml`

安装并启用后：

1. 确保 Egern 的 MITM 证书已安装并信任。
2. 保持 Egern 开启。
3. 用 Safari 登录 `https://glados.cloud/console/checkin`。
4. 刷新一次页面。
5. 收到“GLaDOS 登录凭据已保存 ✅”通知即表示模块已准备好。

以后无需手动复制 Cookie。

## 安全说明

模块不会把你的 Cookie 上传到 GitHub。Cookie 只保存在 Egern 本机存储中，并仅用于访问 GLaDOS 对应接口。
