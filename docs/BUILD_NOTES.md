# 合并版构建说明（BUILD_NOTES）

> 产物：`merged.js`（可读合并源码，1046 行，47,397 字节）。
> 上游：`~/workspace/lx-music-source-upstream`（pdone/lx-music-source，
> commit `000578ddca4a676012cf735abdc3489efdc67c74`）。
> 分析依据：`inventory.md` / `inventory.json`（同目录）。
> 本文件只记录构建过程；不要把本文件当作发布文件。
> 注意：本版是**可读源码**，不是混淆版（混淆由下一步单独做）。

## 1. 合并结果总览

- 平台（6 个）：kw（酷我）、kg（酷狗）、tx（QQ）、wy（网易）、mg（咪咕）、qs（汽水）。
- 音质：kw/kg/tx/wy/mg 各 `128k / 320k / flac / flac24bit`；
  qs 为 `128k / 320k / flac`。
- 后端条目（25 个，按 host + 路径 + 参数模板去重，同一后端只留一次）：
  HYWmusic、海棠 resolve-url、星海聚合主、星海聚合备、GDStudio、Huibq、
  聚合 API、sayqz 直链、ikun、聆川、wwwweb、tang、a.aa.cab、mcp 念心、
  酷我官方、溯音 QQ、溯音 163、溯音酷我、溯音咪咕、xcvts 咪咕、
  长青直链 yinyue、长青直链 175、海棠直链 cc、海棠直链 net、念心直链。
- 每平台一条顺序链（见 `merged.js` 末尾 `CHAINS`），逐个试直到拿到可用 URL，
  全部失败才抛错；单个后端失败只记 `console.warn`，不中断整条链。
- 只处理 `action === 'musicUrl'`，不声明 search / lyric / pic。
- 超时：统一 5000ms（`request` 的 `timeout` 选项 + JS 侧超时兜底）。
- 无 npm 依赖，未用浏览器专属 API（`Buffer` / `btoa` 只在星海 Token 生成里
  作为 `globalThis.lx.utils.buffer` 不可用时的兜底，且包在 try/catch 里）。

## 2. 每个后端协议的来源（逐条核对）

行号指上游文件 `~/workspace/lx-music-source-upstream/<源>/latest.js` 内的行。

