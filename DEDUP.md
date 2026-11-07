# 去重清单

上游：[pdone/lx-music-source](https://github.com/pdone/lx-music-source)，commit `000578ddca4a676012cf735abdc3489efdc67c74`。
完整分析见 `docs/inventory.md`，构建取舍见 `docs/BUILD_NOTES.md`。

## 去重规则

按“后端 host + 路径 + 参数模板”去重，不按源名去重。同一后端在多个源里出现只留一次。

## 合并后保留的后端（25 个，Tier A，协议已明确）

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
| `c.wwwweb.top` `POST /music/url` | wy | helloworld、jiexiang |
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

注：上表按 host 去重计数，同一 host 的不同路径（如星海聚合主/备）分开计；合计 25 个后端条目。

## 未合并的源（Tier C，混淆导致协议无法提取）

| 源 | 已知 host | 原因 |
|---|---|---|
| fish v1.9.0 | `m-api.ceseet.me` | 仅更新地址明确，音乐接口路径/参数/响应全部加密 |
| lx 独家 v7 | `88.lxmusic.xn--fiqs8s` | 仅域名与签名配置明确，路径/参数/响应全部加密 |
| sixyin v1.2.1 | 未查到具体域名 | 全部加密，仅知头注释 Cookie 机制 |
| yuningxi v1.2.2 | `api-v2.yuafeng.cn` / `ynx.de5.net` | 路径/参数/响应全部加密，仅知注册取 KEY 入口 |
| flower v1 / grass v1 | `97.64.37.235` | URL 拼接仅推测，未验证 |

## 排除的其他项

- `api.huibq.com`（qdy 的 Huibq 后端）：密钥是占位符未配置，实际不可用。
- Tier B 未核实项：`api.chksz.top/.com`、`api.vkeys.cn`、妖狐、聆澜、柳云、317ak、nki 等 jiexiang 独占小后端，及需 Cookie/签名的官方直连链路。
- `api.xcvts.cn` 的 QQ 端点未展开，只纳入了咪咕端点。
- 汽水 VIP（`api.vsaa.cn`）是 search 驱动 + ekey 代理解密的独立源，未作为任一平台的 musicUrl 后端编入；qs 由 HYW + 星海聚合覆盖。
