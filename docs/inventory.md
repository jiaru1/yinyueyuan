# 洛雪音乐源去重合并清单（inventory）

> 上游：<https://github.com/pdone/lx-music-source>，commit `000578ddca4a676012cf735abdc3489efdc67c74`（2026-10-29，Adapt availability report to dark mode）。
> 分析日期：2026-11-07。本地克隆：`~/workspace/lx-music-source-upstream`。
> 本文件只做分析：**未修改任何上游文件，未建仓库，未生成合并版 js**。机器可读版见同目录 `inventory.json`（内容与本文件一致）。

## 用户已定的两点要求（记入结论）

1. **合并后的音源名字就叫“音乐源”**：合并版 `@name` 用“音乐源”；仓库名用户稍后按这个定。
2. **最终交付也要有一份混淆版**：除可读的合并源码外，还要有一份混淆/压缩后的版本作为实际发布的 `latest.js`；混淆方式与原项目类似（字符串加密、变量名混淆），但**不能破坏 `globalThis.lx` 注册和 `@name/@version/@author` 注释头（`@preserve` 头注释要保留）**。
   落实要点见文末“合并建议”。先说结论：**只有协议已明确的后端（Tier A）才能写进混淆版**——混淆是编码形态，不是协议来源；Tier C 的后端协议本身没提取出来，混淆也变不出来。

## 方法与可信度说明

- 可读文件通读全文；混淆文件用 python 提取字符串常量、域名、URL 片段。
- 长青源的 `_jd/_qw/_dab` 三个**纯解码表达式**，用 node 在无网络、无 `lx` 环境下仅求值（未执行音源脚本主体、未请求任何音乐接口）；其余混淆源（fish / sixyin / yuningxi / lx）的 RC4 / VM 式字符串表未做完整解密，记为“未查到”。
- **密钥一律不抄值**：所有 API_KEY / CARD_KEY / apikey / signSalt / fingerprint 等，只写“有密钥，值已略去”。
- 后端可达性：2026-11-07 对 71 个主机根路径 `GET /` 一次性轻量探测（`ok`=2xx，`warn`=有 HTTP 响应但非 2xx，`failed`=无响应/超时/断开）。**这只能证明主机在不在，不能证明某条音乐接口可用或失效**——很多 API 主机的根路径本来就会返回 403/404。汇总：38 ok、17 warn、16 failed，逐 host 结果见文末附录。
- 平台 id 图例：`kw`=酷我，`kg`=酷狗，`tx`=QQ/腾讯，`wy`=网易云，`mg`=咪咕，`qs`=汽水音乐，`bili`=哔哩哔哩，`ytb`=YouTube Music，`xm`=小米音乐，`git`=ikun 源内的一个平台 id（含义未在该源内说明）。
- 音质命名不统一：`flac24bit` 与 `24bit` 同指 24bit FLAC；另有 `192k`、`hires`、`atmos`、`atmos_plus`、`master`、`spatial` 等扩展音质，合并时需先归一化。

## 16 个源逐个清单

### 1. changqing — 长青SVIP音源 v1.3.0

- 作者：SVIP；描述：音源更新，关注微信公众号: 元力菌。文件 `changqing/latest.js`（另有 `1.3.0.js`），27,645 字节，10 行，**完全混淆**（算术编码字符串；`_dab/_ru` 均编码，但 `_ru` 的 URL 模板在文件尾部以明文模板字符串出现，已解码验证）。
- 平台与音质：`kg/tx/wy/kw/mg` 各 `128k/320k/flac`；代码内音质值是 level 名：`128k→standard、320k→exhigh、flac→lossless`。
- 后端 ① `yinyue.haitangw.net`（探测 ok 200）：**直接返回 URL 字符串**（不经过脚本 fetch，由洛雪客户端当播放地址请求）：
  - kg：`http://yinyue.haitangw.net/kg/kg_song_kw.php?type=mp3&id={hash}&level={level}`（kg 用 `hash`）
  - tx：`http://yinyue.haitangw.net/qq/qq_kw.php?type=mp3&id={songmid}&level={level}`
  - wy：`http://yinyue.haitangw.net/wy/wy.php?type=mp3&id={songmid}&level={level}`
  - kw：`http://yinyue.haitangw.net/kw/kw.php?type=mp3&id={songmid}&level={level}`
  - mg：`http://yinyue.haitangw.net/mg/migu.php?type=mp3&id={songmid}&level={level}`
- 后端 ② `13413.kstore.vip`（仅更新检查，探测 warn 404）：`GET https://13413.kstore.vip/lxmusic/changqing.json`（timeout 3000），响应 JSON `{version, updateUrl, description}`，与本地版本 `1.3.0` 比较后发 `updateAlert`。
- 动作：仅 `musicUrl`。更新检查：有。
- 与他源重复：`yinyue.haitangw.net` 与 jiexiang、qdy 的长青/海棠系直链同属一个后端家族，但子域名与路径不同（见后端分组）；`13413.kstore.vip` 仅本源更新用。
- 合并结论：**可合并**，URL 模板与 level 映射已明确。

### 2. fish — fish_music v1.9.0

- 作者：大鱼吃小鱼；描述：交流群组 <https://t.me/yus_share>。文件 `fish/latest.js`（另有 `1.9.0.js`），639,619 字节，8 行，**完全混淆**（`_0x` 字符串表 + RC4 式多层解码，字符串均加密存储；可读残留仅有函数名/常量名）。
- 平台：`kw/tx/wy/mg/kg`（由 `KW_QUALITYS/TX_QUALITYS/WY_QUALITYS/MG_QUALITYS/KG_LEVELS`、`TX_PATH_MAP`、`KW_PRIORITY`、`SOURCES`、`resolveMusicUrl`、`clampQuality` 等残留标识确认）。**音质值未查到**：各质量数组是解码调用表达式（KW 4 条、TX 4 条、WY 3 条、MG 3 条），值加密。
- 后端：唯一明文后端 `m-api.ceseet.me`（探测 ok 200）。仅更新地址明确：`UPDATE_URL=https://m-api.ceseet.me/version.json`，`SCRIPT_MD5` 校验，`UPDATE_ENABLE=true`。**音乐接口的路径/参数/响应结构全部加密，未查到**（另有残留提示疑似含酷我/酷狗/QQ/网易官方直连逻辑，但 URL 均已加密，无法静态确认）。
- 动作：`musicUrl`（另有 `inited` 与更新检查；其余未查到）。更新检查：有。
- 与他源重复：`m-api.ceseet.me` 仅 fish 使用；jiexiang 内有个名为 FishAPI 的后端，其 URL 未核实，不可认定为同一后端。
- 合并结论：**不可硬合并**，音乐接口协议未提取出来。

### 3. flower — 野花🌷 v1

- 作者：未查到（头注释无 `@author`）。文件 `flower/latest.js`（另有 `1.js`），10,057 字节，5 行，**完全混淆**（`\x` 十六进制字符串表 + 运行时洗牌，URL 被拆成碎片拼接）。
- 平台与音质（**碎片推测拼接，未验证**）：碎片 `kw|128k&wy` + `28k&tx|128` + `k&kg|128k` + `|128k&mg|1` 拼出 `kw|128k&wy|128k&tx|128k&kg|128k&mg|128k`，即 `kw/wy/tx/kg/mg` 各仅 `128k`。
- 后端 ① `97.64.37.235`（探测 warn 403）：`http://97.64.37.235/…` + 路径碎片 `/flower/v1`、`/url/`、`-info/latest`（拼接关系仅推测，未验证）；含 `code` 字段碎片与 `User-Agent`，url 取值路径未查到。
- 后端 ② `registry.npmjs.org`（推测）：碎片 `https://re` + `gistry.npm` + `js.org` + `/flo` + `wer-source` + `/lx-music/`（拼接关系仅推测，未验证）。`mirror.com` 为碎片误判（探测超时），不可作为真实主机。
- 动作：`musicUrl`（另有 `inited`、`updateAlert` 碎片；其余未查到）。更新检查：有（目标地址未查到）。
- 与他源重复：与 grass 共用同一后端 IP `97.64.37.235` 与同一 npm 镜像碎片，仅路径 `flower/v1` 与 `grass/v1` 不同。
- 合并结论：**不可硬合并**，URL 拼接仅推测，未验证。