| 合并版后端 | 协议来源 | 关键写法 |
|---|---|---|
| HYWmusic（103.79.184.97） | hyw/latest.js L34–35（API_BASE、CARD_KEY `6C1F-53W0-GRKI-EVFG`，上游公开共享密钥，失效可替换）、L112–157（handleGetMusicUrl：GET `/api/music/url`，code 200→url\|\|data\|\|body，401/403/429/500 分支）、L30（MUSIC_QUALITY：mg/qs 仅 128k/320k）；helloworld/latest.js L298（wy 用 `platform=` 参数，此处 source 与 platform 都传，兼容两种写法） | GET，`source` + `platform` + `songId` + `songmid`/`hash`/`name`/`singer`/`albumName` + `quality` + `key`，另附 `X-Card-Key` 请求头 |
| 海棠 resolve-url（musicserver.haitangw.cc） | helloworld/latest.js L18（kw）、L103（kg）、L178（tx）、L231（wy） | POST `/v1/music/resolve-url`，JSON `{ source, rid, level }` → `data.url`；level 见 §3 推断项 |
| 星海聚合主（yy.zddyr.top） | xinghai/latest.js L36–53（URL_CONFIG，主域名 + 路径 `/lx/api/`）、L72（SOURCE_MAP：tx→qq、mg→migu）、L749–806（getUrlFromBackend：kg 附 songmid/albumId/mainHash，其余附 name/singer/songmid/interval/albumName/quality；code 200 + url，403 屏蔽）；helloworld/latest.js L85–110（before() 的 X-Token 生成逻辑，照抄） | GET `/lx/api/?source=&songmid=&quality=`（kg 用 `mainHash`），请求头 `X-Token`（payload `{ device_id, ip: '0.0.0.0', timestamp, random }` 做 base64，5 分钟缓存）+ `X-Client: YYMusicSource/v1.0.0 (Android)` |
| 星海聚合备（zrcdy.dpdns.org） | xinghai/latest.js L36–53（备域名定义）；jiexiang/latest.js L1878–1890（咪咕备后端：路径为 `/lx/api/api.php`） | GET `/lx/api/api.php?source=&songmid=&quality=`，其余同主聚合 |
| GDStudio（music-api.gdstudio.xyz） | qdy/latest.js L15（带 use_xbridge3 等固定参数）、L72–79（QUALITY_TO_BR）、L438–451（`&types=url&source=&id=&br=` → `body.url`） | GET，`source` 为 netease/tencen/kuwo/kugou/migu，br：128k→128、320k→320、flac→740、flac24bit→999 |
| Huibq（lxmusicapi.onrender.com） | huibq/latest.js L8–9（API_URL、API_KEY `share-v3`，上游公开共享密钥）、L27–56（`GET /url/{source}/{id}/{quality}`，songId = hash ?? songmid，code 0→url、1/2/4/5/6 分支） | 仅 128k/320k；请求头 `X-Request-Key: share-v3` |
| 聚合 API（api.music.lerd.dpdns.org） | juhe/latest.js L7（整行压缩源码） | 启动 GET `/init.conf`（失败不阻塞，只影响该后端）；musicUrl 时 POST `/{source}`，body 为整个 info 的 JSON（`{ musicInfo, type }`）；code 200→`data.url`；code 303 按内嵌 `{ request, response }` 二次请求，校验 `response.check.key` 路径值等于 `check.value` 后取 `response.url` 路径值（须以 http 开头） |
| sayqz 直链（music-dl.sayqz.com） | huanyin/latest.js L45–56 | 不发请求，直接返回 URL 字符串：`https://music-dl.sayqz.com/api/?source={qq\|kuwo\|netease}&id&type=url&br=`，tx→qq、kw→kuwo、wy→netease，br 原样传 quality |
| ikun（api.ikunshare.com） | ikun/latest.js L10–11（API_URL、空 API_KEY）、L30–78（`GET /url?source=&songId=&quality=`，songId = hash ?? songmid，code 200→url、403/500/429 分支） | 仅 kw/wy |
| 聆川（api.lingchuan.com） | qdy/latest.js L490–512（`GET /v1/url?source=&songId=&quality=`，songId = hash ?? songmid，code 200→url） | 仅 128k/320k（见 §3：qdy 的 flac 降级做法未采用） |
| wwwweb（c.wwwweb.top，仅 wy） | helloworld/latest.js L207–230 | POST `/music/url`，JSON `{ source: 'wy', musicId, quality }` → code 200 + url；id 取 hash ?? songmid（其 idField 为 `['hash', 'songmid']`） |
| tang（tang.api.s01s.cn，仅 tx） | helloworld/latest.js L158–176 | GET `/music_open_api.php?mid=`；按音质取 `song_play_url_standard`（128k）/ `hq`（320k）/ `sq`（flac）/ `pq`（flac24bit），取不到时兜底遍历全部 `song_play_url_*` 字段 |
| a.aa.cab（仅 tx） | helloworld/latest.js L196–203 | GET `/qq.music?msg={关键词}&n=1&type=`；type：128k→0、320k→1、flac→4（flac24bit 无映射，跳过）；取 `data.music` / `playUrl` / `url` / `data.url` |
| mcp 念心（mcp.nianxinxz.com，仅 wy） | helloworld/latest.js L280–296 | GET `/share/ceshi/wy.php?id=&level=`；level：128k→standard、320k→exhigh、flac→lossless、flac24bit→hires；code 200 + url |
| 酷我官方（nmobi.kuwo.cn，仅 kw） | helloworld/latest.js L34–49 | GET `http://nmobi.kuwo.cn/mobi.s?f=web&user=0&source=kwplayerhd_ar_1.1.4.5_tianbao_T1A_qirui.apk&type=convert_url_with_sign&rid=&br=` → `data.url`；br：128k→128kmp3、320k→320kmp3、flac→2000kflac、flac24bit→4000kflac；注意是 http 明文（照抄上游） |
| 溯音 QQ（oiapi.net） | qdy/latest.js L18（SUYIN_QQ_KEY `oiapi-ef6133b7-ac2f-dc7d-878c-d3e207a82575`，上游公开共享密钥，失效可替换；与 jiexiang/latest.js L601 值一致）、L515–542（多 br 降级重试）、L88–97（br 映射）；jiexiang/latest.js L595–610（同一接口另一写法） | GET `/api/QQ_Music?key=&type=json&br=&n=1&mid=|songid=` → `res.music` \|\| `res.url`，或从 message 解析“音频链接：…”；mid/songid 区分按 qdy L275–284 |
| 溯音 163（oiapi.net） | qdy/latest.js L545–554；jiexiang/latest.js L1051–1065 | GET `/api/Music_163?id=&type=json` → code 0 + `data[0].url`（另兜底 `d.url` / `d.data.url`）；无 key |
| 溯音酷我（oiapi.net） | qdy/latest.js L557–597（含 songInfoMatch 校验与 message 解析）、L341–359（关键词列表）；jiexiang/latest.js L1522–1541 | GET `/api/Kuwo?msg={关键词}&n=1&br=` → `data.url`；br：128k→7、320k→5、flac→1、flac24bit→1 |
| 溯音咪咕（oiapi.net） | helloworld/latest.js L346–352（无 key） | GET `/api/MiGu_Music?msg={歌名}&br=&n=1` → `data.url` \|\| `url`；br：128k→LQ、320k→HQ、flac/flac24bit→SQ |
| xcvts 咪咕（api.xcvts.cn） | huanyin/latest.js L121（fetchMiguUrl）、L162–200（checkMatch）、L227（searchMigu） | GET `/api/music/migu?gm={关键词}&n=1&num=1&type=json` → code 200 + `music_url`；关键词按 歌名+专辑、歌名+歌手、仅歌名 顺序试，前两个做歌名匹配校验 |
| 长青直链 yinyue（yinyue.haitangw.net） | changqing 解码模板（inventory.md §1，长青 v1.3.0；`changqing/latest.js` 本身完全混淆，模板由前序分析解码得到） | 直接返回 URL 字符串；kg：`kg/kg_song_kw.php?id={hash}`，tx：`qq/qq_kw.php`，wy：`wy/wy.php`，kw：`kw/kw.php`，mg：`mg/migu.php`，均为 `?type=mp3&id=&level=` |
| 长青直链 175（175.27.166.236） | qdy/latest.js L29–35（CHANGQING_URL_TEMPLATES，tx/wy 在此 host） | 直接返回 URL 字符串；tx：`kgqq/qq.php`，wy：`wy/wy.php`；http 明文（照抄上游） |
| 海棠直链 cc（music.haitangw.cc） | qdy/latest.js L29–35 | 直接返回 URL 字符串；kg：`kgqq/kg.php`，mg：`musicapi/mg.php` |
| 海棠直链 net（musicapi.haitangw.net） | qdy/latest.js L29–35 | 直接返回 URL 字符串；kw：`music/kw.php` |
| 念心直链（music.nxinxz.com） | qdy/latest.js L38–44（NIANXIN_URL_TEMPLATES） | 直接返回 URL 字符串；tx：`kgqq/tx.php`，wy：`wy.php`，kw：`kw.php`，kg：`kgqq/kg.php`，mg：`mg.php`，均为 `?id=&level=&type=mp3`（wy/kw/mg 为 http 明文，照抄上游） |

