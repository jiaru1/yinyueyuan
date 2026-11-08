# 音乐源

洛雪音乐（lx-music）自定义音源合并版。

上游：[pdone/lx-music-source](https://github.com/pdone/lx-music-source)（commit `ed8328dbd1a77aee3ee0116d835eb9d907eeaad2`）。本项目把上游 20 个音源按**后端地址**去重，整理成一个音源。

## 在线导入

在洛雪音乐「设置 → 自定义源」里导入下面这个链接：

```
https://raw.githubusercontent.com/jiaru1/yinyueyuan/main/latest.js
```

加速链接（GitHub 访问受限时用）：

```
https://ghproxy.net/raw.githubusercontent.com/jiaru1/yinyueyuan/main/latest.js
```

## 这个源是什么

- 名字：**音乐源**，版本 1.0.1，格式与上游一致（`@name / @version / @author` 注释头 + `globalThis.lx` 注册）。
- 支持平台：酷我（kw）、酷狗（kg）、QQ（tx）、网易云（wy）、咪咕（mg）、汽水音乐（qs）。
- 支持音质：128k / 320k / flac / flac24bit（各后端不支持的音质会自动跳过，不硬传）。
- 只做取播放链接（`musicUrl`），不做搜索、歌词、封面。
- 同一个平台挂多个后端，顺序试，拿到可用链接就返回，全部失败才报错。

## 文件说明

- `latest.js`：实际发布的混淆版，导入用这个。
- `src/merged.js`：可读源码，与 `latest.js` 同源，混淆版由它生成，不手改。
- `DEDUP.md`：去重清单，哪些后端留了、哪些去掉了、哪些源没法合并。
- `docs/inventory.md`：20 个源逐个分析的完整清单。
- `docs/BUILD_NOTES.md`：每个后端协议的来源与取舍记录。

## 去重规则

按“后端 host + 路径 + 参数模板”去重，不按源名去重。同一个后端在多个源里出现只留一次，例如 `103.79.184.97` 在 HYW、HelloWorld、杰翔里都出现，合并后只留一份。

去重后共 49 个后端，全部是协议已明确的（Tier A）。详见 `DEDUP.md`。

## 没合并的源

以下 6 个源因文件混淆、接口协议抠不出来，没有硬写进合并版，写进去也是错的：

- fish（`m-api.ceseet.me` 音乐接口协议未提取）
- lx 独家（`88.lxmusic` 签名接口协议未提取）
- sixyin（全部协议未提取）
- yuningxi（`api-v2.yuafeng.cn` 协议未提取）
- flower / grass（URL 拼接仅推测，未验证）

另外排除了 qdy 里的 `api.huibq.com`（密钥是占位符，实际不可用）。完整原因见 `DEDUP.md`。

## 注意事项

- HYW、Huibq、溯音 QQ 用的密钥是上游公开共享密钥，失效可自行替换，位置在 `src/merged.js` 顶部注释里有说明。
- 各后端由第三方提供，某个后端挂了会自动试下一个；如果某平台全部后端都挂了，洛雪会提示取链接失败。
- 本项目只做整理合并，不提供音乐内容，音乐版权归各平台所有。

## 更新

- `latest.js` 由 `src/merged.js` 经混淆生成，两版同构。
- 上游有新版本时，先更新 `src/merged.js`，再重新生成 `latest.js`。
- v1.0.1（2026-11-09）：上游新增 feichangdao、qingliang、suyin、xinglan 4 个源，xinghai 升至 v3.2.18；星海聚合改走服务器签发令牌（旧本地自签写法已失效），新增 24 个后端（见 `DEDUP.md`）。