### 4. grass — 野草🌾 v1

- 作者：未查到（头注释无 `@author`）。文件 `grass/latest.js`（另有 `1.js`），9,176 字节，5 行，**完全混淆**（与 flower 同构）。
- 平台与音质：仅 `kw|128k` 碎片可确认；其余平台碎片未检出。与 flower 同构，推测同为多平台 128k，但无证据，不写入事实。
- 后端：同 flower：`97.64.37.235`（探测 warn 403）+ npm 镜像碎片，路径碎片为 `/grass/v1`、`/grass-sou…`、`ss-source-`、`/url/`、`info/lates…`（拼接关系仅推测，未验证）。
- 动作：`musicUrl`（另有 `inited`、`updateAlert` 碎片）。更新检查：有（目标地址未查到）。
- 与他源重复：与 flower 共用同一后端 IP 与同一 npm 镜像碎片，仅路径不同。
- 合并结论：**不可硬合并**，URL 拼接仅推测，未验证。

### 5. helloworld — 𝖧౿ᥣᥣ𝗈 Ԝ𝗈𝗋ᥣᑯ 260925

- 作者：hello world；描述：每天都要开心哦,无论如何... 文件 `helloworld/latest.js`（另有 `260925.js`），21,421 字节，545 行，**可读**（CONFIG 驱动的多后端顺序 fallback 结构，含中文注释）。
- 平台与音质（各平台全部后端 quality 映射键的并集）：kw `128k/320k/flac/flac24bit/hires/atmos/atmos_plus/master`；kg `128k/320k/flac/hires/atmos/master`；tx `128k/320k/flac/flac24bit/hires/atmos/atmos_plus/master`；wy `128k/320k/flac/flac24bit/hires/atmos/master`；mg `128k/320k/flac/hires`。另有音质降级链 `master→atmos_plus→atmos→hires→flac24bit→flac→320k→128k`，20 分钟缓存，`RACE_APIS=false`（顺序试）；另声明一个不走网络的 local 源（musicUrl/lyric/pic）。
- 后端（每平台按顺序 fallback）：
  - kw：① `POST https://musicserver.haitangw.cc/v1/music/resolve-url`，JSON `{source: kw, rid, level}` → `data.url`；② `GET http://nmobi.kuwo.cn/mobi.s?f=web&user=0&source=kwplayerhd_ar_1.1.4.5_tianbao_T1A_qirui.apk&type=convert_url_with_sign&rid={id}&br={quality}` → `data.url`（酷我官方；br 映射 `128k→128kmp3、320k→320kmp3、flac→2000kflac、flac24bit/hires→4000kflac、atmos→20201kmflac、atmos_plus→20501kmflac、master→20900kmflac`）。
  - kg：① `GET http://103.79.184.97/api/music/url?source=kg&songId={id}&quality={quality}&key=…`（有密钥，值已略去；另附 `X-Card-Key` 请求头）→ `url` 或 `data.url`；② `GET https://yy.zddyr.top/lx/api/?source=kg&quality={quality}&mainHash={id}`（请求前 `before()` 生成 `X-Token`——base64 的 `{device_id, ip: 0.0.0.0, timestamp, random}`——与 `X-Client: YYMusicSource/v1.0.0 (Android)`）→ `url`；③ `POST musicserver.haitangw.cc` resolve-url。
  - tx：① `103.79.184.97`（`source=tx`，同上）；② `yy.zddyr.top`（`source=tx`）；③ `GET https://tang.api.s01s.cn/music_open_api.php?mid={id}` → 按音质取字段（`128k→song_play_url_standard、320k→song_play_url_hq、flac→song_play_url_sq、flac24bit/atmos→song_play_url_pq`，`after()` 兜底遍历全部 `song_play_url_*` 字段）；④ `POST musicserver.haitangw.cc` resolve-url；⑤ `GET https://a.aa.cab/qq.music?msg={keyword}&n=1&type={quality}` → `data.music`/`playUrl`/`url`/`data.url`（quality 映射 `128k→0、320k→1、flac→4、master→5`；按关键词搜歌，非 id 取链）。
  - wy：① `POST https://c.wwwweb.top/music/url`，JSON `{source: wy, musicId, quality}` → `code 200` 且 `url` 字段；② `POST musicserver.haitangw.cc` resolve-url；③ `yy.zddyr.top`（`source=wy`）；④ `GET https://mcp.nianxinxz.com/share/ceshi/wy.php?id={id}&level={quality}` → `code 200` 且 `url`；⑤ `GET http://103.79.184.97/api/music/url?platform=wy&songId={id}&quality={quality}&key=…`（注意 wy 用 `platform` 参数而非 `source`）。
  - mg：① `yy.zddyr.top`（`source=migu`）；② `GET https://oiapi.net/api/MiGu_Music?msg={keyword}&br={quality}` → `data.url` 或 `url`（br 映射 `128k→LQ、320k→HQ、flac/hires→SQ`；按关键词搜歌）。
- 动作：仅 `musicUrl`。更新检查：无。
- 与他源重复：`103.79.184.97` 与 hyw、jiexiang 共用；`musicserver.haitangw.cc` 与 jiexiang 共用；`yy.zddyr.top` 与 jiexiang、qdy、xinghai 共用；`oiapi.net` 与 jiexiang、qdy 共用；`tang.api.s01s.cn` 与 jiexiang 共用；`c.wwwweb.top` 与 jiexiang 共用；`nmobi.kuwo.cn` 官方接口与 jiexiang、xinghai 共用。
- 合并结论：**可合并**，全部后端协议已明确；其 CONFIG 结构本身就是“一个平台挂多个后端顺序试”的合并形态，是合并版 fallback 路由的最佳骨架。

### 6. huanyin — 幻音音源 v3

- 作者：竹佀。文件 `huanyin/latest.js`（另有 `3.js`），7,316 字节，310 行，**可读**。
- 平台与音质：tx/kw/wy 各 `128k/320k/flac/flac24bit`；mg `128k/320k`。
- 后端 ① `music-dl.sayqz.com`（探测 failed，连接被断开——单次探测结果，仅供参考）：tx/kw/wy **不发请求，直接返回 URL 字符串**，由洛雪客户端当播放地址请求：`https://music-dl.sayqz.com/api/?source={qq|kuwo|netease}&id={songmid}&type=url&br={br}`（`tx→qq、kw→kuwo、wy→netease`）。
- 后端 ② `api.xcvts.cn`（探测 ok 200）：mg 用 `GET https://api.xcvts.cn/api/music/migu?gm={keyword}&n={page}&num=1&type=json`（timeout 2000–3000），响应 `code 200 + music_url/title/artist/album/duration`；`musicUrl` 时按歌名+专辑/歌手做匹配校验（`checkMatch`），命中才返回并入 Map 缓存；`search` 时每页返回 1 条，最多试 3 页。
- 动作：`musicUrl`（tx/kw/wy/mg）+ `search`（仅 mg）。更新检查：无。
- 与他源重复：`music-dl.sayqz.com` 与 qdy（星海备，定义了但未编入 fallback 链）共用；`api.xcvts.cn` 与 jiexiang、qdy 共用。
- 合并结论：**可合并**，两条协议都明确；注意 tx/kw/wy 是“返回 URL 字符串”形态，与 fetch 取 JSON 的后端要分开处理。