直链 level 映射：128k→standard、320k→exhigh、flac/flac24bit→lossless，
来源 qdy qualityToNetease（qdy/latest.js L234–239）与 changqing（inventory.md §1）。

## 3. 协议不一致（发现的问题）与取舍

1. **GDStudio 的 source 参数与固定参数**：qdy（L15、L446）与 xinghai（L734–736，仅 wy）用
   带 `use_xbridge3=true&loader_name=forest&need_sec_link=1&sec_link_scene=im&theme=light`
   的完整参数，source 取 `netease/tencen/kuwo/kugou/migu`；jiexiang 的 tx/kg/mg 版
   （L848–862、L1837–1851、L1907–1921）则用 `source=qq/kg/migu` 且不带 xbridge 参数。
   取舍：按任务要求采用 qdy/xinghai 的完整参数 + `netease/tencen/kuwo/kugou/migu` 写法。
2. **GDStudio mg 的 flac br**：qdy（L72–79）为 `flac→740`；jiexiang mg 版（L1911）为 `flac→1000`。
   取舍：按任务要求统一用 `flac→740`。
3. **溯音 QQ 的 flac24bit br**：qdy 的 `qualityToSuyinQQ`（L244–249）把 flac24bit 映射为
   hires，对应 br 3，再按 `[起点, 4, 5, 7]` 降级重试；jiexiang（L599）直接给 flac24bit→1。
   取舍：采用 qdy 的做法（flac24bit→3，再试 4、5、7）。
