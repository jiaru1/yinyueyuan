# 去重清单

上游：[pdone/lx-music-source](https://github.com/pdone/lx-music-source)，commit `ed8328dbd1a77aee3ee0116d835eb9d907eeaad2`（2026-11-09 检查）。
完整分析见 `docs/inventory.md`，构建取舍见 `docs/BUILD_NOTES.md`。

## 去重规则

按“后端 host + 路径 + 参数模板”去重，不按源名去重。同一后端在多个源里出现只留一次。

## 合并后保留的后端（49 个，Tier A，协议已明确）

| 后端 | 覆盖平台 | 来源 |
|---|---|---|
| `103.79.184.97` HYWmusic `/api/music/url` | kw/tx/wy/kg/mg/qs/bili/ytb/xm | hyw、helloworld、jiexiang |
| `yy.zddyr.top` 星海聚合主 `/lx/api/` | tx/wy/kw/kg/mg/qs | xinghai、helloworld、jiexiang |
| `zrcdy.dpdns.org` 星海聚合备 `/lx/api/api.php` | tx/wy/kw/kg/mg | xinghai、jiexiang |
| `musicserver.haitangw.cc` `POST /v1/music/resolve-url` | kw/kg/tx/wy | helloworld、jiexiang |
| `yinyue.haitangw.net` 海棠/长青 php 直链 | kw/kg/tx/wy/mg | changqing、qdy、jiexiang |
| `music.haitangw.cc` 海棠 php 直链 | kw/kg/tx/wy/mg | qdy、jiexiang |
| `musicapi.haitangw.net` 海棠 php 直链 | kw/kg/tx/wy/mg | qdy、jiexiang |
| `music.nxinxz.com` 念心 php 直链 | kw/kg/tx/wy/mg | qdy、jiexiang |
| `175.27.166.236` 长青/念心直链（http 明文） | tx/wy/kw/kg/mg | qdy、jiexiang |
| `lxmusicapi.onrender.com` Huibq `/url/{source}/{id}/{quality}` | kw/kg/tx/wy/mg | huibq、jiexiang |
| `api.music.lerd.dpdns.org` 聚合API `init.conf` + `POST /{source}` | tx/wy/kw/kg/mg | juhe、jiexiang |
| `music-dl.sayqz.com` 直返 URL 字符串 | tx/kw/wy | huanyin、qdy |
| `music-api.gdstudio.xyz` GDStudio `/api.php` | wy/tx/kw/kg/mg | xinghai、jiexiang、qdy |
| `api.ikunshare.com` ikun `/url` | kw/wy | ikun |
| `c.wwwweb.top` `POST /music/url` | wy/kw/kg | helloworld、jiexiang、qingliang、xinglan |
| `tang.api.s01s.cn` QQ `music_open_api.php` | tx | helloworld、jiexiang |
| `api.xcvts.cn` 咪咕 `/api/music/migu` | mg | huanyin、jiexiang、qdy |
| `oiapi.net` 溯音 QQ/网易/酷我/咪咕 | tx/wy/kw/mg | helloworld、jiexiang、qdy |
| `api.lingchuan.com` 聆川 `/v1/url` | wy/tx/kw/kg/mg | qdy |
| `mcp.nianxinxz.com` `wy.php` | wy | helloworld |
| `a.aa.cab` QQ 关键词搜歌 | tx | helloworld |
| `nmobi.kuwo.cn` 酷我官方 `convert_url_with_sign` | kw | helloworld、jiexiang、xinghai |
| `music-dl.sayqz.com`（星海备，qdy 内未编入链，按 huanyin 用法重新接入） | tx/kw/wy | huanyin、qdy |
| `api.vsaa.cn` 汽水 VIP（qs 经 HYW/星海聚合覆盖，未单独编入 musicUrl 链） | qs | qdy、jiexiang |
| `103.79.184.97` `/api/music/info`（歌词/封面函数已实现但不声明） | — | hyw |

### v1.0.1 新增的后端（24 个，2026-11-09 上游检查新增）

| 后端 | 覆盖平台 | 来源 |
|---|---|---|
| `qt.haitangw.net` 海棠 resolve-url 备用 host `POST /v1/music/resolve-url` | kw/kg/tx/wy | xinglan |
| `api.xinghai.com` 星海聚合 `/lx/api/` | kw/kg/mg | xinglan |
| `api.chksz.top` ChKsZ `/api/163_music` | wy | feichangdao |
| `api.qishui.com` 汽水 H5 `/luna/h5/track` | qs（仅 128k） | feichangdao |
| `api.xunhuisi.store` 迅回 QQ `/API/QQMusic/Song.php` | tx（仅 128k） | qingliang |
| `music.lzmhhh.com` lzm `/api/music/url` | tx（128k/320k）、wy（仅 320k） | qingliang |
| `api.yutangxiaowu.cn` yutang `/api/music/Song_V1` | wy | qingliang |
| `ncm.kangqiovo.com` kangqi `/Song_V1` | wy | qingliang |
| `metings.qjqq.cn` qjqq `/Song_V1` | wy | qingliang |
| `m.kugou.com` 酷狗手机版 `getSongInfo.php` | kg（无音质参数，链末兜底） | qingliang |
| `wwwapi.kugou.com` 酷狗 Web 版 `play/getdata` | kg（无音质参数，链末兜底） | qingliang、xinglan |
| `music.163.com` 网易免费外链 `/song/media/outer/url` | wy（仅 128k，直返） | qingliang |
| `api.vkeys.cn` 落月 QQ `v2/geturl` → `v3/song/link` | tx | xinglan |
| `api.317ak.cn` 317ak `/api/yinyue/qqyinyue` | tx | xinglan |
| `api.ygking.cn` ygking `/api/song/url` | tx | xinglan |
| `api.canxiang.cn` 残像 `/api/wyymusic` | wy | xinglan |
| `api.cenguigui.cn` 笒鬼鬼 `/api/netease/music_v1.php` | wy | xinglan |
| `175.27.166.236:8928` 酷我流媒体 `/kwstream` | kw（128k/320k/flac，直返） | xinglan |
| `mobi.kuwo.cn` 酷我手机版 `/mobi.s` | kw | xinglan |
| `mcp.nianxinxz.com` 念心酷狗 `/kgqq/kg.php` | kg | xinglan |
| `music.migu.cn` Migu 直接源 `getPlayInfo` | mg | xinglan |
| `app.c.nf.migu.cn` Migu API `listen-url/v2.2` | mg | xinglan |
| `music.gdstudio.xyz` Fish API `/api.php`（签名请求，需 `lx.utils.crypto.md5`） | tx/wy | xinglan |
| `ffapi.cn` FFAPI `/int/v2/songurl` | tx/wy/kw/kg/mg | xinglan |

注：上表按 host 去重计数，同一 host 的不同路径（如星海聚合主/备）分开计；合计 49 个后端条目。

## 未合并的源（Tier C，混淆导致协议无法提取）

| 源 | 已知 host | 原因 |
|---|---|---|
| fish v1.9.0 | `m-api.ceseet.me` | 仅更新地址明确，音乐接口路径/参数/响应全部加密 |
| lx 独家 v7 | `88.lxmusic.xn--fiqs8s` | 仅域名与签名配置明确，路径/参数/响应全部加密 |
| sixyin v1.2.1 | 未查到具体域名 | 全部加密，仅知头注释 Cookie 机制 |
| yuningxi v1.2.5 | 新版可读层已无 host（旧版 `api-v2.yuafeng.cn` / `ynx.de5.net` 已删） | 路径/参数/响应全部加密，仅知注册取 KEY 入口 |
| flower v1 / grass v1 | `97.64.37.235` | URL 拼接仅推测，未验证 |

## 排除的其他项

- `api.huibq.com`（qdy 的 Huibq 后端）：密钥是占位符未配置，实际不可用。
- Tier B 未核实项（2026-11-09 更新）：`api.chksz.top`、`api.vkeys.cn`、317ak 已由 feichangdao/xinglan 给出完整协议并纳入；其余 jiexiang 独占小后端（妖狐、聆澜、柳云、nki 等）及需 Cookie/签名的官方直连链路（QQ `musicu.fcg`、网易 eapi）仍未纳入。
- `api.xcvts.cn` 的 QQ 端点未展开，只纳入了咪咕端点。
- 汽水 VIP（`api.vsaa.cn`）是 search 驱动 + ekey 代理解密的独立源，未作为任一平台的 musicUrl 后端编入；qs 由 HYW + 星海聚合 + 汽水 H5 覆盖。
- v1.0.1 新排除项：yunmge 酷我（`api.yunmge.com`，URL 内含 token 参数值无法核实，且按码率取“不低于请求值”的逻辑与合并规则不合）；baimusic QQ（`106.55.0.102`，AES/RC4/HMAC 自定义加密，密钥依赖、移植成本与收益不合）；云记咪咕 URL 路径重写（跨音质降级链违反“不以低音质冒充请求音质”）；qingliang 的 `ffapi.cn/int/v1/netease_url` 与 `api.bileizhen.top`（作者默认关闭，有超时样本）。
- 待实测裁决（未改动 merged.js）：溯音酷我 128k/320k 的 br（suyin 给 3/2，qdy/feichangdao/merged.js 给 7/5）；溯音 QQ flac24bit 的 br（feichangdao 给 1，suyin 回落 7，merged.js 按 qdy 给 3）；星海聚合备域名 `zrcdy.dpdns.org` 在 xinghai v3.2.18 中已被删除引用、是否仍接受服务器令牌未知；GDStudio 是否要求附带星海服务器令牌未知。