### 7. huibq — Huibq_lxmusic源 v1.2.0

- 作者：Huibq；描述：Github搜索“洛雪音乐音源”，禁止批量下载！文件 `huibq/latest.js`（另有 `1.2.0.js`），2,727 字节，89 行，**可读**。
- 平台与音质：`kw/kg/tx/wy/mg` 各 `128k/320k`。
- 后端 `lxmusicapi.onrender.com`（探测 ok 200）：`GET https://lxmusicapi.onrender.com/url/{source}/{songId}/{quality}`，`songId = musicInfo.hash ?? musicInfo.songmid`；请求头 `Content-Type: application/json`、`User-Agent: lx-music-{env}/{version}`、`X-Request-Key`（有密钥，值已略去）；响应 `body.code`：`0→body.url；1 block ip；2 get music url failed；4 internal server error；5 too many requests；6 param error；default body.msg`。
- 动作：仅 `musicUrl`。更新检查：无。
- 与他源重复：`lxmusicapi.onrender.com` 与 jiexiang（Huibq 后端）共用；注意 qdy 的 Huibq 用的是另一 host `api.huibq.com`（key 为占位符，未配置），不是同一部署。
- 合并结论：**可合并**，协议完全明确。

### 8. hyw — HYWmusic_公益版 v1.2.0

- 作者：Ryn；描述：qq群：1094095648；965503129；主页 <https://github.com/Macrohard0001/HYWmusic_source>。文件 `hyw/latest.js`（另有 `1.2.0.js`），12,082 字节，293 行，**可读**（含中文注释，注明协议参考 ikun 源）。
- 平台与音质：`kw/tx/wy/kg` 各 `128k/320k/flac/flac24bit`；`mg/qs/bili/xm` 各 `128k/320k`；`ytb` 仅 `128k`。`songId` 取 `songmid/songId/id/hash/rid/musicId/copyrightId/songid`，并透传 album/singer 等字段。
- 后端 `103.79.184.97`（探测 ok 200）：
  - musicUrl：`GET https://103.79.184.97/api/music/url?source={platform}&songId={id}&quality={quality}&key=…`（有密钥，值已略去；同时附 `X-Card-Key` 请求头，仅 ASCII 安全时附带，服务端优先读 query 的 key）；响应 `code 200→url||data||body；401/403 鉴权失败；429 请求过速；500 服务器错误`。
  - lyric/pic：`GET https://103.79.184.97/api/music/info?action={lyric|pic}&source={platform}&songId={id}&key=…` → `code 200 + data.lyric/tlyric/rlyric/lxlyric` 或 `data.pic|url`（函数已实现，但 `inited` 声明 `actions` 仅 `['musicUrl']`，注释说明声明 lyric/pic 会被官方客户端过滤，故不声明）。
  - 更新：`GET https://103.79.184.97/api/releases?script=HYWmusic_%E5%85%AC%E7%9B%8A%E7%89%88&scriptType=free&releaseType=lx&version=v1.2.0`（`@updateUrl` 头注释同款地址），响应 `code 200 + data.version/data.url`（相对路径补 API_BASE）`/data.updateLog`，版本比较后发 `updateAlert`。
- 动作：声明仅 `musicUrl`；代码内另有 lyric/pic 处理函数。更新检查：有。
- 与他源重复：`103.79.184.97` 与 helloworld、jiexiang 共用。
- 合并结论：**可合并**，协议完全明确；是 `103.79.184.97` 这条后端最完整的协议定义（与 helloworld 的用法互相印证）。

### 9. ikun — ikun音源 v22

- 作者：ikunshare。文件 `ikun/latest.js`（另有 `6.js`、`22.js`），4,991 字节，146 行，**可读**。
- 平台与音质：kw `128k/320k/flac/flac24bit/hires`；wy `128k/320k/flac/flac24bit/hires/atmos/master`；git `128k/320k/flac`（git 平台的含义未在该源内说明；`API_KEY` 为空字符串）。
- 后端 `api.ikunshare.com`（探测 failed，连接被断开——单次探测结果，仅供参考）：`GET https://api.ikunshare.com/url?source={source}&songId={hash ?? songmid}&quality={quality}`，请求头 `Content-Type: application/json`、`User-Agent`、`X-Request-Key`（空），`follow_max 5`；响应 `body.code 200→body.url；403 鉴权失败；500→body.message；429 请求过速；default body.message`。
- 更新：`GET https://api.ikunshare.com/script/lxmusic?key=&checkUpdate={SCRIPT_MD5}`，响应 `code 200 + data.updateMsg/data.updateUrl → updateAlert`（SCRIPT_MD5 为脚本内容哈希，合并版需重新计算）。
- 动作：仅 `musicUrl`。
- 与他源重复：`api.ikunshare.com` 仅 ikun 使用；jiexiang 标注 `c.wwwweb.top` 为“取自 ikun 音源 v26”，是另一 ikun 版本的后端，不计入本源。
- 合并结论：**可合并**，协议完全明确。

### 10. jiexiang — 杰翔聚合音源 2.3.0

- 作者：QQ 加群链接（`@author` 字段为 QQ 加群二维码链接，无人名；值已略去）；主页 <https://github.com/haonanren118/jiexiang-Music-Source>；描述：全平台支持flac，wy，qq，kw，kg支持母带。文件 `jiexiang/latest.js`（另有 `2.3.0.js`），91,493 字节，2,168 行，**可读**（未混淆，含中文注释与 93 个命名后端）。
- 平台与音质（无 Cookie 时的基准）：tx/wy 各 `128k/320k/flac`；kw `128k/192k/320k/flac/flac24bit`；kg `128k/320k/flac/hires/atmos/master`；mg `128k/320k/flac`。**音质依赖头注释 Cookie**：`parseHeader(currentScript)` 读 `@tx_cookie/@tencent` 与 `@wy_cookie/@netease`（均为空，需用户填）。有 TX Cookie 时 tx 增至 `128k/320k/flac/flac24bit/hires/atmos/atmos_plus/master`；有 WY Cookie 时 wy 增至 `128k/320k/flac/flac24bit/hires/atmos/master`；两者都有时取并集。
- 后端：每平台 12–26 个命名后端顺序 fallback——TX 26 个：QQ官方、星海主后端、星海备后端、溯音QQ、xcvts、vkeys、vkeys旧版、柳云API、317ak、nki、tang、玉宁熙、收集聚合、lxmusic88、长青直链、念心直链、妖狐、GDStudio、ChKsZ、Huibq、聚合API、FishAPI、汽水VIP、HYWmusic、QQ越权、ygking QQ；WY 20 个：ikun网易云、网易云官方、ChKsZ-VIP、笒鬼鬼、溯音163、toubiec、GDStudio、星海主后端、星海备后端、bugpk、念心直链、长青直链、妖狐、lxmusic88、FishAPI、Huibq、聚合API、汽水VIP、HYWmusic、残像 WY；KW 17 个：酷我流媒体、星海主后端、星海备后端、笒鬼鬼、聚合API、妖狐、长青直链、念心直链、酷我官方、酷我手机版、酷我车机版、聆澜、HYWmusic、溯音酷我、HelloWorld、yunmge酷我、星海酷我；KG 18 个：长青海棠、长青SVIP直链、长青直链、长青POST、星海主后端、星海备后端、聚合API、HelloWorld、妖狐、念心KG、ChKsZ、海棠API、酷狗官方、聆澜、HYWmusic、GDStudio、星海酷狗、念心酷狗；MG 12 个：星海主后端、星海备后端、聚合API、GDStudio、Migu直接源、Migu API、星海后端、长青直链、念心直链、聆澜、HYWmusic、星海咪咕。
- 其中已核实的后端地址举例：`88.lxmusic.xn--fiqs8s` 的 `/lxmusicv3/url/tx/` 与 `/lxmusicv4/url/{tx,wy}/`；`api.xcvts.cn` 的 `/api/music/qq?apiKey=…`（有密钥，值已略去）；其余后端 host 见后端分组，协议细节未逐条展开。官方接口（QQ `musicu.fcg`、网易 eapi、酷我 `mobi.s`、酷狗 `play/getdata`、咪咕 `getPlayInfo`）需 Cookie/签名。
- 动作：仅 `musicUrl`。更新检查：无（无 `updateAlert`/`UPDATE_URL`；仅 `@update 2026-09-13` 变更记录）。
- 与他源重复：几乎全网共用（`yy.zddyr.top`、`zrcdy.dpdns.org`、`music-api.gdstudio.xyz`、`oiapi.net`、`api.xcvts.cn`、`lxmusicapi.onrender.com`、`api.music.lerd.dpdns.org`、`api.vsaa.cn`、`103.79.184.97`、`musicserver.haitangw.cc`、`music.haitangw.cc`、`music.nxinxz.com`、`175.27.166.236`、`tang.api.s01s.cn`、`c.wwwweb.top`、`api.chksz.top`、`api-v2.yuafeng.cn`、`nmobi.kuwo.cn` 等，见后端分组）。
- 合并结论：**部分可合并**——其中与 helloworld/hyw/huibq/juhe/qdy/xinghai 重合的后端协议已明确，可直接复用；jiexiang 独占的小后端（vkeys、妖狐、柳云、317ak、nki、笒鬼鬼、bugpk、toubiec、聆澜、yunmge、ygking、cyapi、收集聚合、QQ越权、残像等）与官方直连链路未逐条展开，需逐个核实后才能纳入；Cookie 依赖的高音质需保留 `parseHeader` 机制或降级。