4. **xcvts 咪咕的响应字段**：huanyin（L121）取 `data.music_url`；qdy 的溯音咪咕
   （L600–620）取 `res.musicInfo`（且当作 URL 字符串直接返回）。
   取舍：采用 huanyin 的 `music_url`，字段名明确；qdy 的 `musicInfo` 字段含义不明，
   未采用。
5. **星海聚合备的路径**：xinghai 自身只在 URL_CONFIG（L36–53）定义了备域名
   `zrcdy.dpdns.org`，其 `getUrlFromBackend`（L749–806）实际只请求主域名，
   备域名只用于版本检查（L914–918）；jiexiang 咪咕备后端（L1878–1890）显示备路径为
   `/lx/api/api.php`，不是 `/lx/api/`。
   取舍：备聚合用 `https://zrcdy.dpdns.org/lx/api/api.php`，与主聚合分开。
6. **星海 X-Token 的 X-Client**：helloworld 用 `YYMusicSource/v1.0.0 (Android)`；
   xinghai 自身用 `XingHaiMusicSource/v3.2.15 (平台)`（L243–254、L277–280）。
   取舍：按任务要求照抄 helloworld 的做法。
7. **HYW 的 wy 参数名**：hyw（L112–157）用 `source=`；helloworld wy（L298）用 `platform=`。
   取舍：两者都传（`source` 与 `platform` 同值），兼容两种写法。
8. **海棠 resolve-url 的 kw 音质映射**：helloworld kw 的 resolve-url 条目（L18–31）
   只给了 atmos/atmos_plus/master 的映射，未给 128k/320k/flac 的映射
   （其 tryApi 会直接跳过不支持的音质）；kg/tx/wy 则有完整的
   standard/exhigh/lossless/hires 映射。
   取舍：kw 沿用 kg/tx/wy 同一套 level（128k→standard、320k→exhigh、flac→lossless、
   flac24bit→hires），属于按同源规律推断，未在上游 kw 条目里直接看到。
9. **海棠 resolve-url 的 kg flac24bit**：helloworld kg 映射（L103 附近）没有 flac24bit 键，
   只有 hires；tx/wy 的 flac24bit→hires。
   取舍：kg flac24bit 也取 `hires`，与 tx/wy 一致。
10. **聆川的 flac 处理**：qdy（L490–512）用 `selectQuality(quality, ['320k','128k'])`，
    flac/flac24bit 会降级为 320k 再请求。
    取舍：按合并规则不降级透传，flac/flac24bit 直接跳过聆川。
11. **溯音酷我的 flac24bit br**：qdy（L99–105）与 jiexiang（L1526）一致为 1，
    无分歧；qdy 是经 `selectQuality` 把 flac24bit 归到 flac 再取 br 1。
12. **juhe init.conf 的 update 比较**：juhe（L7）把 `data.update.version` 与 lx 客户端
    版本 `v` 比较后发 updateAlert，比较对象疑似有误；合并版只拿 init.conf 做
    best-effort 启动探测，不据此发 updateAlert。
13. **音质降级链**：helloworld 有 `FALLBACK` 音质降级链（master→…→128k）；
    合并版按任务要求不做跨音质降级：某后端不支持某音质时跳过该后端，
    不以低音质冒充请求音质。

## 4. 排除项（逐条写明原因）

- **Tier C 全部**（inventory.md Tier C 节）：
  - fish（`m-api.ceseet.me`）：音乐接口路径/参数/响应全部加密，仅更新地址明确，
    无法写出协议，不硬合并。
  - lx（`88.lxmusic.xn--fiqs8s`）：除域名与签名配置（apiKey/signSalt/fingerprint）
    外协议全部加密，未提取出来。
  - sixyin：协议全部加密，仅知头注释 Cookie 机制，未提取出来。
  - yuningxi（`api-v2.yuafeng.cn` / `ynx.de5.net`）：协议全部加密，仅知注册入口
    与备用地址，未提取出来。
  - flower / grass（`97.64.37.235` + npm 镜像碎片）：URL 拼接仅推测，未验证，
    不写入合并版。
