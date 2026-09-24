# mn-translate · MarginNote 划词翻译面板

给 iPad 上的 MarginNote 用的极简翻译页：划词 → MarginNote 自定义 URL 拉取本页 → **只显示译文**，
专门为手机宽度的小面板排版（大字、无输入框、无广告、无多余按钮）。

线上地址：**https://night-system.github.io/mn-translate/**

---

## 一、MarginNote 里怎么配置

MarginNote 4：**研究（Research）→ 浏览器 → 自定义搜索 / 添加自定义 URL**，粘贴下面这一行：

```
https://night-system.github.io/mn-translate/?p=<你的口令>&q={keyword}
```

> `{keyword}` 是 MarginNote 的占位符，会被自动替换成你选中的文字（原样保留，别改写成别的词）。
> `p=` 后面是解密口令，不要删；口令换了这里的 URL 也要同步换。
> **本文件刻意不写口令明文**——口令只在你本机的 `secrets.local.json` 里，用
> `node tools/build.mjs --show` 可以随时打印出来。仓库是公开的，口令一旦提交就等于密钥明文公开。

配置好后：阅读 PDF 时选中文字 → 点这个自定义搜索 → 面板里直接出译文。

**首次使用**会在设备本地缓存已解锁的密钥，之后每次拉取都是「秒开 + 直接请求」，不再需要重新解密。

---

## 二、面板上的东西

| 位置 | 内容 | 说明 |
| --- | --- | --- |
| 顶部左 | `EN → 中 · 自动` | 当前语向。**点一下**循环切换：自动 → 强制中译英 → 强制英译中 |
| 顶部右 | `64 字` / `翻译中…` / `失败 54003` | 状态。`已截断` 表示原文超过 4800 字节被截断 |
| 中间 | 译文 | 大字、可长按选中 |
| 底部 | `复制` `重译` | 复制译文；重译会绕过缓存重新请求 |

出错的译文区会多一个 **「改用有道词典打开 ↗」**，直接跳你原来的 `youdao.com/w/eng/...` 页面兜底。

---

## 三、URL 参数

| 参数 | 作用 |
| --- | --- |
| `q=` / `text=` / `keyword=` / `kw=` / `w=` / `word=` / `t=` / `s=` | 待翻译文本，任选其一 |
| `p=` / `pass=` / `pw=` / `code=` | 解密口令 |
| `dir=auto\|zh2en\|en2zh` 或 `to=en\|zh` | 强制语向 |
| `theme=dark\|light` | 强制配色（默认跟随系统） |
| `bg=RRGGBB` / `fg=RRGGBB` | 临时改底色 / 字色，例如 `&bg=2f333a&fg=eceef2`，**不用改代码就能在现场试色** |
| `reset=1` | 清空本机缓存的口令/密钥/译文缓存 |

也支持这些写法（MarginNote 里如果占位符拼不成查询串时可用）：

```
https://night-system.github.io/mn-translate/?p=口令&{keyword}      ← 问号后直接跟文本
https://night-system.github.io/mn-translate/文本?p=口令            ← 路径式
```

---

## 四、安全设计：仓库里没有明文密钥

- `secrets.local.json`（含 appid/密钥/口令）**已被 `.gitignore` 忽略，不会提交**。
- 构建时用 **PBKDF2-SHA256(200k) + AES-256-GCM** 把 `{appid, key}` 加密成密文写进 `docs/index.html`，
  仓库里只有密文；口令不写进任何文件，只存在你 iPad 的 MarginNote 配置和你本机。
- 页面带 `referrer: no-referrer`（口令不会通过 Referer 漏给百度）、`robots: noindex`，仓库另有 `robots.txt`。
- 口令错 → AES-GCM 认证失败，页面只显示解锁框，不会退化成明文。

> 提醒：口令写在 MarginNote 的自定义 URL 里，等于放在了 iPad 配置中；如果哪天觉得不妥，
> 跑一次 `node tools/build.mjs`（改 `secrets.local.json` 里的 `passphrase`）再推送即可全部失效重来。
> 同理，百度后台换密钥后，改 `secrets.local.json` 的 `key` 重新构建推送即可，不用动代码。

---

## 五、本地开发

```bash
node tools/build.mjs          # 构建（会把密文写进 docs/index.html）
node tools/build.mjs --show   # 只打印口令与 MarginNote 用的 URL
node _scratch/serve.mjs       # 本地预览 http://127.0.0.1:8787/?p=口令&q=hello
node _scratch/cdp-test.mjs "http://127.0.0.1:8787/?p=口令&q=hello" out.png   # 真实浏览器端到端测试
```

目录：

```
src/index.template.html   页面骨架 + 样式（含 /*__APP_JS__*/ 占位）
src/app.js                前端逻辑（MD5 签名 / JSONP / 限速队列 / 解密）
tools/build.mjs           加密凭据并注入 → docs/index.html
docs/                     GitHub Pages 发布目录（只有 index.html + .nojekyll + robots.txt）
secrets.local.json        本地私密，gitignored
_scratch/                 本地测试脚本，gitignored
```

---

## 六、为什么这么实现（踩过的坑）

1. **百度接口没有 CORS 头** —— 实测 `fanyi-api.baidu.com` 的响应不带 `Access-Control-Allow-Origin`，
   浏览器 `fetch` 必被拦。但接口支持 `callback=` 参数，且响应**没有** `X-Content-Type-Options: nosniff`，
   所以用 `<script>` JSONP 取数可以在纯静态页面上跑通，**不需要任何后端/代理**。
2. **账号是标准版，QPS=1** —— 连发会返回 `54003`。因此页面做了：串行闸门 + 最小请求间隔 1.05s
   （时间戳存在 localStorage，**跨页面刷新也生效**，滑动翻译时不会自己撞自己）+ `54003` 退避重试 4 次 + 译文缓存。
3. **`crypto.subtle` 要求安全上下文** —— 必须 HTTPS（github.io 满足；本地用 127.0.0.1 也算安全上下文）。
4. **手机宽度排版** —— `viewport-fit=cover` + `env(safe-area-inset-*)` 适配 iPad 圆角/手势条，
   译文用 `clamp(16px,4.7vw,19px)`，跟随系统深浅色。

---

## 七、排错

| 现象 | 原因 / 处理 |
| --- | --- |
| `签名错误（54001）` | 密钥与页面里加密的那份不一致：改 `secrets.local.json` 后没重新构建/推送 |
| `请求过于频繁（54003）` | 标准版限速 1 次/秒，页面会自动重试；持续出现说明在极快地连续滑动 |
| `客户端 IP 未授权（58000）` | 百度翻译开放平台后台开了 **IP 白名单**，关掉即可（本页不固定出口 IP） |
| `账户余额不足（54004）` | 免费额度用完，去百度翻译开放平台充值/换号 |
| 一直转圈 | iPad 网络不通，或 github.io 被网络环境拦截；点「重译」重试 |
| 面板里显示「需要口令」 | URL 里 `p=` 丢了或口令不对 |

> 注：你给的第三个凭据（在百度翻译页面申请的那个）实测**不是**通用翻译接口的签名密钥
> （用它签名会返回 `Invalid Sign`），当前实现没有用到它，也请不要把它提交进仓库。