### 11. juhe — 聚合API接口 (CF) v3

- 作者：lerd；描述：v3。文件 `juhe/latest.js`（另有 `3.js`），994 字节，7 行，**可读**（压缩成 7 行，未混淆）。
- 平台与音质：**未在脚本内声明**——启动时 `GET https://api.music.lerd.dpdns.org/init.conf`，服务端下发 sources 定义（`data.init`），之后才 `send inited`；平台列表以服务端下发为准。脚本本身不硬编码平台/音质。
- 后端 `api.music.lerd.dpdns.org`（探测 ok 200）：
  - 启动：`GET {A}/init.conf`，响应 `body.code 200 + data.init`（sources 定义）与 `data.update`（`{version}`）。
  - musicUrl：`POST {A}/{source}`（source 为平台 id，如 tx/wy/kw/kg/mg），`Content-Type: application/json`，body 为 `JSON.stringify(info)`（整个 info 对象，内含 musicInfo 与 type）；响应 `code 200→data.url`；`code 303→` 按 data 内嵌的 `{request, response}` 做二次请求，校验 `response.check.key` 路径值等于 `check.value` 后取 `response.url` 路径值（须以 http 开头）；其他→抛 `body.msg`。
- 动作：通用 request 处理（不区分动作名；以 musicUrl 为主；实际可用动作由服务端下发的 sources 定义）。更新检查：有（`init.conf` 内 `data.update.version` 大于客户端版本时发 `updateAlert`）。
- 与他源重复：与 jiexiang（聚合API 后端）共用**同一服务、同一协议**。
- 合并结论：**可合并**，协议完全明确；其 `init.conf` 下发 sources 的机制可直接借用到合并版（启动拉一次 `init.conf` 拿平台列表）。

### 12. lx — 独家音源 v7

- 作者：w；描述：后续更新，请关注微信公众号: 洛雪科技。文件 `lx/latest.js`（另有 `2.js`–`7.js`），64,094 字节，13 行，**完全混淆**（自定义 VM 式混淆：Unicode 标识符 + 运行时算术解码字符串；除 SERVER_SCRIPT_CONFIG 外静态无法提取任何标识）。
- 平台、音质、动作、更新检查：**全部未查到**。
- 后端：唯一明文是头部 `SERVER_SCRIPT_CONFIG`：`apiUrl=https://88.lxmusic.xn--fiqs8s`（探测 ok 200），另有 `apiKey`、`signSalt`、`fingerprint`（有密钥/签名盐，值已略去）。即音乐接口走该域名 + 签名机制（配置名 `signSalt` 可证），但路径/参数/响应结构均未查到。
- 与他源重复：`88.lxmusic.xn--fiqs8s` 与 jiexiang（lxmusic88 后端）共用；jiexiang 侧已知该域名下至少存在 `/lxmusicv3/url/tx/` 与 `/lxmusicv4/url/{tx,wy}/` 两套路径，但 lx 源自身是否用同一路径未查到。
- 合并结论：**不可硬合并**，除域名与签名配置外协议全部未提取出来。

### 13. qdy — 全豆要[聚合音源] 9.3

- 作者：全豆要 and Gemini优化 Toskysun去混淆 TZB679兼容性处理；描述：迭代9.3版本，聚合 星海/溯音/念心/长青/歌一刀专属汽水音乐，多链路自动回退。文件 `qdy/latest.js`（另有 `9.3.js`），31,090 字节，831 行，**可读**。
- 平台与音质：wy/tx/kw/kg/mg 各 `24bit/flac/320k/192k/128k`（注意用 `24bit` 而非 `flac24bit` 命名）；另有独立源 `qsvip`（汽水VIP）`128k/320k/flac/flac24bit`。
- Fallback 策略：`getUrlWithFallback`——前 3 个并发，剩余顺序；链为：星海主 → Huibq → 溯音分平台 → 聆川 → 长青SVIP → 念心SVIP。
- 后端明细：
  - 星海主 `music-api.gdstudio.xyz`（探测 ok 200）：`GET https://music-api.gdstudio.xyz/api.php?use_xbridge3=true&loader_name=forest&need_sec_link=1&sec_link_scene=im&theme=light&types=url&source={netease|tencent|kuwo|kugou|migu}&id={id}&br={br}` → `body.url`（br 映射 `128k→128、192k→192、320k→320、flac→740、flac24bit/24bit→999`）。
  - 星海备 `music-dl.sayqz.com`：`GET https://music-dl.sayqz.com/api/?source={netease|qq|kuwo}&id={id}&type=url&br={quality}`，直接返回 URL 字符串。**注意：`SOURCE_HANDLERS` 定义了 `xinghaiBackup`，但 `buildSourceChain` 未把它编入 fallback 链（孤儿后端）**。
  - Huibq `api.huibq.com`（探测 failed，连接被断开）：`GET https://api.huibq.com/api/url/{platform}/{id}/{320k|128k}`，`X-Request-Key` 为**占位符，未配置，实际会失败**；响应与 huibq 源同构（code 0→url）。注意这是另一 host，不是 huibq 源的 `lxmusicapi.onrender.com`。
  - 聆川 `api.lingchuan.com`（探测 failed，连接被断开）：`GET https://api.lingchuan.com/v1/url?source={platform}&songId={hash ?? songmid}&quality={320k|128k}` → `code 200→url`（与 ikun 源同构）。
  - 溯音 `oiapi.net`（探测 ok 200）：tx `GET https://oiapi.net/api/QQ_Music?key=…&type=json&br={br}&mid|songid={id}`（有密钥，值已略去）→ `res.music` 或 `res.url`（br 按音质取 7/5/4/3/2/1，失败时降级重试）；wy `GET https://oiapi.net/api/Music_163?id={songmid|id}` → `code 0 + data[0].url`；kw `GET https://oiapi.net/api/Kuwo?msg={keyword}&n=1&br={br}` → `data.url`（按歌名搜索+信息匹配校验）；mg 走 `api.xcvts.cn`（见下条）。
  - 溯音咪咕 `api.xcvts.cn`（探测 ok 200）：`GET https://api.xcvts.cn/api/music/migu?gm={keyword}&n=1&num=1&type=json` → `code 200 + musicInfo`（**注意字段为 `musicInfo`，与 huanyin 的 `music_url` 不同，需核实**）。
  - 长青SVIP模板（直接返回 URL 字符串）：tx `http://175.27.166.236/kgqq/qq.php?type=mp3&id={id}&level={level}`；wy `http://175.27.166.236/wy/wy.php?type=mp3&id={id}&level={level}`；kw `https://musicapi.haitangw.net/music/kw.php?type=mp3&id={id}&level={level}`；kg `https://music.haitangw.cc/kgqq/kg.php?type=mp3&id={id}&level={level}`；mg `https://music.haitangw.cc/musicapi/mg.php?type=mp3&id={id}&level={level}`（level 由 `qualityToNetease` 映射）。
  - 念心SVIP模板（直接返回 URL 字符串）：tx `https://music.nxinxz.com/kgqq/tx.php?id={id}&level={level}&type=mp3`；wy `http://music.nxinxz.com/wy.php?id={id}&level={level}&type=mp3`；kw `http://music.nxinxz.com/kw.php?id={id}&level={level}&type=mp3`；kg `https://music.nxinxz.com/kgqq/kg.php?id={id}&level={level}&type=mp3`；mg `http://music.nxinxz.com/mg.php?id={id}&level={level}&type=mp3`。
  - 汽水VIP `api.vsaa.cn`（探测 failed，连接被断开）+ `proxy.qishui.vsaa.cn`（探测 failed，连接被断开）：`GET https://api.vsaa.cn/api/music.qishui.vip?act=search&keywords={keyword}&page={page}&pagesize={pageSize}&type=music`（https 优先，失败回退 http）；`?act=song&id={songId}&quality={quality}` → `data.url`（有 `ekey` 时再 `POST https://proxy.qishui.vsaa.cn/qishui/proxy`，JSON `{url, key: ekey, filename, ext}` → `code 200 + url` 解密）；lyric 同 song 接口取 `data.lyric`。