- **Tier B 未核实项**：
  - `api.chksz.top` / `api.chksz.com`（ChKsZ）：.com 与 .top 是否同一服务、参数
    是否一致未核实；且 xinghai 侧 apikey 为空（未配置），不纳入。
  - `api.vkeys.cn`、妖狐（`api.yaohud.cn`）、聆澜（`source.shiqianjiang.cn`）、
    柳云（`api.liuyunidc.cn`）、317ak、nki、笒鬼鬼、bugpk、toubiec、yunmge、
    ygking、cyapi、收集聚合、QQ越权、残像等 jiexiang 独占小后端：
    清单只记录了 host 与后端名，协议未逐条展开，不纳入。
  - 官方直连链路（网易 eapi、QQ `musicu.fcg`、酷我本地直连、酷狗 `play/getdata`、
    咪咕 `getPlayInfo` 等）：需 Cookie/签名/设备参数，不纳入；
    例外是酷我官方 `nmobi.kuwo.cn` 的 `convert_url_with_sign`（helloworld 已给
    出完整明文模板，无需 Cookie），已纳入。
  - `api.xcvts.cn` 的 QQ 端点（`/api/music/qq?apiKey=…`）：jiexiang 侧未展开，
    只纳入了已明确的咪咕端点。
- **qdy 的 `api.huibq.com`**：与 huibq 源的 `lxmusicapi.onrender.com` 不是同一部署，
  其 key 在 qdy 里是占位符 `your_key_here`（qdy/latest.js L24–25），实际不可用，排除；
  Huibq 后端只用 `lxmusicapi.onrender.com` + 公开共享密钥 `share-v3`。
- **汽水 VIP（`api.vsaa.cn` + `proxy.qishui.vsaa.cn`）**：inventory 列为 Tier A，
  但它是 qdy 内独立的 `qsvip` 源（search 驱动 + ekey 代理解密，qdy/latest.js
  L653–692），不是 kw/kg/tx/wy/mg/qs 任一平台的 musicUrl 后端，且不在本次
  要求的纳入清单内，故未纳入；qs 平台由 HYW + 星海聚合主/备覆盖。
- **各源的更新检查**：kstore JSON、HYW `/api/releases`、ikun `/script/lxmusic`、
  星海 `versionh2.php` 等均未抄入合并版（只保留 lerd `init.conf` 的
  best-effort 启动探测，且失败不阻塞）；合并版只有一个版本，不宜保留
  六种互相冲突的更新通道。

## 5. 检查结果

### node --check

```text
$ node --check merged.js
SYNTAX OK
```

### 冒烟测试（最小 globalThis.lx 桩）

桩定义（`/tmp/lx-smoke.js`，未写入仓库）：
`EVENT_NAMES` 为 `{ request, inited, updateAlert }`；`request` 一律回调网络错误
（不真的请求任何音乐接口）；`on`/`send` 只记录事件；`utils.buffer` 用 Node Buffer 实现。

```text
$ node /tmp/lx-smoke.js
inited sent: true
inited.status: true
sources: kw,kg,tx,wy,mg,qs
  kw: actions=musicUrl qualitys=128k,320k,flac,flac24bit
  kg: actions=musicUrl qualitys=128k,320k,flac,flac24bit
  tx: actions=musicUrl qualitys=128k,320k,flac,flac24bit
  wy: actions=musicUrl qualitys=128k,320k,flac,flac24bit
  mg: actions=musicUrl qualitys=128k,320k,flac,flac24bit
  qs: actions=musicUrl qualitys=128k,320k,flac
qs/flac correctly rejected: 全部后端失败(qs/flac): HYWmusic: HYWmusic 不支持 qs/flac | 星海聚合主: stub: network disabled | 星海聚合备: stub: network disabled
kw/128k returned direct URL: https://music-dl.sayqz.com/api/?source=kuwo&id=test123&type=url&br=128k
search correctly rejected: 不支持的操作: search
master quality correctly rejected: 不支持的音质: master
SMOKE DONE
```

结论：

- 脚本能加载，`inited` 正常发出（`status: true`，6 个平台，音质与要求一致）。
- 后端全部不可达时能正确抛错（qs/flac 一例：HYW 跳过 + 星海主/备网络失败 →
  汇总抛错，未卡死、未静默成功）。
- 直链类后端不依赖网络：kw/128k 在前面后端全部失败后，由 sayqz 直链返回
  URL 字符串，符合 huanyin/qdy 的写法。
- 非 musicUrl 动作与未声明音质均被拒绝。
- lerd `init.conf` 启动探测失败时不阻塞加载、不抛未捕获异常。
- 未做真实音乐接口请求，未验证任何后端实际出链；上线前需在洛雪客户端里
  实测各平台/音质的出链情况（各后端可用性以实测为准）。

---

## 6. v1.0.1 构建记录（2026-11-09）

- 上游：`~/workspace/lx-music-source-upstream`（pdone/lx-music-source，
  commit `ed8328dbd1a77aee3ee0116d835eb9d907eeaad2`）。
- 产物：`merged.js`（可读合并源码，1649 行，79,629 字节）、`latest.js`（混淆版，132,323 字节）。
- 平台（6 个，不变）：kw/kg/tx/wy/mg/qs；音质不变。
- 后端条目：25 → **49 个**（新增 24 个，见下表；去重规则不变）。
- 版本：1.0.0 → **1.0.1**（无新增平台，patch 递增）。

### 6.1 新增后端与协议来源

| 合并版后端 | 协议来源 | 关键写法 |
|---|---|---|
| ChKsZ（api.chksz.top，仅 wy） | feichangdao/latest.js L11、L22、L196-206 | GET `/api/163_music?id=&level=`，Referer `https://cp.chksz.top/`；level 128k→standard、320k→exhigh、flac→lossless、flac24bit→jymaster；code 200 + data.url |
| 汽水H5（api.qishui.com，仅 qs/128k） | feichangdao/latest.js L19、L287-296 | GET `/luna/h5/track?track_id=` → `track_player.video_model`（JSON 字符串）→ `video_list[0].main_url`；无音质参数，只挂 qs/128k |
| 迅回QQ（api.xunhuisi.store，仅 tx/128k） | qingliang/latest.js L230-236 | GET `/API/QQMusic/Song.php?mid=&type=json` → code 200 + music_url |
| lzm（music.lzmhhh.com，tx/wy） | qingliang/latest.js L264-266、L283-285 | POST 表单 `/api/music/url { id, type: 'qq' \| 'wy' }`，Referer `https://music.lzmhhh.com/` → data / data.url；tx 128k/320k，wy 仅 320k |
| yutang（api.yutangxiaowu.cn，仅 wy） | qingliang/latest.js L267-269 | GET `/api/music/Song_V1?url=&level=&type=json` → url/data.url；level 128k→standard、320k→exhigh、flac→lossless |
| kangqi（ncm.kangqiovo.com，仅 wy） | qingliang/latest.js L270-272 | POST 表单 `/Song_V1 { url, level, type: json }`，Referer `https://ncm.kangqiovo.com/` → data.url/url |
| qjqq（metings.qjqq.cn，仅 wy） | qingliang/latest.js L273-275 | POST 表单 `/Song_V1 { url, level, type: json }` → data.url/url |
| 酷狗手机版（m.kugou.com，仅 kg） | qingliang/latest.js L292-306 | GET `/app/i/getSongInfo.php?cmd=playInfo&hash=` → url/data.url；无音质参数，挂 kg 链末尾 |
| 酷狗Web版（wwwapi.kugou.com，仅 kg） | qingliang/latest.js L307-322、xinglan 酷狗官方 | GET `/yy/index.php?r=play/getdata&hash=&platid=4&album_id=&mid=00000000000000000000000000000000` → status 1 + data.play_backup_url/data.play_url；无音质参数，挂 kg 链末尾 |
| 网易免费外链（music.163.com，仅 wy/128k） | qingliang/latest.js L394 | 直接返回 URL 字符串 `https://music.163.com/song/media/outer/url?id={id}.mp3` |
| 落月QQ（api.vkeys.cn，仅 tx） | xinglan/latest.js L364-372、L862-905 | v2 `GET /v2/music/tencent/geturl?mid=&quality=` 失败降级 v3 `GET /music/tencent/song/link?mid=&quality=`；quality 128k→6、320k→8、flac→10、flac24bit→10；取 data.url 或 data 字符串 |
| 317ak（api.317ak.cn，仅 tx） | xinglan/latest.js（_u 解码后） | GET `/api/yinyue/qqyinyue?ckey=ZK76QJCIH5PPICJOOXUH&i=&br=&type=json&lrc=1` → url/data.url；br 128k→5、320k→6、flac→8、flac24bit→7；ckey 为上游公开值 |
| ygking（api.ygking.cn，仅 tx） | xinglan/latest.js L737-748（_u 解码后） | GET `/api/song/url?mid=&quality=` → code 0 + data[mid]；quality 128k→128、320k→320、flac→flac、flac24bit→hires |
| 残像（api.canxiang.cn，仅 wy） | xinglan/latest.js L750-769（_u 解码后） | GET `/api/wyymusic?token=canxiang_token_2026&type=&id=`（无 id 时 msg=歌名+歌手&n=1）→ code 200 + data.url；type 128k→128k、320k→320k、flac→flac、flac24bit→hires |
| 笒鬼鬼（api.cenguigui.cn，仅 wy） | xinglan/latest.js（_u 解码后） | GET `/api/netease/music_v1.php?id=&type=json&level=` → data.url/url；level 128k→standard、320k→exhigh、flac→lossless、flac24bit→hires |
| 星海 api.xinghai.com（kw/kg/mg） | xinglan/latest.js L770-789 getXinghai（_u 解码后） | GET `/lx/api/?source={kw\|kg\|migu}&name=&songmid=&quality=` → code 200 + url；quality 128k→128kmp3、320k→320kmp3、flac→flac、flac24bit→hires |
| 酷我流媒体（175.27.166.236:8928，仅 kw） | xinglan/latest.js（_u 解码后） | 直接返回 URL 字符串 `http://175.27.166.236:8928/kwstream?id=&level=&stream=1`；level 128k→128k、320k→320k、flac→flac；flac24bit 跳过（该源映射为 flac，属降级） |
| 酷我手机版（mobi.kuwo.cn，仅 kw） | xinglan/latest.js（_u 解码后） | GET `/mobi.s?f=web&rid=&br=` → code 200 + data.url/data.surl；br 同酷我官方 |
| 念心酷狗（mcp.nianxinxz.com，仅 kg） | xinglan/latest.js L813-825（_u 解码后） | GET `/kgqq/kg.php?id=&level=&type=mp3` → code 200 + url，或直接返回 URL 字符串；level 128k→128kmp3、320k→320kmp3、flac→2000kflac、flac24bit→4000kflac |
| Migu直接源（music.migu.cn，仅 mg） | xinglan/latest.js MG 池（_u 解码后） | GET `/v3/api/music/audioPlayer/getPlayInfo?copyrightId=&level=` → data.playUrl/url/playUrl；level 128k→standard、320k→exhigh、flac/flac24bit→lossless |
| Migu API（app.c.nf.migu.cn，仅 mg） | xinglan/latest.js MG 池（_u 解码后） | GET `/MIGUM2.0/strategy/listen-url/v2.2?copyrightId=&quality=` → data.url/url/data.playUrl；quality 128k→PQ、320k→HQ、flac→SQ、flac24bit→ZQ |
| FishAPI（music.gdstudio.xyz，tx/wy） | xinglan/latest.js L710-735 | 先 GET `/time` 取时间（前 9 位），sign = md5(`music.gdstudio.xyz\|20260510\|time\|secret`) 后 8 位大写，secret = encodeURIComponent(songmid)；POST 表单 `/api.php { types, id, source: qq/netease, br, s }` → body.url；br 128k→128、320k→320、flac→740、flac24bit→999；md5 取 `lx.utils.crypto.md5`，无此工具时后端跳过 |
| FFAPI（ffapi.cn，tx/wy/kw/kg/mg） | xinglan/latest.js L827-860 | GET `/int/v2/songurl?url={平台歌曲页地址}` → url/data.url/data.play_url/data.vipmusic.url/data[0].url；平台页见 merged.js 注释 |
| 海棠 resolve-url-qt（qt.haitangw.net） | xinglan/latest.js L597-603 | 与 musicserver 同路径同参数的第二 host，`POST /v1/music/resolve-url` |