- 动作：`musicUrl`（五平台）+ `musicSearch/musicUrl/lyric`（qsvip 汽水VIP）。更新检查：未查到。
- 与他源重复：`music-api.gdstudio.xyz` 与 xinghai、jiexiang 共用；`oiapi.net` 与 helloworld、jiexiang 共用；`api.xcvts.cn` 与 huanyin、jiexiang 共用；`music-dl.sayqz.com` 与 huanyin 共用；`175.27.166.236` / `music.haitangw.cc` / `musicapi.haitangw.net` / `music.nxinxz.com` 与 jiexiang 的长青/念心直链共用；`api.vsaa.cn` 与 jiexiang（汽水VIP）共用。
- 合并结论：**可合并**——除 `api.huibq.com`（key 占位符未配置，实际不可用，应排除）外全部后端协议已明确；fallback 策略（前 3 并发、剩余顺序）可直接参考。

### 14. sixyin — 六音音源 v1.2.1

- 作者：六音；描述：v1.2.1 如失效请前往 www.sixyin.com 下载最新版本；主页 www.sixyin.com。文件 `sixyin/latest.js`（另有 `1.2.0.js`、`1.2.1.js`），333,015 字节，11 行，**完全混淆**（`_0x` 字符串表 + RC4 式解码；头注释含 `@preserve`）。
- 平台与音质：**未查到**。头注释含 `@netease MUSIC_U=`（空，待用户填）与 `@tencent ts_last=y.qq.com/n/ryqq/album`（空，待用户填），即需用户在头注释填入网易/QQ Cookie 才能解锁对应平台高音质；但平台列表与音质值本身均加密，未查到。字符串碎片仅见 `yin.c`、`.com`、`o.cn/`、`/api/`、`http:`。
- 后端：**未查到具体域名**（推测 sixyin.com 相关 + 网易/QQ 官方接口，但无证据，不写入事实）。
- 动作：`musicUrl`（出现 5 次，确认）；其余未查到。更新检查：未查到（`updateAlert`/`inited` 均未检出明文，可能经解码调用）。
- 与他源重复：无法确认。
- 合并结论：**不可硬合并**，协议全部未提取出来。

### 15. xinghai — 星海音乐源 v3.2.15

- 作者：万去了了 / 科学大魔王；描述：GDAPI | 聚合 | ChKSz API | 全平台支持 24bit FLAC，网易、酷狗、QQ 最高支持母带；主页 <https://zddyr.top/>。文件 `xinghai/latest.js`（另有 `2.3.15.js`），38,858 字节，957 行，**可读**。
- 平台与音质：wy `128k/320k/flac/hires/atmos/master`；tx `128k/192k/320k/flac/hires/atmos/atmos_plus/master`；kw `128k/320k/flac/hires/atmos/master`；kg 同 kw；mg `128k/320k/flac`；qs（汽水音乐）`128k/320k/flac/spatial/hires`。kw 高音质受限：`KW_DECRYPT_PROXY.url` 为空、`allowEncryptedLossless=false`，加密无损无法解密。
- 后端：
  - 主聚合 `yy.zddyr.top`（探测 ok 200）：`GET https://yy.zddyr.top/lx/api/?source={source}&songmid={id}&quality={quality}&…`（`SOURCE_MAP: tx→qq, mg→migu, kw→kw, kg→kg, qs→qs`；wy 无映射故传 `wy`；kg 另附 `albumId/mainHash/hash`，其余附 `name/singer/interval/albumName`）→ `code 200 + url`（403 则标记 `backendAggBlocked` 屏蔽聚合）。版本检查：`GET https://yy.zddyr.top/lx/versionh2.php?ver={version}`。
  - 备用聚合 `zrcdy.dpdns.org`（探测 ok 200）：`GET https://zrcdy.dpdns.org/lx/api/api.php`（同主聚合参数）；版本检查同路径。主/备版本检查用 `Promise.any` 取先到者。
  - GDStudio `music-api.gdstudio.xyz`（探测 ok 200，仅 wy）：`GET https://music-api.gdstudio.xyz/api.php?use_xbridge3=true&loader_name=forest&need_sec_link=1&sec_link_scene=im&theme=light&types=url&source=netease&id={id}&br={br}` → `body.url`（hires 失败时 `br=740` 再试一次）。
  - ChKsZ `api.chksz.com`（探测 ok 200）：`GET https://api.chksz.com/api/qq_music?mid={songmid}&size={size}&type=json&apikey=…`（有密钥，值已略去）→ `code 200 + url`；`GET https://api.chksz.com/api/163_music?id={id}&level={level}&apikey=…` → `code 200 + data.url/data.picUrl`；仅当 `CHKSZ_CONFIG.apikey` 非空时启用。
  - 酷我本地直连 `mobi.kuwo.cn / nmobi.kuwo.cn / anymatch.kuwo.cn / m.kuwo.cn`：酷我官方 `mobi.s convert_url_with_sign` 及 `m.kuwo.cn/newh5/singles/songinfoandlrc?musicId={rid}` 取歌词封面；加密无损需解密代理（未配置，故高音质受限）。
  - 分平台顺序：kw 先本地直连→失败回聚合后端；wy 先 ChKsZ→聚合→GD；tx 先 ChKsZ→聚合；qs/其他直接聚合。