### 6.2 既有后端的改动

1. **星海聚合鉴权（断裂修复）**：xinghai v3.2.18 改为服务器签发令牌，旧本地自签 base64 写法自 2026-11 起一律 403。合并版改用 `GET https://yy.zddyr.top/lx/api/token.php?device_id=` 取 `data.token`（4 分钟本地换新，`auth.tk_mismatch`/`untrusted-token`/`tk_error` 时刷新一次重试；拿不到令牌不发请求；启动时预取一次，失败不阻塞）。`deviceId` 生成方式与旧版相同。
2. **星海聚合备（zrcdy.dpdns.org）**：xinghai v3.2.18 已删除该域名引用，备条目失去上游佐证；仍保留，令牌复用主域名签发的 token（是否被备域名接受未经验证，失败时链内跳过）。
3. **星海聚合 qs 取值**：按 xinghai qs 分支，另取 `data.url`（附 `data.key`）或 `data.source_url`。
4. **wwwweb 放开到 kw/kg**：qingliang（wy/kw/kg）与 xinglan（kw 备用 API）均把同一接口用于 kw；qingliang 另用于 kg。失败时链内跳过。
5. **酷我官方**：另取 `data.surl`（xinglan 取 `data.surl` 优先）。

### 6.3 排除项（v1.0.1 新增）

- yunmge 酷我（`api.yunmge.com`）：URL 内含 token 参数值无法核实，且按码率取“不低于请求值”的逻辑与合并规则不合。
- baimusic QQ（`106.55.0.102`）：AES/RC4/HMAC 自定义加密，密钥依赖、移植成本与收益不合。
- QQ 官方 `musicu.fcg`、网易 eapi：官方接口，需 Cookie 才能拿完整版。
- 云记咪咕 URL 路径重写：跨音质降级链违反“不以低音质冒充请求音质”。
- qingliang 的 `wy-ffapi`（`ffapi.cn/int/v1/netease_url`）与 `wy-bileizhen`（`api.bileizhen.top`）：作者默认关闭，有超时样本。
- search / lyric 均不纳入（feichangdao 的汽水搜索、ChKsZ 搜索、汽水 lyric；suyin 的 kw/mg 搜索）。

### 6.4 待实测裁决（未改动 merged.js）

- 溯音酷我 128k/320k 的 br：suyin 3/2 vs qdy/feichangdao/merged.js 7/5。
- 溯音 QQ flac24bit 的 br：feichangdao 1 vs suyin 回落 7 vs merged.js（qdy）3。
- 星海聚合备域名是否接受服务器令牌；GDStudio 是否要求附带星海服务器令牌。
- kw/flac24bit 经星海聚合的结果（xinghai 已把 kw 高音质降级到 flac）。

### 6.5 检查结果

```text
$ node --check merged.js
SYNTAX OK
$ node --check latest.js
SYNTAX OK
$ node /tmp/lx-smoke.js        # 最小 globalThis.lx 桩，request 一律网络错误
inited sent: true
inited.status: true
sources: kw,kg,tx,wy,mg,qs
  kw: actions=musicUrl qualitys=128k,320k,flac,flac24bit
  kg: actions=musicUrl qualitys=128k,320k,flac,flac24bit
  tx: actions=musicUrl qualitys=128k,320k,flac,flac24bit
  wy: actions=musicUrl qualitys=128k,320k,flac,flac24bit
  mg: actions=musicUrl qualitys=128k,320k,flac,flac24bit
  qs: actions=musicUrl qualitys=128k,320k,flac
qs/flac correctly rejected: 全部后端失败(qs/flac): HYWmusic: HYWmusic 不支持 qs/flac | 星海聚合主: 星海聚合 获取服务器令牌失败 | 星海聚合备: 星海聚合 获取服务器令牌失败 | 汽水H5: 汽水H5 只支持 qs/128k
kw/128k returned direct URL: https://music-dl.sayqz.com/api/?source=kuwo&id=test123&type=url&br=128k
wy/128k returned direct URL: http://yinyue.haitangw.net/wy/wy.php?type=mp3&id=test123&level=standard
search correctly rejected: 不支持的操作: search
master quality correctly rejected: 不支持的音质: master
qs/128k correctly rejected: 全部后端失败(qs/128k): HYWmusic: stub: network disabled | 星海聚合主: 星海聚合 获取服务器令牌失败 | 星海聚合备: 星海聚合 获取服务器令牌失败 | 汽水H5: stub: network disabled
SMOKE DONE
```

混淆版 `latest.js` 用同一桩测过，结果一致（inited 正常、qs/flac 正确抛错、kw/128k 与 wy/128k 直链返回、search/master 被拒绝）。

结论：

- 脚本能加载，`inited` 正常发出（`status: true`，6 个平台，音质与要求一致）。
- 后端全部不可达时能正确抛错（未卡死、未静默成功）；星海聚合在拿不到服务器令牌时直接抛错、不发无效请求。
- 直链类后端不依赖网络：kw/128k 由 sayqz、wy/128k 由长青直链返回 URL 字符串。
- 非 musicUrl 动作与未声明音质均被拒绝。
- lerd `init.conf` 启动探测与星海令牌预取失败时不阻塞加载、不抛未捕获异常。
- 未做真实音乐接口请求，未验证任何后端实际出链；上线前需在洛雪客户端里实测各平台/音质的出链情况（各后端可用性以实测为准）。