- 动作：`musicUrl + lyric + pic`（声明三者；lyric/pic 由 musicUrl 时缓存的 `extraCache` 提供，非独立请求）。更新检查：有（主/备两个 `versionh2.php` 查更新，响应含 `update_url` 即发 `updateAlert`）。
- 与他源重复：`yy.zddyr.top` 与 helloworld、jiexiang 共用；`zrcdy.dpdns.org` 与 jiexiang 共用；`music-api.gdstudio.xyz` 与 jiexiang、qdy 共用；`api.chksz.com`（.com）与 jiexiang 的 `api.chksz.top`（.top）疑似同一服务不同部署，需核实；酷我官方域名与 helloworld、jiexiang 共用。
- 合并结论：**可合并**，全部后端协议已明确；其“kw 先本地直连、wy/tx 先 ChKsZ 再聚合再 GD”的分平台顺序可直接参考。

### 16. yuningxi — lx-玉宁熙-Pro v1.2.2

- 作者：ynx(2363768762)；描述：不出意外的话 最后一版 有缘再见；最后更新 2026.8.6 适配lxmusic 双端通用；公益音源,切勿短时间批量下载；QQ音乐填写key最高 臻品母带 不填最高SQ无损音质；网易云最高 超清母带；酷狗最高 蝰蛇超清；酷我最高 FLAC无损；咪咕最高 128k(运气好可以hires)。文件 `yuningxi/latest.js`（另有 `1.2.2.js`），147,347 字节，28 行，**完全混淆**（`_0x` 字符串表 + 运行时洗牌；但头部配置区可读）。
- 平台：tx/wy/kw/kg/mg（由 `Q['tx']/Q['wy']/Q['kw']` 与 kg/mg 的 `MUSIC_QUALITY` 引用确认）。**音质未查到**（`MUSIC_QUALITY=K`，K 为解码后赋值）。
- 后端：`api-v2.yuafeng.cn`（探测 failed，超时——单次探测结果，仅供参考）：去该站注册取 KEY（免费）；配置区 `const YuNingXi=''`（音乐解析 KEY，默认为空，需用户填）。备用地址 `http://ynx.de5.net/API/lx-ynx.php?APIKEY=…`（有密钥，值已略去；探测 failed，连接被断开）。**具体路径/参数/响应均加密，未查到**。缓存 20 分钟。
- 动作：`musicUrl`（确认有 `inited` 与 request 处理；其余未查到）。更新检查：未查到。
- 与他源重复：`api-v2.yuafeng.cn` 与 jiexiang（玉宁熙后端）共用。
- 合并结论：**不可硬合并**，音乐接口协议未提取出来；仅知 key 注册入口与备用地址。

## 去重汇总表（按后端域名分组）

去重规则：按“后端 host + 路径 + 参数模板”去重，不按源名去重。同一后端在多个源里出现只留一次；同一 host 不同路径/不同用途（如 `yy.zddyr.top` 的 `/lx/api/` 与 `/lx/versionh2.php`）算不同条目；同一后端在不同源里参数名不同（如星海聚合的 `source=qq/netease/wy/migu`）要先实测归一，不能只看名字。

| 后端 host | 被哪些源共用 | 覆盖平台 | 协议明确度 | 探测（2026-11-07 根路径） | 分级 |
|---|---|---|---|---|---|
| `103.79.184.97`（HYWmusic 服务） | hyw（主）、helloworld、jiexiang | kw/tx/wy/mg/qs/bili/ytb/xm/kg | 明确：`GET /api/music/url` + `/api/music/info` + `/api/releases` | ok 200 | A |
| `yy.zddyr.top`（星海聚合主） | xinghai（主）、helloworld、jiexiang | tx/wy/kw/kg/mg/qs | 明确：`GET /lx/api/?source&songmid&quality` → code 200 + url；`source` 参数值各源写法不一，需实测归一 | ok 200 | A |
| `zrcdy.dpdns.org`（星海聚合备） | xinghai（备）、jiexiang | tx/wy/kw/kg/mg | 明确：`GET /lx/api/api.php`，同主聚合参数 | ok 200 | A |
| `musicserver.haitangw.cc` | helloworld、jiexiang | kw/kg/tx/wy | 明确：`POST /v1/music/resolve-url {source, rid, level}` → `data.url` | warn 404（根路径，接口本身另有路径） | A |
| `yinyue.haitangw.net` / `music.haitangw.cc` / `musicapi.haitangw.net`（海棠/长青系 php 直链家族） | changqing、qdy、jiexiang | kw/kg/tx/wy/mg | 明确：`GET` 各平台 php 直链 `?type=mp3&id&level` → 返回 URL 字符串本身 | ok 200 / warn 403 / warn 403 | A |
| `175.27.166.236`（长青/念心直链裸 IP，http 明文；另有 `:8928` 酷我流媒体） | qdy、jiexiang | tx/wy/kw/kg/mg | 明确：`GET` php 直链 → 返回 URL 字符串本身；`:8928/kwstream` 返回二进制音频流 | warn 403 | A（注意 http 明文） |
| `music.nxinxz.com`（念心直链） | qdy、jiexiang | tx/wy/kw/kg/mg | 明确：`GET` 各平台 php 直链 `?id&level&type=mp3` → 返回 URL 字符串本身 | ok 200 | A |
| `lxmusicapi.onrender.com`（Huibq） | huibq（主）、jiexiang | kw/kg/tx/wy/mg | 明确：`GET /url/{source}/{id}/{quality}` + `X-Request-Key`（有密钥，值已略去）；code 0→url | ok 200 | A |
| `api.music.lerd.dpdns.org`（聚合API） | juhe（主）、jiexiang | tx/wy/kw/kg/mg | 明确：先 `GET /init.conf` 取 sources 与 update，再 `POST /{source}` JSON → code 200→`data.url` / 303 二次校验 | ok 200 | A |
| `music-dl.sayqz.com` | huanyin、qdy（星海备，qdy 内未编入链） | tx/kw/wy | 明确：`GET /api/?source={qq\|kuwo\|netease}&id&type=url&br` → 返回 URL（直接当播放地址） | failed（连接被断开，单次探测） | A |
| `music-api.gdstudio.xyz`（GDStudio） | xinghai、jiexiang、qdy | wy/tx/kw/kg/mg | 明确：`GET /api.php?use_xbridge3…&types=url&source={netease\|tencent\|kuwo\|kugou\|migu\|qq}&id&br` → `body.url` | ok 200 | A |
| `api.ikunshare.com`（ikun） | 仅 ikun | kw/wy/git | 明确：`GET /url?source&songId&quality`；`GET /script/lxmusic` 查更新 | failed（连接被断开，单次探测） | A |
| `c.wwwweb.top` | helloworld、jiexiang | wy | 明确：`POST /music/url {source: wy, musicId, quality}` → code 200 + url | ok 200 | A |
| `tang.api.s01s.cn` | helloworld、jiexiang | tx | 明确：`GET /music_open_api.php?mid` → `song_play_url_*` 按音质取字段 | ok 200 | A |
| `api.xcvts.cn` | huanyin、jiexiang、qdy | mg（明确）、tx（未展开） | 咪咕明确：`GET /api/music/migu?gm&n&num&type=json` → code 200 + `music_url`（huanyin）/`musicInfo`（qdy，字段名有出入，需核实）；QQ 端点 `/api/music/qq?apiKey=…` 未展开 | ok 200 | A（咪咕）/ B（QQ） |
| `oiapi.net`（溯音） | helloworld、jiexiang、qdy | tx/wy/kw/mg | 明确：`GET /api/QQ_Music`、`Music_163`、`Kuwo`、`MiGu_Music`；key（有密钥，值已略去） | ok 200 | A |
| `api.vsaa.cn` + `proxy.qishui.vsaa.cn`（汽水VIP） | qdy（qsvip）、jiexiang | qs（汽水音乐独立源） | 明确：`GET /api/music.qishui.vip?act=search\|song`；有 ekey 时 `POST proxy.qishui.vsaa.cn/qishui/proxy` 解密 | failed（连接被断开，单次探测） | A |
| `api.lingchuan.com`（聆川） | 仅 qdy | wy/tx/kw/kg/mg | 明确：`GET /v1/url?source&songId&quality` → code 200→url（与 ikun 同构） | failed（连接被断开，单次探测） | A |
| `mcp.nianxinxz.com` | 仅 helloworld | wy | 明确：`GET /share/ceshi/wy.php?id&level` → code 200 + url | warn 520 | A |
| `a.aa.cab` | 仅 helloworld | tx | 明确：`GET /qq.music?msg={keyword}&n=1&type={quality}` → `data.music/playUrl/url`（按关键词搜歌） | ok 200 | A |
| `api.chksz.com` / `api.chksz.top`（ChKsZ） | xinghai（.com）、jiexiang（.top） | tx/wy | 部分明确：.com 侧 `GET /api/qq_music`、`/api/163_music`（apikey，有密钥，值已略去）→ code 200 + url；.top 侧未逐条展开；两域名疑似同一服务不同部署，需核实 | ok 200 / ok 200 | B |
| `88.lxmusic.xn--fiqs8s`（lxmusic88） | lx（主，签名配置）、jiexiang | tx/wy | 部分明确：jiexiang 侧已知 `/lxmusicv3/url/tx/` 与 `/lxmusicv4/url/{tx,wy}/`；lx 源自身的路径/参数/响应加密未查到；含 apiKey、signSalt、fingerprint（有密钥/签名盐，值已略去） | ok 200 | B |
| `api.vkeys.cn` | 仅 jiexiang | tx | 未展开：`GET /music/tencent/song/link?mid`、`/v2/music/tencent/geturl?mid`；响应字段未核实 | ok 200 | B |
| `source.shiqianjiang.cn`（聆澜） | 仅 jiexiang | kw/kg/mg | 未展开：`GET /api/music/url?source&songId`；响应字段未核实 | ok 200 | B |
| `api.yaohud.cn`（妖狐） | 仅 jiexiang | tx/wy/kw/kg | 未展开：`GET /api/music/{qq_plus\|wyvip\|kwvip\|kgvip}?id`；响应字段未核实 | ok 200 | B |
| 其余 jiexiang 独占小后端（柳云 `api.liuyunidc.cn`、317ak `api.317ak.cn`、nki `api.nki.pw`、笒鬼鬼 `api.cenguigui.cn`、bugpk `api.bugpk.com`、toubiec `wyapi.toubiec.cn`、yunmge `api.yunmge.com`、ygking `api.ygking.cn`、cyapi `cyapi.top`、收集聚合、QQ越权、残像、`api.canxiang.cn`、`api.xinghai-backend.cn`、`api.xinghai.com`、`cp.chksz.top`、`gc.kxwa.top`） | 仅 jiexiang | tx/wy/kw/kg/mg | 未逐条展开：清单只记录 host 与后端名，需逐个核实协议后才能纳入 | 见附录 | B |
| `m-api.ceseet.me`（fish 服务） | 仅 fish | kw/tx/wy/mg/kg | 仅更新地址明确（`GET /version.json` + SCRIPT_MD5）；音乐接口协议全部加密，未查到 | ok 200 | C |
| `api-v2.yuafeng.cn` / `ynx.de5.net`（玉宁熙服务） | yuningxi、jiexiang（玉宁熙后端） | tx/wy/kw/kg/mg | 全部加密未查到；仅知注册入口 `api-v2.yuafeng.cn`（免费取 KEY）与备用地址 `ynx.de5.net/API/lx-ynx.php?APIKEY=…` | failed（超时/断开，单次探测） | C |
| `sixyin.com`（推测） | 仅 sixyin | 未查到 | 全部加密未查到；仅知头注释 Cookie 机制（`@netease`/`@tencent`，值为空，需用户填） | —（无确切 host 可探） | C |
| `97.64.37.235` + `registry.npmjs.org`（推测） | flower、grass | kw/wy/tx/kg/mg（flower，据碎片推测）；grass 仅 kw 可确认 | URL 拼接仅推测（IP 直连 + npm 镜像碎片 + `/flower/v1`|`/grass/v1`、`/url/`、`-info/latest`），未验证 | warn 403（IP）；`mirror.com` 为碎片误判，探测超时，不可作为真实主机 | C |
| 官方平台直连域名（`music.163.com` / `interface3.music.163.com`、`u.y.qq.com` / `y.qq.com` / `isure.stream.qqmusic.qq.com` / `dl.stream.qqmusic.qq.com`、`mobi.kuwo.cn` / `nmobi.kuwo.cn` / `m.kuwo.cn` / `anymatch.kuwo.cn`、`wwwapi.kugou.com` / `www.kugou.com`、`app.c.nf.migu.cn` / `music.migu.cn`） | jiexiang（官方接口后端）、xinghai（酷我本地直连）、helloworld（酷我 nmobi） | tx/wy/kw/kg/mg | 平台原生协议，需 Cookie/签名/设备参数；合并时不建议硬合并，单列说明 | 见附录（多为 warn 403/404，系官方接口根路径的正常表现） | B/C |
| `api.huibq.com` | 仅 qdy（Huibq 后端） | wy/tx/kw/kg/mg | 与 huibq 源同构，但 key 为占位符，未配置，实际不可用；**合并时排除** | failed（连接被断开） | 排除 |

## 合并建议

### Tier A：协议已明确、可直接写进合并版 fallback 路由（也就是可用于写混淆版合并源的后端）

`103.79.184.97`（HYWmusic `/api/music/url` + `/api/music/info` + `/api/releases`）、`yy.zddyr.top` + `zrcdy.dpdns.org`（星海聚合 `/lx/api/`，主备）、`musicserver.haitangw.cc`（`POST /v1/music/resolve-url`）、海棠/长青/念心 php 直链家族（`yinyue.haitangw.net`、`music.haitangw.cc`、`musicapi.haitangw.net`、`music.nxinxz.com`、`175.27.166.236`）、`lxmusicapi.onrender.com`（Huibq `/url/{source}/{id}/{quality}`）、`api.music.lerd.dpdns.org`（聚合API：`init.conf` + `POST /{source}`）、`music-dl.sayqz.com`（直返 URL 字符串）、`music-api.gdstudio.xyz`（GDStudio `/api.php`）、`api.ikunshare.com`（ikun `/url`）、`c.wwwweb.top`（`POST /music/url`）、`tang.api.s01s.cn`（QQ `music_open_api.php`）、`api.xcvts.cn`（咪咕；QQ 端点除外）、`oiapi.net`（溯音四平台）、`api.vsaa.cn` + `proxy.qishui.vsaa.cn`（汽水VIP search/song/lyric）、`api.lingchuan.com`（聆川 `/v1/url`）、`mcp.nianxinxz.com`（`wy.php`）、`a.aa.cab`（QQ 关键词搜索）、`mobi.kuwo.cn`/`nmobi.kuwo.cn`（酷我官方 `convert_url_with_sign`，有限）。

**哪些后端协议已明确、可用于写混淆版合并源：就是上面 Tier A 这一组。** 混淆版与可读版同源，只是编码形态不同——能写进可读版的才能写进混淆版；Tier C 的后端因协议本身未提取出来，混淆也变不出来。

### Tier B：协议部分明确，需核实后才能用

- `api.chksz.top`（jiexiang 侧）与 `api.chksz.com`（xinghai 侧）是否为同一服务、参数是否一致。
- `88.lxmusic.xn--fiqs8s` 的 v3/v4 路径与响应结构。
- `api.vkeys.cn`、`source.shiqianjiang.cn`（聆澜）、`api.yaohud.cn`（妖狐）及 jiexiang 其余独占小后端。
- `api.xcvts.cn` 的 QQ 端点。
- 官方平台直连链路（需 Cookie/签名，建议不纳入或单列）。

### Tier C：因混淆无法提取协议，只能在清单里注明、不能硬合并

- fish：`m-api.ceseet.me` 音乐接口协议未提取（仅更新地址明确）。
- lx：`88.lxmusic.xn--fiqs8s` 签名接口协议未提取（仅域名与签名配置明确）。
- sixyin：全部协议未提取（仅知 Cookie 机制与 sixyin.com）。
- yuningxi：`api-v2.yuafeng.cn` / `ynx.de5.net` 协议未提取（仅知注册入口与备用地址）。
- flower/grass：`97.64.37.235` + npm 镜像的 URL 拼接仅推测，未验证。

Tier C 只能在清单里注明来源与已知 host，不能把 URL 模板写进合并版；如需纳入，必须先解密/抓包核实或找作者要可读版。**混淆不能替代协议提取：缺失的协议混淆也变不出来。**

### 其他注意事项

1. **音质命名先归一化**：`flac24bit` 与 `24bit` 同指 24bit FLAC；`192k`、`hires`、`atmos`、`atmos_plus`、`master`、`spatial` 按后端能力逐一映射，不要只按名字透传。
2. **两种返回形态要分开处理**：① fetch 取 JSON（`code→url/data.url`）；② 直接返回 URL 字符串（changqing、qdy 长青/念心模板、huanyin tx/kw/wy、qdy 星海备、`175.27.166.236` 直链），由洛雪客户端当播放地址请求。
3. **Cookie 依赖**：jiexiang 的 tx/wy 高音质与 sixyin 的网易/QQ 高音质需用户在头注释填 Cookie（`@tx_cookie/@wy_cookie`、`@netease/@tencent`）；合并版要保留 `parseHeader` 机制或降级到无 Cookie 的基准音质。
4. **密钥复用风险**：HYW CARD_KEY、Huibq `X-Request-Key`、oiapi key、ChKsZ apikey、cyapi apikey、lx apiKey+signSalt 均为他人服务共享密钥；合并版复用即复用他人密钥，密钥失效会连带失效，清单中值已略去，不要把自己的 key 写进去。
5. **更新机制只留一个**：各源更新检查有 6 种以上（kstore JSON、m-api.ceseet.me `version.json`、HYW `/api/releases`、ikun `/script/lxmusic`、星海 `versionh2.php`、juhe `init.conf` 内 update）；合并版建议只保留一种（如 GitHub raw 版本文件或沿用 lerd `init.conf` 机制），不要全抄。
6. **qdy 的两个坑**：① `api.huibq.com` 的 key 为占位符，未配置，实际不可用，合并时排除；② 星海备（`music-dl.sayqz.com`）在 qdy 内定义了但未编入 fallback 链，是孤儿后端，合并时按 huanyin 的用法重新接入，不要照抄 qdy 的链。
7. **骨架建议**：helloworld 的 CONFIG 结构本身就是合并形态（一个平台挂多个后端顺序试 + 音质降级链 + 缓存），建议作为合并版可读源码的骨架；jiexiang 的 93 个命名后端是去重后最全的后端清单来源，但其中小后端与官方直连链路需逐个核实。
8. **混淆版发布要求（用户已定，@name 用“音乐源”）**：最终交付除可读合并源码外，还要一份混淆/压缩后的 `latest.js` 作为实际发布文件；混淆方式与原项目类似（字符串加密、变量名混淆），但不能破坏 `globalThis.lx` 注册和 `@name/@version/@author` 注释头（`@preserve` 头注释要保留）。落实要点：① 混淆工具必须白名单保留头注释（`@preserve`）与 lx 注册标识（`globalThis.lx`、`EVENT_NAMES`、`request/on/send`、`inited`/`updateAlert` 等保持明文——原项目混淆源即如此，业务字符串加密，但注册标识明文）；② 混淆版由可读版经构建脚本生成，不手改，两版同构、可互相校验；③ 只有 Tier A（协议已明确）的后端才能写进混淆版，Tier C 的后端因协议本身未提取，混淆也变不出来；④ 去重在可读版完成（同一后端只留一次），混淆版只是同一内容的编码形态，不是去重手段；⑤ 合并源 `@name` 用“音乐源”。

## 附录：后端可达性探测（2026-11-07，根路径 GET /，一次性）

`ok`=2xx，`warn`=有 HTTP 响应但非 2xx（主机存活），`failed`=无响应/超时/断开（单次探测，不能据此判定失效）。

| 主机 | 结果 | 主机 | 结果 | 主机 | 结果 |
|---|---|---|---|---|---|
| 103.79.184.97 | ok 200 | 13413.kstore.vip | warn 404 | 175.27.166.236 | warn 403 |
| 88.lxmusic.xn--fiqs8s | ok 200 | 97.64.37.235 | warn 403 | a.aa.cab | ok 200 |
| anymatch.kuwo.cn | warn 403 | api-v2.yuafeng.cn | failed 超时 | api.317ak.cn | ok 200 |
| api.bugpk.com | ok 200 | api.canxiang.cn | failed 超时 | api.cenguigui.cn | warn 521 |
| api.chksz.com | ok 200 | api.chksz.top | ok 200 | api.huibq.com | failed 连接断开 |
| api.ikunshare.com | failed 连接断开 | api.lingchuan.com | failed 连接断开 | api.liuyunidc.cn | ok 200 |
| api.music.lerd.dpdns.org | ok 200 | api.nki.pw | ok 200 | api.vkeys.cn | ok 200 |
| api.vsaa.cn | failed 连接断开 | api.xcvts.cn | ok 200 | api.xinghai-backend.cn | failed 连接断开 |
| api.xinghai.com | failed 超时 | api.yaohud.cn | ok 200 | api.ygking.cn | failed 连接断开 |
| api.yunmge.com | ok 200 | app.c.nf.migu.cn | ok 200 | c.wwwweb.top | ok 200 |
| cp.chksz.top | ok 200 | cyapi.top | failed 连接断开 | dl.stream.qqmusic.qq.com | warn 403 |
| gc.kxwa.top | failed 连接断开 | gitee.com | ok 200 | github.com | ok 200 |
| img1.kwcdn.kuwo.cn | failed 连接断开 | interface3.music.163.com | ok 200 | isure.stream.qqmusic.qq.com | warn 403 |
| lxmusicapi.onrender.com | ok 200 | m-api.ceseet.me | ok 200 | m.kuwo.cn | warn 500 |
| mcp.nianxinxz.com | warn 520 | mirror.com | failed 超时（碎片误判，非真实主机） | mobi.kuwo.cn | warn 404 |
| music-api.gdstudio.xyz | ok 200 | music-dl.sayqz.com | failed 连接断开 | music.163.com | ok 200 |
| music.haitangw.cc | warn 403 | music.migu.cn | ok 200 | music.nxinxz.com | ok 200 |
| musicapi.haitangw.net | warn 403 | musicserver.haitangw.cc | warn 404 | nmobi.kuwo.cn | warn 404 |
| oiapi.net | ok 200 | proxy.qishui.vsaa.cn | failed 连接断开 | qm.qq.com | warn 403 |
| source.shiqianjiang.cn | ok 200 | t.me | ok 200 | tang.api.s01s.cn | ok 200 |
| u.y.qq.com | warn 404 | ut.y.qq.com | warn 404 | www.kugou.com | ok 200 |
| wwwapi.kugou.com | ok 200 | wyapi.toubiec.cn | ok 200 | y.qq.com | ok 200 |
| yinyue.haitangw.net | ok 200 | ynx.de5.net | failed 连接断开 | yy.zddyr.top | ok 200 |
| zddyr.top | ok 200 | zrcdy.dpdns.org | ok 200 | — | — |

共 71 个主机：38 ok、17 warn、16 failed。
