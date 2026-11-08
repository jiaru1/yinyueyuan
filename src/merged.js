/*!
 * @name 音乐源
 * @description 由 pdone/lx-music-source 20 个音源按后端去重合并，仅含协议已明确的后端
 * @version 1.0.1
 * @author jiaru1（合并整理）
 * @repository https://github.com/pdone/lx-music-source（上游）
 * @preserve
 *
 * 合并说明：
 * - 格式与上游项目一致：globalThis.lx 注册，musicSources 按平台声明，
 *   只处理 action === 'musicUrl'，不声明 search / lyric / pic。
 * - 去重规则：按“后端 host + 路径 + 参数模板”去重，同一后端只留一次；
 *   同一平台挂多个后端顺序试，拿到可用 URL 即返回，全部失败才抛错。
 * - 直链类后端（music-dl.sayqz.com、海棠/长青/念心 php 直链）直接返回
 *   URL 字符串，由洛雪客户端当播放地址请求，不经过脚本 fetch。
 * - HYW / Huibq / 溯音 QQ / 317ak / 残像的密钥均为上游公开共享密钥，失效可自行替换，
 *   详见各后端注释与 BUILD_NOTES.md。
 * - 星海聚合的令牌由服务端签发（先调 /lx/api/token.php 取 token），本地自签写法已失效。
 * - 音质归一化：flac24bit 与 24bit 统一写 flac24bit；某后端不支持某音质时
 *   该后端跳过该音质，不硬传、不降级透传。
 */

'use strict'

const { EVENT_NAMES, request, on, send, env, version } = globalThis.lx

const TIMEOUT = 5000

// 上游公开共享密钥（失效可替换，来源见 BUILD_NOTES.md）
const HYW_CARD_KEY = '6C1F-53W0-GRKI-EVFG' // HYWmusic 卡密，hyw/latest.js L35
const HUIBQ_KEY = 'share-v3' // Huibq，huibq/latest.js L9
const OIAPI_QQ_KEY = 'oiapi-ef6133b7-ac2f-dc7d-878c-d3e207a82575' // 溯音 QQ，qdy/latest.js L18

// ---------- 平台与音质 ----------

const MUSIC_QUALITY = {
  kw: ['128k', '320k', 'flac', 'flac24bit'],
  kg: ['128k', '320k', 'flac', 'flac24bit'],
  tx: ['128k', '320k', 'flac', 'flac24bit'],
  wy: ['128k', '320k', 'flac', 'flac24bit'],
  mg: ['128k', '320k', 'flac', 'flac24bit'],
  qs: ['128k', '320k', 'flac'],
}

const PLATFORM_NAMES = {
  kw: '酷我音乐',
  kg: '酷狗音乐',
  tx: 'QQ音乐',
  wy: '网易云音乐',
  mg: '咪咕音乐',
  qs: '汽水音乐',
}

const musicSources = {}
Object.keys(MUSIC_QUALITY).forEach((item) => {
  musicSources[item] = {
    name: PLATFORM_NAMES[item],
    type: 'music',
    actions: ['musicUrl'],
    qualitys: MUSIC_QUALITY[item],
  }
})

// ---------- 通用工具 ----------

const isUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v.trim())

const parseBody = (body) => {
  if (typeof body !== 'string') return body
  const trimmed = body.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed) } catch (e) { /* 保持原始字符串 */ }
  }
  return body
}

// 按 'data.url' / 'data.0.url' 取值
const getPath = (obj, path) => {
  if (obj == null || !path) return undefined
  return path.split('.').reduce((val, key) => {
    if (val == null) return undefined
    if (Array.isArray(val)) {
      if (/^\d+$/.test(key)) return val[Number(key)]
      return val.map((v) => (v == null ? undefined : v[key])).find((v) => v != null)
    }
    return val[key]
  }, obj)
}

const extractUrl = (body, paths) => {
  if (isUrl(body)) return body.trim()
  if (body == null || typeof body !== 'object') return null
  for (const p of paths) {
    const v = getPath(body, p)
    if (isUrl(v)) return v.trim()
  }
  return null
}

// lx request 回调风格封装：timeout 选项 + JS 侧超时兜底，返回已解析 body
const httpFetch = (url, options = {}) => new Promise((resolve, reject) => {
  let done = false
  const timeout = options.timeout || TIMEOUT
  const timer = setTimeout(() => {
    if (!done) { done = true; reject(new Error('请求超时(' + timeout + 'ms)')) }
  }, timeout)
  const reqOptions = { method: 'GET', timeout, ...options }
  request(url, reqOptions, (err, resp, bodyArg) => {
    if (done) return
    done = true
    clearTimeout(timer)
    if (err) return reject(err instanceof Error ? err : new Error(String(err)))
    const respBody = (resp && resp.body !== undefined && resp.body !== null) ? resp.body : bodyArg
    resolve({
      statusCode: resp ? resp.statusCode : undefined,
      body: parseBody(respBody),
      rawBody: respBody,
    })
  })
})

const httpGetJson = async (url, headers) => {
  const res = await httpFetch(url, { method: 'GET', headers })
  if (res.statusCode !== undefined && res.statusCode >= 400) {
    throw new Error('HTTP ' + res.statusCode)
  }
  return res.body
}

const httpPostJson = async (url, body, headers) => {
  const res = await httpFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  if (res.statusCode !== undefined && res.statusCode >= 400) {
    throw new Error('HTTP ' + res.statusCode)
  }
  return res.body
}

// ---------- 歌曲 ID 取值 ----------

// 通用：songmid ?? hash ?? id ?? mid ?? rid
const getSongId = (info) => {
  if (!info) return ''
  const v = info.songmid ?? info.hash ?? info.id ?? info.mid ?? info.rid
  return v === undefined || v === null ? '' : String(v)
}

// 按字段顺序取第一个非空值
const getIdByFields = (info, fields) => {
  if (!info) return ''
  for (const f of fields) {
    const v = info[f]
    if (v !== undefined && v !== null && v !== '') return String(v)
  }
  return ''
}

// kw 的 rid 优先用 hash ?? songmid；kg 的 hash 优先用 hash
const getKwRid = (info) => getIdByFields(info, ['hash', 'songmid', 'rid', 'id'])
const getKgId = (info) => getIdByFields(info, ['hash', 'songmid', 'id', 'rid'])

// qdy getPlatformSongId（qdy/latest.js L711-718）：kg 用 hash 优先，tx 用 QQ id，余者 songmid 优先
const getPlatformSongId = (platform, info) => {
  if (!info) return ''
  if (platform === 'kg') return getIdByFields(info, ['hash', 'songmid', 'id', 'rid', 'mid'])
  if (platform === 'tx') {
    const qq = getQQSongId(info)
    if (qq) return String(qq.value)
  }
  return getIdByFields(info, ['songmid', 'id', 'songId', 'rid', 'hash'])
}

// QQ 歌曲 ID：mid（非纯数字字符串）与 songid（纯数字）区分（qdy/latest.js L275-284）
const getQQSongId = (info) => {
  if (!info) return null
  const mid = (info.meta && (info.meta.qq && info.meta.qq.mid)) || (info.meta && info.meta.mid)
    || info.songmid || (typeof info.id === 'string' && !/^\d+$/.test(info.id) ? info.id : null)
  if (mid) return { type: 'mid', value: mid }
  const songid = (info.meta && (info.meta.qq && info.meta.qq.songid)) || (info.meta && info.meta.songid)
    || (typeof info.id === 'number' ? info.id
      : (typeof info.id === 'string' && /^\d+$/.test(info.id) ? Number(info.id) : null))
  if (songid) return { type: 'songid', value: songid }
  return null
}

// ---------- 音质映射 ----------

// php 直链 level：128k→standard、320k→exhigh、flac/flac24bit→lossless
// 来源：qdy qualityToNetease（qdy/latest.js L234-239）、changqing（inventory.md §1）
const qualityToLevel = (quality) => {
  const q = String(quality || '128k').toLowerCase()
  if (q === 'flac' || q === 'flac24bit' || q === 'hires' || q === 'master' || q === 'atmos') return 'lossless'
  if (q === '320k' || q === '192k') return 'exhigh'
  return 'standard'
}

// GDStudio br：128k→128、320k→320、flac→740、flac24bit→999
// 来源：qdy QUALITY_TO_BR（qdy/latest.js L72-79）
const GD_BR_MAP = { '128k': '128', '320k': '320', flac: '740', flac24bit: '999' }
const GD_SOURCE_MAP = { wy: 'netease', tx: 'tencent', kw: 'kuwo', kg: 'kugou', mg: 'migu' }

// ---------- 关键词与匹配（搜索式后端用） ----------

// huanyin clean（huanyin/latest.js L287-295）：去 (Live)、去括号、去空格
const cleanKeyword = (text) => {
  if (!text) return ''
  return String(text)
    .replace(/\(\s*Live\s*\)/gi, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '')
    .trim()
}

// qdy normalizeKeyword（qdy/latest.js L317-326）：去括号/空格/特殊字符，转小写
const normalizeKeyword = (keyword) => {
  if (!keyword) return ''
  return String(keyword)
    .replace(/\(\s*Live\s*\)/gi, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '')
    .replace(/[^\w\u4e00-\u9fa5]/g, '')
    .trim()
    .toLowerCase()
}

const titleMatch = (a, b) => {
  const na = normalizeKeyword(a)
  const nb = normalizeKeyword(b)
  if (!na || !nb) return true
  return na.includes(nb) || nb.includes(na)
}

// qdy buildSearchKeywords（qdy/latest.js L341-359）：歌名+专辑、歌名+歌手、仅歌名
const buildSearchKeywords = (info) => {
  const keywords = []
  const name = info?.name || ''
  const album = info?.albumName || info?.album || ''
  const singer = info?.singer || ''
  if (name && album) {
    const kw = normalizeKeyword(name + album)
    if (kw) keywords.push({ keyword: kw, strict: true })
  }
  if (name && singer) {
    const kw = normalizeKeyword(name + singer)
    if (kw) keywords.push({ keyword: kw, strict: true })
  }
  if (name) {
    const kw = normalizeKeyword(name)
    if (kw) keywords.push({ keyword: kw, strict: false })
  }
  return keywords
}

// huanyin checkMatch（huanyin/latest.js L162-200）：歌名必须对上，专辑/歌手有则对上
const checkMatch = (apiData, musicInfo) => {
  const apiTitle = (apiData.title || '').toLowerCase()
  const apiArtist = (apiData.artist || '').toLowerCase()
  const apiAlbum = (apiData.album || '').toLowerCase()
  const songName = (musicInfo.name || '').toLowerCase()
  const singer = (musicInfo.singer || '').toLowerCase()
  const album = ((musicInfo.albumName || musicInfo.album) || '').toLowerCase()
  if (!apiTitle.includes(songName) && !songName.includes(apiTitle)) return false
  if (album && apiAlbum && !apiAlbum.includes(album) && !album.includes(apiAlbum)) return false
  if (singer && apiArtist && !apiArtist.includes(singer) && !singer.includes(apiArtist)) return false
  return true
}

// qdy songInfoMatch（qdy/latest.js L364-372）：溯音酷我用的歌曲信息匹配
const songInfoMatch = (responseData, musicInfo) => {
  const song = responseData?.song || responseData?.data?.song || ''
  const singer = responseData?.singer || responseData?.data?.singer || ''
  const album = responseData?.album || responseData?.data?.album || ''
  if (!titleMatch(song, musicInfo?.name || '')) return false
  if (musicInfo?.singer && singer && !titleMatch(singer, musicInfo.singer)) return false
  if ((musicInfo?.albumName || musicInfo?.album) && album
    && !titleMatch(album, musicInfo.albumName || musicInfo.album)) return false
  return true
}

// qdy parseMessageSongInfo（qdy/latest.js L387-397）：从溯音返回文本里解析歌名/歌手/专辑
const parseMessageSongInfo = (message) => {
  if (!message) return null
  const result = {}
  for (const line of String(message).split('\n')) {
    if (line.startsWith('歌名：')) result.song = line.replace('歌名：', '').trim()
    if (line.startsWith('歌手：')) result.singer = line.replace('歌手：', '').trim()
    if (line.startsWith('专辑：')) result.album = line.replace('专辑：', '').trim()
  }
  return result.song ? result : null
}

// ---------- 星海聚合服务器令牌 ----------

// xinghai v3.2.18（xinghai/latest.js L188-260）：令牌只能由服务器签发，
// GET https://yy.zddyr.top/lx/api/token.php?device_id={deviceId} → data.token；
// 本地自签 base64 令牌自 2026-11 起服务端一律按 403 处理，旧写法已失效。
// token 有效期 5 分钟，本地 4 分钟换新；响应体 auth.tk_mismatch /
// device_id 'untrusted-token' / tk_error 时刷新一次重试。拿不到令牌不发请求。
// deviceId 生成方式与旧版相同（xinghai/latest.js L171）。
const XINGHAI_TOKEN_TTL = 4 * 60 * 1000
let xinghaiDeviceId = ''
let xinghaiToken = ''
let xinghaiTokenTs = 0
let xinghaiTokenPromise = null
const getXinghaiDeviceId = () => {
  if (!xinghaiDeviceId) {
    xinghaiDeviceId = 'lx-online-' + Math.random().toString(36).substring(2, 8) + Date.now().toString(36).slice(-4)
  }
  return xinghaiDeviceId
}
const fetchXinghaiServerToken = async () => {
  const url = 'https://yy.zddyr.top/lx/api/token.php?device_id=' + encodeURIComponent(getXinghaiDeviceId())
  try {
    const res = await httpFetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'lx-music', 'X-Client': 'YYMusicSource/v1.0.0 (Android)' },
    })
    const tk = res.body && res.body.data && res.body.data.token
    return typeof tk === 'string' ? tk : ''
  } catch (e) {
    return ''
  }
}
const ensureXinghaiToken = async (force) => {
  if (!force && xinghaiToken && (Date.now() - xinghaiTokenTs) <= XINGHAI_TOKEN_TTL) return xinghaiToken
  if (!xinghaiTokenPromise) xinghaiTokenPromise = fetchXinghaiServerToken()
  let tk = ''
  try { tk = await xinghaiTokenPromise } catch (e) { tk = '' }
  xinghaiTokenPromise = null
  if (tk) {
    xinghaiToken = tk
    xinghaiTokenTs = Date.now()
  }
  return xinghaiToken
}
// 服务端判定令牌不可用时返回 true（xinghai/latest.js L225-232）
const xinghaiTokenStale = (body) => {
  const a = body && body.auth
  if (!a) return false
  if (a.tk_mismatch === true) return true
  if (a.device_id === 'untrusted-token' || a.tk_error) return true
  return false
}

// ---------- 后端：HYWmusic（103.79.184.97） ----------

// hyw/latest.js L34-35（API_BASE、CARD_KEY）、L112-157（handleGetMusicUrl）：
// GET /api/music/url?source=&songId=&quality=&key=，同时附 X-Card-Key 请求头；
// code 200 → url || data || body；401/403 鉴权失败；429 请求过速；500 服务器错误。
// helloworld wy 用 platform= 参数（helloworld/latest.js L298），此处 source 与 platform 都传，兼容两种写法。
// 支持音质：kw/tx/wy/kg 为 128k/320k/flac/flac24bit，mg/qs 仅 128k/320k（hyw/latest.js L30）。
const HYW_QUALITY = {
  kw: ['128k', '320k', 'flac', 'flac24bit'],
  tx: ['128k', '320k', 'flac', 'flac24bit'],
  wy: ['128k', '320k', 'flac', 'flac24bit'],
  kg: ['128k', '320k', 'flac', 'flac24bit'],
  mg: ['128k', '320k'],
  qs: ['128k', '320k'],
}
const hywMusicUrl = async (source, musicInfo, quality) => {
  if (!HYW_QUALITY[source] || !HYW_QUALITY[source].includes(quality)) {
    throw new Error('HYWmusic 不支持 ' + source + '/' + quality)
  }
  const songId = getSongId(musicInfo)
  if (!songId) throw new Error('HYWmusic 缺少 songId')
  const params = {
    source,
    platform: source,
    songId,
    songmid: musicInfo.songmid || '',
    hash: musicInfo.hash || '',
    name: musicInfo.name || '',
    singer: musicInfo.singer || '',
    albumName: musicInfo.albumName || musicInfo.album || '',
    quality,
    key: HYW_CARD_KEY,
  }
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => k + '=' + encodeURIComponent(String(v)))
    .join('&')
  const headers = { 'User-Agent': env ? 'lx-music-' + env + '/' + version : 'lx-music-request/' + (version || '1.0.0') }
  if (/^[\x20-\x7E]*$/.test(HYW_CARD_KEY)) headers['X-Card-Key'] = HYW_CARD_KEY
  const body = await httpGetJson('https://103.79.184.97/api/music/url?' + query, headers)
  if (!body || typeof body !== 'object') throw new Error('HYWmusic 空响应')
  switch (body.code) {
    case 200: {
      const url = body.url || body.data || body
      if (isUrl(url)) return url.trim()
      throw new Error('HYWmusic 未返回可用 URL')
    }
    case 401:
    case 403:
      throw new Error(body.message || 'HYWmusic 鉴权失败')
    case 429:
      throw new Error('HYWmusic 请求过速')
    case 500:
      throw new Error(body.message || 'HYWmusic 服务器错误')
    default:
      throw new Error(body.message || ('HYWmusic 未知错误 code=' + body.code))
  }
}

// ---------- 后端：海棠 resolve-url（musicserver.haitangw.cc） ----------

// helloworld/latest.js：kw L18、kg L103、tx L178、wy L231：
// POST /v1/music/resolve-url，JSON { source, rid, level } → data.url。
// level 映射：kg/tx/wy 为 128k→standard、320k→exhigh、flac→lossless、flac24bit→hires；
// kw 在 helloworld 里只给了 atmos 以上音质的映射，128k/320k/flac/flac24bit 沿用 kg/tx/wy
// 同一套 level（见 BUILD_NOTES.md）；mg 无此后端。
const RESOLVE_LEVEL = {
  kw: { '128k': 'standard', '320k': 'exhigh', flac: 'lossless', flac24bit: 'hires' },
  kg: { '128k': 'standard', '320k': 'exhigh', flac: 'lossless', flac24bit: 'hires' },
  tx: { '128k': 'standard', '320k': 'exhigh', flac: 'lossless', flac24bit: 'hires' },
  wy: { '128k': 'standard', '320k': 'exhigh', flac: 'lossless', flac24bit: 'hires' },
}
const makeHaitangResolve = (host) => async (source, musicInfo, quality) => {
  const levelMap = RESOLVE_LEVEL[source]
  if (!levelMap || !levelMap[quality]) throw new Error('海棠 resolve-url 不支持 ' + source + '/' + quality)
  const rid = source === 'kw' ? getKwRid(musicInfo) : getIdByFields(musicInfo, ['hash', 'songmid', 'rid', 'id'])
  if (!rid) throw new Error('海棠 resolve-url 缺少 rid')
  const body = await httpPostJson('https://' + host + '/v1/music/resolve-url',
    { source, rid, level: levelMap[quality] },
    { 'User-Agent': 'Mozilla/5.0' })
  const url = extractUrl(body, ['data.url', 'url'])
  if (url) return url
  throw new Error('海棠 resolve-url 未返回可用 URL')
}
// 主 host musicserver.haitangw.cc（helloworld）；
// 备用 host qt.haitangw.net（xinglan/latest.js L597-603 云记通用接口，同一路径与参数）。
const haitangResolveUrl = makeHaitangResolve('musicserver.haitangw.cc')
const haitangResolveQtUrl = makeHaitangResolve('qt.haitangw.net')

// ---------- 后端：星海聚合（yy.zddyr.top 主 / zrcdy.dpdns.org 备） ----------

// xinghai/latest.js：URL_CONFIG L36-53（主 yy.zddyr.top、备 zrcdy.dpdns.org、路径 /lx/api/）、
// SOURCE_MAP L72（tx→qq、mg→migu，kw/kg/qs 原值，wy 传 wy）、getUrlFromBackend L749-806
// （kg 附 songmid/albumId/mainHash，其余附 name/singer/songmid/interval/albumName/quality；
// code 200 + url，403 屏蔽聚合）。
// 备域名路径按 jiexiang 咪咕备后端写法为 /lx/api/api.php（jiexiang/latest.js L1878-1890），
// 不是 /lx/api/，见 BUILD_NOTES.md。
// 注意：xinghai v3.2.18 已删除备域名引用，备条目失去上游佐证；此处仍保留，
// 令牌复用主域名签发的 token（是否被备域名接受未经验证，失败时链内跳过）。
// qs 分支另取 data.url（附 data.key）或 data.source_url（xinghai/latest.js qs 分支）。
const XINGHAI_SOURCE_MAP = { tx: 'qq', mg: 'migu', kw: 'kw', kg: 'kg', qs: 'qs' }
const makeXinghaiAgg = (host, path) => async (source, musicInfo, quality) => {
  const backendSource = XINGHAI_SOURCE_MAP[source] || source
  const params = {}
  if (backendSource === 'kg') {
    params.source = 'kg'
    params.quality = quality
    params.songmid = musicInfo.songmid || musicInfo.id || ''
    params.albumId = musicInfo.albumId || ''
    params.mainHash = musicInfo.hash || ''
  } else {
    params.source = backendSource
    params.name = musicInfo.name || ''
    params.singer = musicInfo.singer || ''
    params.songmid = musicInfo.songmid || musicInfo.id || ''
    params.interval = musicInfo.interval || ''
    params.albumName = musicInfo.albumName || musicInfo.album || ''
    params.quality = quality
  }
  const query = Object.keys(params)
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&')
  const token = await ensureXinghaiToken()
  if (!token) throw new Error('星海聚合 获取服务器令牌失败')
  const doFetch = async (tk) => httpFetch('https://' + host + path + '?' + query, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'X-Token': tk,
      'X-Client': 'YYMusicSource/v1.0.0 (Android)',
    },
  })
  let res = await doFetch(token)
  if (xinghaiTokenStale(res.body)) {
    xinghaiToken = ''
    xinghaiTokenTs = 0
    const fresh = await ensureXinghaiToken(true)
    if (!fresh) throw new Error('星海聚合 令牌刷新失败')
    res = await doFetch(fresh)
  }
  if (res.statusCode === 403) throw new Error('星海聚合 403')
  if (res.statusCode !== undefined && res.statusCode !== 200) {
    throw new Error('星海聚合 HTTP ' + res.statusCode)
  }
  const body = res.body
  if (!body || typeof body !== 'object' || body.code !== 200) {
    throw new Error('星海聚合：' + ((body && body.msg) || '无数据'))
  }
  if (isUrl(body.url)) return body.url.trim()
  if (body.data && typeof body.data === 'object') {
    let dataUrl = body.data.url
    if (isUrl(dataUrl)) {
      if (body.data.key && !/[?&]key=/.test(dataUrl)) {
        dataUrl += (dataUrl.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(body.data.key)
      }
      return dataUrl.trim()
    }
    if (isUrl(body.data.source_url)) return body.data.source_url.trim()
  }
  throw new Error('星海聚合：' + ((body && body.msg) || '无数据'))
}
const xinghaiAggUrl = makeXinghaiAgg('yy.zddyr.top', '/lx/api/')
const xinghaiAggBackupUrl = makeXinghaiAgg('zrcdy.dpdns.org', '/lx/api/api.php')

// ---------- 后端：GDStudio（music-api.gdstudio.xyz） ----------

// qdy/latest.js L15（带 use_xbridge3 等固定参数）、L72-79（br 映射）、L438-451：
// GET /api.php?use_xbridge3=true&loader_name=forest&need_sec_link=1&sec_link_scene=im
//   &theme=light&types=url&source={netease|tencent|kuwo|kugou|migu}&id=&br= → body.url。
// br：128k→128、320k→320、flac→740、flac24bit→999。
const gdStudioUrl = async (source, musicInfo, quality) => {
  const gdSource = GD_SOURCE_MAP[source]
  const br = GD_BR_MAP[quality]
  if (!gdSource || !br) throw new Error('GDStudio 不支持 ' + source + '/' + quality)
  const id = getSongId(musicInfo)
  if (!id) throw new Error('GDStudio 缺少 songId')
  const url = 'https://music-api.gdstudio.xyz/api.php?use_xbridge3=true&loader_name=forest'
    + '&need_sec_link=1&sec_link_scene=im&theme=light&types=url'
    + '&source=' + encodeURIComponent(gdSource)
    + '&id=' + encodeURIComponent(id) + '&br=' + br
  const body = await httpGetJson(url, { 'User-Agent': 'LX-Music-Mobile', Accept: 'application/json' })
  if (body && body.url) return body.url
  throw new Error('GDStudio：' + ((body && body.message) || '无数据'))
}

// ---------- 后端：Huibq（lxmusicapi.onrender.com） ----------

// huibq/latest.js L8-9（API_URL、API_KEY）、L27-56：
// GET /url/{source}/{id}/{quality}，songId = hash ?? songmid，
// 请求头 X-Request-Key: share-v3（上游公开共享密钥，失效可替换）；
// code 0→url；1 block ip；2 get music url failed；4 internal server error；
// 5 too many requests；6 param error。仅支持 128k/320k。
const huibqUrl = async (source, musicInfo, quality) => {
  if (quality !== '128k' && quality !== '320k') {
    throw new Error('Huibq 不支持音质 ' + quality)
  }
  const songId = musicInfo.hash ?? musicInfo.songmid
  if (!songId) throw new Error('Huibq 缺少 hash/songmid')
  const body = await httpGetJson(
    'https://lxmusicapi.onrender.com/url/' + source + '/' + encodeURIComponent(String(songId)) + '/' + quality,
    {
      'Content-Type': 'application/json',
      'User-Agent': env ? 'lx-music-' + env + '/' + version : 'lx-music-request/' + version,
      'X-Request-Key': HUIBQ_KEY,
    })
  if (!body || isNaN(Number(body.code))) throw new Error('Huibq 返回无效')
  switch (Number(body.code)) {
    case 0:
      if (body.url) return body.url
      throw new Error('Huibq 返回空 URL')
    case 1: throw new Error('Huibq block ip')
    case 2: throw new Error('Huibq get music url failed')
    case 4: throw new Error('Huibq internal server error')
    case 5: throw new Error('Huibq too many requests')
    case 6: throw new Error('Huibq param error')
    default: throw new Error(body.msg || 'Huibq unknown error')
  }
}

// ---------- 后端：聚合 API（api.music.lerd.dpdns.org） ----------

// juhe/latest.js L7（整行压缩源码）：
// 启动 GET /init.conf（code 200 + data.init/data.update），失败不阻塞，只影响该后端；
// musicUrl 时 POST /{source}，body 为整个 info 的 JSON（{ musicInfo, type }）；
// code 200 → data.url；code 303 → 按 data 内嵌 { request, response } 做二次请求，
// 校验 response.check.key 路径值等于 check.value 后取 response.url 路径值（须以 http 开头）。
const LERD_API = 'https://api.music.lerd.dpdns.org'
let lerdInitOk = false
const getNested = (obj, keys) => {
  if (!Array.isArray(keys)) return undefined
  let cur = obj
  for (const k of keys) {
    if (cur == null) return undefined
    cur = cur[k]
  }
  return cur
}
const lerdUrl = async (source, musicInfo, quality) => {
  const body = await httpPostJson(LERD_API + '/' + source, { musicInfo, type: quality })
  if (!body || typeof body !== 'object') throw new Error('聚合API 空响应')
  if (body.code === 200) {
    const url = getPath(body, 'data.url')
    if (isUrl(url)) return url.trim()
    throw new Error('聚合API 未返回可用 URL')
  }
  if (body.code === 303) {
    const data = body.data || {}
    const req2 = data.request || {}
    const resp2 = data.response || {}
    if (!req2.url || !resp2.check || !resp2.url) throw new Error('聚合API 303 数据不完整')
    const res2 = await httpFetch(encodeURI(req2.url), req2.options || { method: 'GET' })
    const checked = getNested(res2.body, resp2.check.key)
    if (checked === resp2.check.value) {
      const url = getNested(res2.body, resp2.url)
      if (isUrl(url)) return url.trim()
    }
    throw new Error('聚合API 303 二次校验失败')
  }
  throw new Error(body.msg || '聚合API失败')
}

// ---------- 后端：music-dl.sayqz.com（直返 URL 字符串） ----------

// huanyin/latest.js L45-56：tx→qq、kw→kuwo、wy→netease，br 原样传 quality；
// 不发请求，直接返回 URL 字符串，由洛雪客户端当播放地址请求。
const SAYQZ_SOURCE_MAP = { tx: 'qq', kw: 'kuwo', wy: 'netease' }
const sayqzUrl = async (source, musicInfo, quality) => {
  const platform = SAYQZ_SOURCE_MAP[source]
  if (!platform) throw new Error('sayqz 不支持 ' + source)
  const songId = musicInfo.songmid || musicInfo.id || musicInfo.mid
  if (!songId) throw new Error('sayqz 缺少 songId')
  return 'https://music-dl.sayqz.com/api/?source=' + platform
    + '&id=' + encodeURIComponent(String(songId))
    + '&type=url&br=' + encodeURIComponent(quality)
}

// ---------- 后端：ikun（api.ikunshare.com） ----------

// ikun/latest.js L10-11（API_URL、空 API_KEY）、L30-78：
// GET /url?source=&songId=&quality=，songId = hash ?? songmid，follow_max 5；
// code 200→url；403 鉴权失败；500→message；429 请求过速。仅 kw/wy。
const ikunUrl = async (source, musicInfo, quality) => {
  if (source !== 'kw' && source !== 'wy') throw new Error('ikun 不支持 ' + source)
  const songId = musicInfo.hash ?? musicInfo.songmid
  if (!songId) throw new Error('ikun 缺少 hash/songmid')
  const body = await httpGetJson(
    'https://api.ikunshare.com/url?source=' + source
    + '&songId=' + encodeURIComponent(String(songId))
    + '&quality=' + encodeURIComponent(quality),
    {
      'Content-Type': 'application/json',
      'User-Agent': env ? 'lx-music-' + env + '/' + version : 'lx-music-request/' + version,
      'X-Request-Key': '',
    })
  if (!body || isNaN(Number(body.code))) throw new Error('ikun 返回无效')
  switch (Number(body.code)) {
    case 200:
      if (body.url) return body.url
      throw new Error('ikun 返回空 URL')
    case 403: throw new Error('ikun Key失效/鉴权失败')
    case 500: throw new Error('ikun 获取URL失败, ' + (body.message || '未知错误'))
    case 429: throw new Error('ikun 请求过速')
    default: throw new Error(body.message || 'ikun 未知错误')
  }
}

// ---------- 后端：聆川（api.lingchuan.com） ----------

// qdy/latest.js L490-512：GET /v1/url?source=&songId=&quality=，songId = hash ?? songmid；
// code 200→url；403/429/500 抛错。qdy 内只传 320k/128k（flac 会降级为 320k），
// 此处按合并规则：flac/flac24bit 直接跳过该后端，不硬传（见 BUILD_NOTES.md）。
const lingchuanUrl = async (source, musicInfo, quality) => {
  if (quality !== '128k' && quality !== '320k') {
    throw new Error('聆川 不支持音质 ' + quality)
  }
  const songId = musicInfo.hash ?? musicInfo.songmid
  if (!songId) throw new Error('聆川 缺少 hash/songmid')
  const body = await httpGetJson(
    'https://api.lingchuan.com/v1/url?source=' + source
    + '&songId=' + encodeURIComponent(String(songId))
    + '&quality=' + encodeURIComponent(quality),
    { 'Content-Type': 'application/json', 'User-Agent': 'LX-Music-Mobile' })
  if (!body || isNaN(Number(body.code))) throw new Error('聆川 返回无效')
  switch (Number(body.code)) {
    case 200:
      if (body.url) return body.url
      throw new Error('聆川 返回空 URL')
    case 403: throw new Error('聆川 403 forbidden')
    case 429: throw new Error('聆川 429 rate limit')
    case 500: throw new Error('聆川 500 ' + (body.message || 'server error'))
    default: throw new Error(body.message || '聆川 未知错误')
  }
}

// ---------- 后端：c.wwwweb.top（仅 wy） ----------

// helloworld/latest.js L207-230：POST /music/url，JSON { source: 'wy', musicId, quality }，
// code 200 + url。id 取 hash ?? songmid（其 idField 为 ['hash', 'songmid']）。
// qingliang/latest.js（jobs，wwwweb 用于 wy/kw/kg）与 xinglan/latest.js
// （HelloWorld KW 备用API，source: 'kw'）均把同一接口用于 kw；
// qingliang 另用于 kg。故本后端放开到 wy/kw/kg，失败时链内跳过。
const wwwwebUrl = async (source, musicInfo, quality) => {
  if (source !== 'wy' && source !== 'kw' && source !== 'kg') throw new Error('wwwweb 只支持 wy/kw/kg')
  const id = getIdByFields(musicInfo, ['hash', 'songmid'])
  if (!id) throw new Error('wwwweb 缺少 id')
  const body = await httpPostJson('https://c.wwwweb.top/music/url',
    { source, musicId: id, quality },
    { 'User-Agent': 'lx-music-desktop/2.10.1' })
  if (body && body.code === 200 && body.url) return body.url
  throw new Error((body && body.message) || 'wwwweb 无数据')
}

// ---------- 后端：tang.api.s01s.cn（仅 tx） ----------

// helloworld/latest.js L158-176：GET /music_open_api.php?mid=，按音质取字段
// 128k→song_play_url_standard、320k→song_play_url_hq、flac→song_play_url_sq、
// flac24bit→song_play_url_pq；取不到时兜底遍历全部 song_play_url_* 字段。
const TANG_FIELD = {
  '128k': 'song_play_url_standard',
  '320k': 'song_play_url_hq',
  flac: 'song_play_url_sq',
  flac24bit: 'song_play_url_pq',
}
const tangUrl = async (source, musicInfo, quality) => {
  if (source !== 'tx') throw new Error('tang 只支持 tx')
  const field = TANG_FIELD[quality]
  if (!field) throw new Error('tang 不支持音质 ' + quality)
  const id = getIdByFields(musicInfo, ['songmid', 'id', 'hash'])
  if (!id) throw new Error('tang 缺少 songmid')
  const body = await httpGetJson(
    'https://tang.api.s01s.cn/music_open_api.php?mid=' + encodeURIComponent(id),
    { 'User-Agent': 'Mozilla/5.0' })
  if (!body || typeof body !== 'object') throw new Error('tang 无响应')
  const fields = [field, 'song_play_url_pq', 'song_play_url_sq', 'song_play_url_hq',
    'song_play_url_standard', 'song_play_url', 'song_play_url_fq']
  for (const f of fields) {
    if (isUrl(body[f])) return body[f].trim()
  }
  throw new Error('tang 无链接')
}

// ---------- 后端：a.aa.cab（仅 tx，按关键词搜歌） ----------

// helloworld/latest.js L196-203：GET /qq.music?msg={关键词}&n=1&type=，
// type 映射 128k→0、320k→1、flac→4（flac24bit 无映射，跳过）；
// 取 data.music / playUrl / url / data.url。
const AACAB_TYPE = { '128k': '0', '320k': '1', flac: '4' }
const aaCabUrl = async (source, musicInfo, quality) => {
  if (source !== 'tx') throw new Error('a.aa.cab 只支持 tx')
  const type = AACAB_TYPE[quality]
  if (type === undefined) throw new Error('a.aa.cab 不支持音质 ' + quality)
  const keyword = musicInfo.name || musicInfo.songname || ''
  if (!keyword) throw new Error('a.aa.cab 缺少歌曲名')
  const body = await httpGetJson(
    'https://a.aa.cab/qq.music?msg=' + encodeURIComponent(keyword) + '&n=1&type=' + type,
    { 'User-Agent': 'Mozilla/5.0' })
  const url = extractUrl(body, ['data.music', 'playUrl', 'url', 'data.url'])
  if (url) return url
  throw new Error('a.aa.cab 无数据')
}

// ---------- 后端：mcp.nianxinxz.com（仅 wy） ----------

// helloworld/latest.js L280-296：GET /share/ceshi/wy.php?id=&level=，
// level 映射 128k→standard、320k→exhigh、flac→lossless、flac24bit→hires；
// code 200 + url。
const MCP_LEVEL = { '128k': 'standard', '320k': 'exhigh', flac: 'lossless', flac24bit: 'hires' }
const mcpUrl = async (source, musicInfo, quality) => {
  if (source !== 'wy') throw new Error('mcp 只支持 wy')
  const level = MCP_LEVEL[quality]
  if (!level) throw new Error('mcp 不支持音质 ' + quality)
  const id = getIdByFields(musicInfo, ['hash', 'songmid', 'id'])
  if (!id) throw new Error('mcp 缺少 id')
  const body = await httpGetJson(
    'https://mcp.nianxinxz.com/share/ceshi/wy.php?id=' + encodeURIComponent(id)
    + '&level=' + level,
    { 'User-Agent': 'Mozilla/5.0' })
  if (body && body.code === 200 && body.url) return body.url
  throw new Error((body && body.message) || 'mcp 无数据')
}

// ---------- 后端：酷我官方 nmobi.kuwo.cn（仅 kw） ----------

// helloworld/latest.js L34-49：
// GET http://nmobi.kuwo.cn/mobi.s?f=web&user=0&source=kwplayerhd_ar_1.1.4.5_tianbao_T1A_qirui.apk
//   &type=convert_url_with_sign&rid=&br= → data.url；
// br 映射 128k→128kmp3、320k→320kmp3、flac→2000kflac、flac24bit→4000kflac。
// 注意是 http 明文（照抄上游写法）。
const KUWO_BR_MAP = { '128k': '128kmp3', '320k': '320kmp3', flac: '2000kflac', flac24bit: '4000kflac' }
const kuwoOfficialUrl = async (source, musicInfo, quality) => {
  if (source !== 'kw') throw new Error('酷我官方 只支持 kw')
  const br = KUWO_BR_MAP[quality]
  if (!br) throw new Error('酷我官方 不支持音质 ' + quality)
  const rid = getKwRid(musicInfo)
  if (!rid) throw new Error('酷我官方 缺少 rid')
  const url = 'http://nmobi.kuwo.cn/mobi.s?f=web&user=0'
    + '&source=kwplayerhd_ar_1.1.4.5_tianbao_T1A_qirui.apk'
    + '&type=convert_url_with_sign&rid=' + encodeURIComponent(rid) + '&br=' + br
  const body = await httpGetJson(url, { 'User-Agent': 'Mozilla/5.0 (Linux; Android) AppleWebKit/537.36' })
  const result = extractUrl(body, ['data.surl', 'data.url', 'url'])
  if (result) return result
  throw new Error('酷我官方 未返回可用 URL')
}

// ---------- 后端：溯音 oiapi.net（QQ / 网易 / 酷我 / 咪咕） ----------

// 密钥为上游公开共享密钥（qdy/latest.js L18、jiexiang/latest.js L601，两处值一致），失效可替换。
// QQ：qdy/latest.js L515-542 + L88-97（br 映射与多 br 降级重试）、jiexiang/latest.js L595-610。
//   GET /api/QQ_Music?key=&type=json&br=&n=1&mid=|songid= → res.music || res.url，
//   或从 message 里解析“音频链接：…”；br 起点 128k→7、320k→5、flac→4、flac24bit→3（经 hires），
//   再按 [起点, 4, 5, 7] 去重升序逐个试。
const OIAPI_QQ_BR = { '128k': 7, '320k': 5, flac: 4, hires: 3, atmos: 2, master: 1, '24bit': 1 }
const qualityToSuyinQQBr = (quality) => {
  const q = String(quality || '128k').toLowerCase()
  if (q === 'flac24bit') return OIAPI_QQ_BR.hires
  return OIAPI_QQ_BR[q] || OIAPI_QQ_BR['128k']
}
const oiapiQQUrl = async (source, musicInfo, quality) => {
  if (source !== 'tx') throw new Error('溯音 QQ 只支持 tx')
  const qqId = getQQSongId(musicInfo)
  if (!qqId) throw new Error('溯音 QQ 缺少 songmid/id')
  const startBr = qualityToSuyinQQBr(quality)
  const brList = [startBr, 4, 5, 7]
    .filter((val, idx, arr) => arr.indexOf(val) === idx && val >= startBr)
    .sort((a, b) => a - b)
  let lastError = null
  for (const br of brList) {
    try {
      const params = { key: OIAPI_QQ_KEY, type: 'json', br, n: 1 }
      if (qqId.type === 'mid') params.mid = qqId.value
      else params.songid = qqId.value
      const query = Object.entries(params)
        .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v))).join('&')
      const body = await httpGetJson('https://oiapi.net/api/QQ_Music?' + query,
        { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' })
      if (body) {
        if (body.music) return body.music
        if (body.url) return body.url
        const fromData = extractUrl(body, ['data.music', 'data.url'])
        if (fromData) return fromData
        if (body.message) {
          const match = String(body.message).match(/音频链接[：:](.+?)(?:\n|$)/)
          if (match && match[1]) return match[1].trim()
        }
      }
      throw new Error('溯音 QQ 未找到音频链接')
    } catch (e) {
      lastError = e
    }
  }
  throw new Error('溯音 QQ 全部音质尝试失败: ' + ((lastError && lastError.message) || 'unknown'))
}

// 网易：qdy/latest.js L545-554、jiexiang/latest.js L1051-1065。
//   GET /api/Music_163?id=&type=json → code 0 + data[0].url（另兜底 d.url / d.data.url）。
const oiapi163Url = async (source, musicInfo, quality) => {
  if (source !== 'wy') throw new Error('溯音 163 只支持 wy')
  const id = musicInfo.songmid || musicInfo.id
  if (!id) throw new Error('溯音 163 缺少 songmid/id')
  const body = await httpGetJson(
    'https://oiapi.net/api/Music_163?id=' + encodeURIComponent(String(id)) + '&type=json',
    { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' })
  if (body && body.code === 0 && body.data) {
    const item = Array.isArray(body.data) ? body.data[0] : body.data
    if (item && item.url) return item.url
  }
  const url = extractUrl(body, ['url', 'data.url'])
  if (url) return url
  throw new Error('溯音 163 获取失败')
}

// 酷我（搜索式）：qdy/latest.js L557-597、jiexiang/latest.js L1522-1541。
//   GET /api/Kuwo?msg={关键词}&n=1&br= → data.url，命中要做歌曲信息匹配校验；
//   br：128k→7、320k→5、flac→1、flac24bit→1。
//   message 里有“音乐链接：…”时也解析，同样要校验。
const OIAPI_KUWO_BR = { '128k': 7, '320k': 5, flac: 1, flac24bit: 1 }
const oiapiKuwoUrl = async (source, musicInfo, quality) => {
  if (source !== 'kw') throw new Error('溯音酷我 只支持 kw')
  if (!musicInfo.name) throw new Error('溯音酷我 需要歌曲名')
  const br = OIAPI_KUWO_BR[quality]
  if (br === undefined) throw new Error('溯音酷我 不支持音质 ' + quality)
  const keywords = buildSearchKeywords(musicInfo)
  let lastError = null
  for (const item of keywords) {
    try {
      const body = await httpGetJson(
        'https://oiapi.net/api/Kuwo?msg=' + encodeURIComponent(item.keyword) + '&n=1&br=' + br,
        { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' })
      if (body && body.data && body.data.url) {
        if (item.strict && !songInfoMatch(body, musicInfo)) throw new Error('溯音酷我 歌曲信息不匹配')
        return body.data.url
      }
      if (body && body.url) {
        if (item.strict && !songInfoMatch(body, musicInfo)) throw new Error('溯音酷我 歌曲信息不匹配')
        return body.url
      }
      if (body && body.message) {
        const match = String(body.message).match(/音乐链接[：:](\S+)/)
        if (match && match[1]) {
          if (item.strict) {
            const parsed = parseMessageSongInfo(body.message)
            if (parsed && !songInfoMatch(parsed, musicInfo)) throw new Error('溯音酷我 歌曲信息不匹配')
          }
          return match[1]
        }
      }
      throw new Error('溯音酷我 未找到链接')
    } catch (e) {
      lastError = e
    }
  }
  throw new Error('溯音酷我 失败: ' + ((lastError && lastError.message) || 'unknown'))
}

// 咪咕：helloworld/latest.js L346-352（溯音 MiGu_Music，无 key）。
//   GET /api/MiGu_Music?msg={歌名}&br=&n=1 → data.url || url；
//   br：128k→LQ、320k→HQ、flac/flac24bit→SQ。
const OIAPI_MIGU_BR = { '128k': 'LQ', '320k': 'HQ', flac: 'SQ', flac24bit: 'SQ' }
const oiapiMiguUrl = async (source, musicInfo, quality) => {
  if (source !== 'mg') throw new Error('溯音咪咕 只支持 mg')
  const br = OIAPI_MIGU_BR[quality]
  if (!br) throw new Error('溯音咪咕 不支持音质 ' + quality)
  const keyword = musicInfo.name || ''
  if (!keyword) throw new Error('溯音咪咕 缺少歌曲名')
  const body = await httpGetJson(
    'https://oiapi.net/api/MiGu_Music?msg=' + encodeURIComponent(keyword) + '&br=' + br + '&n=1',
    { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' })
  const url = extractUrl(body, ['data.url', 'url'])
  if (url) return url
  throw new Error('溯音咪咕 无数据')
}

// ---------- 后端：咪咕 xcvts（api.xcvts.cn） ----------

// huanyin/latest.js L121（fetchMiguUrl）、L227（searchMigu）、L162-200（checkMatch）：
// GET /api/music/migu?gm={关键词}&n=1&num=1&type=json → code 200 + music_url；
// 关键词按 歌名+专辑、歌名+歌手、仅歌名 顺序试，前两个做歌名匹配校验。
// 注意：qdy 同一接口取的是 res.musicInfo 字段，与 huanyin 的 music_url 有出入，
// 此处采用 huanyin 的 music_url（见 BUILD_NOTES.md）。
const xcvtsMiguUrl = async (source, musicInfo, quality) => {
  if (source !== 'mg') throw new Error('xcvts 咪咕 只支持 mg')
  if (!musicInfo.name) throw new Error('xcvts 咪咕 需要歌曲名')
  const songName = musicInfo.name
  const singer = musicInfo.singer || ''
  const album = musicInfo.albumName || musicInfo.album || ''
  const matches = []
  if (album) matches.push({ keyword: cleanKeyword(songName + album), strict: true })
  if (singer) matches.push({ keyword: cleanKeyword(songName + singer), strict: true })
  matches.push({ keyword: cleanKeyword(songName), strict: false })
  let lastError = null
  for (const match of matches) {
    try {
      const body = await httpGetJson(
        'https://api.xcvts.cn/api/music/migu?gm=' + encodeURIComponent(match.keyword)
        + '&n=1&num=1&type=json',
        { 'User-Agent': 'Mozilla/5.0' })
      if (body && body.code === 200 && body.music_url) {
        if (match.strict && !checkMatch(body, musicInfo)) throw new Error('xcvts 咪咕 信息不对')
        return body.music_url
      }
      throw new Error('xcvts 咪咕 没链接')
    } catch (e) {
      lastError = e
    }
  }
  throw new Error('xcvts 咪咕 失败: ' + ((lastError && lastError.message) || 'unknown'))
}

// ---------- 后端：海棠 / 长青 / 念心 php 直链家族（直接返回 URL 字符串） ----------

// 不发请求，直接返回拼好的 php 直链，由洛雪客户端当播放地址请求。
// 模板来源：
// - yinyue.haitangw.net：changqing 解码模板（inventory.md §1，长青 v1.3.0），
//   kg 用 hash，其余用 songmid；level 128k→standard、320k→exhigh、flac/flac24bit→lossless。
// - 175.27.166.236 / music.haitangw.cc / musicapi.haitangw.net：
//   qdy CHANGQING_URL_TEMPLATES（qdy/latest.js L29-35）。
// - music.nxinxz.com：qdy NIANXIN_URL_TEMPLATES（qdy/latest.js L38-44）。
// 注意：175.27.166.236 与念心 wy/kw/mg 为 http 明文（照抄上游写法）。
const DIRECT_TEMPLATES = {
  yinyue: {
    tx: 'http://yinyue.haitangw.net/qq/qq_kw.php?type=mp3&id={id}&level={level}',
    wy: 'http://yinyue.haitangw.net/wy/wy.php?type=mp3&id={id}&level={level}',
    kw: 'http://yinyue.haitangw.net/kw/kw.php?type=mp3&id={id}&level={level}',
    kg: 'http://yinyue.haitangw.net/kg/kg_song_kw.php?type=mp3&id={id}&level={level}',
    mg: 'http://yinyue.haitangw.net/mg/migu.php?type=mp3&id={id}&level={level}',
  },
  ip175: {
    tx: 'http://175.27.166.236/kgqq/qq.php?type=mp3&id={id}&level={level}',
    wy: 'http://175.27.166.236/wy/wy.php?type=mp3&id={id}&level={level}',
  },
  haitangCc: {
    kg: 'https://music.haitangw.cc/kgqq/kg.php?type=mp3&id={id}&level={level}',
    mg: 'https://music.haitangw.cc/musicapi/mg.php?type=mp3&id={id}&level={level}',
  },
  haitangNet: {
    kw: 'https://musicapi.haitangw.net/music/kw.php?type=mp3&id={id}&level={level}',
  },
  nianxin: {
    tx: 'https://music.nxinxz.com/kgqq/tx.php?id={id}&level={level}&type=mp3',
    wy: 'http://music.nxinxz.com/wy.php?id={id}&level={level}&type=mp3',
    kw: 'http://music.nxinxz.com/kw.php?id={id}&level={level}&type=mp3',
    kg: 'https://music.nxinxz.com/kgqq/kg.php?id={id}&level={level}&type=mp3',
    mg: 'http://music.nxinxz.com/mg.php?id={id}&level={level}&type=mp3',
  },
}
const makeDirect = (family) => async (source, musicInfo, quality) => {
  const template = DIRECT_TEMPLATES[family] && DIRECT_TEMPLATES[family][source]
  if (!template) throw new Error('直链 ' + family + ' 不支持 ' + source)
  const id = getPlatformSongId(source, musicInfo)
  if (!id) throw new Error('直链 ' + family + ' 缺少 songId')
  return template
    .replace('{id}', encodeURIComponent(String(id)))
    .replace('{level}', encodeURIComponent(qualityToLevel(quality)))
}

// ---------- 后端：ChKsZ（api.chksz.top，仅 wy） ----------

// feichangdao/latest.js L11（端点）、L22（level 映射）、L196-206：
// GET /api/163_music?id=&level=，请求头 Referer: https://cp.chksz.top/；
// code 200 + data.url。无 key。level：128k→standard、320k→exhigh、
// flac→lossless、flac24bit→jymaster。不抄其 CHKSZ_FALLBACK 跨音质降级链。
const CHKSZ_LEVEL = { '128k': 'standard', '320k': 'exhigh', flac: 'lossless', flac24bit: 'jymaster' }
const chkszUrl = async (source, musicInfo, quality) => {
  if (source !== 'wy') throw new Error('ChKsZ 只支持 wy')
  const level = CHKSZ_LEVEL[quality]
  if (!level) throw new Error('ChKsZ 不支持音质 ' + quality)
  const id = getIdByFields(musicInfo, ['hash', 'songmid', 'id', 'rid', 'songId'])
  if (!id) throw new Error('ChKsZ 缺少 id')
  const body = await httpGetJson(
    'https://api.chksz.top/api/163_music?id=' + encodeURIComponent(id) + '&level=' + level,
    { Referer: 'https://cp.chksz.top/' })
  if (body && body.code === 200 && body.data && body.data.url) return body.data.url
  throw new Error('ChKsZ 无数据')
}

// ---------- 后端：汽水 H5（api.qishui.com，仅 qs/128k） ----------

// feichangdao/latest.js L19、L287-296：
// GET /luna/h5/track?track_id= → track_player.video_model（JSON 字符串）
// → video_list[0].main_url。无 key、无音质参数；qs 只声明 128k，
// 320k/flac 时跳过，不冒充。
const qishuiH5Url = async (source, musicInfo, quality) => {
  if (source !== 'qs' || quality !== '128k') throw new Error('汽水H5 只支持 qs/128k')
  const id = getIdByFields(musicInfo, ['hash', 'songmid', 'id', 'rid', 'songId'])
  if (!id) throw new Error('汽水H5 缺少 id')
  const body = await httpGetJson(
    'https://api.qishui.com/luna/h5/track?track_id=' + encodeURIComponent(id),
    { Accept: 'application/json' })
  let videoModel = null
  try { videoModel = JSON.parse((body && body.track_player && body.track_player.video_model) || '') } catch (e) { videoModel = null }
  const url = videoModel && videoModel.video_list && videoModel.video_list[0] && videoModel.video_list[0].main_url
  if (isUrl(url)) return url.trim()
  throw new Error('汽水H5 无链接')
}

// ---------- 后端：迅回 QQ（api.xunhuisi.store，仅 tx/128k） ----------

// qingliang/latest.js L230-236：
// GET /API/QQMusic/Song.php?mid=&type=json → code 200 + music_url。
const xunhuisiUrl = async (source, musicInfo, quality) => {
  if (source !== 'tx' || quality !== '128k') throw new Error('迅回QQ 只支持 tx/128k')
  const id = getIdByFields(musicInfo, ['songmid', 'mid', 'id', 'hash'])
  if (!id) throw new Error('迅回QQ 缺少 mid')
  const body = await httpGetJson(
    'https://api.xunhuisi.store/API/QQMusic/Song.php?mid=' + encodeURIComponent(id) + '&type=json',
    { 'User-Agent': 'Mozilla/5.0' })
  if (body && Number(body.code) === 200 && typeof body.music_url === 'string' && isUrl(body.music_url)) {
    return body.music_url.trim()
  }
  throw new Error('迅回QQ 无数据')
}

// ---------- 表单 POST 工具 ----------

// form 表单 POST（qingliang 的 formRequest 写法）：
// Content-Type: application/x-www-form-urlencoded，body 为 query 字符串。
const httpPostForm = async (url, values, headers) => {
  const body = Object.keys(values)
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(values[k]))
    .join('&')
  const res = await httpFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(headers || {}) },
    body,
  })
  if (res.statusCode !== undefined && res.statusCode >= 400) {
    throw new Error('HTTP ' + res.statusCode)
  }
  return res.body
}

// ---------- 后端：lzm（music.lzmhhh.com，tx / wy） ----------

// qingliang/latest.js L264-266（qq-lzm）、L283-285（wy-lzm）：
// POST /api/music/url，表单 { id, type: 'qq' | 'wy' }，Referer https://music.lzmhhh.com/；
// 取 data（URL 字符串本身）或 data.url。tx 为 128k/320k；wy 只 320k
// （该接口固定返回其服务端音质，不当作 flac 或低码率专线）。
const lzmUrl = async (source, musicInfo, quality) => {
  const type = source === 'tx' ? 'qq' : source === 'wy' ? 'wy' : null
  if (!type) throw new Error('lzm 不支持 ' + source)
  if (source === 'wy' && quality !== '320k') throw new Error('lzm wy 只支持 320k')
  if (source === 'tx' && quality !== '128k' && quality !== '320k') throw new Error('lzm tx 只支持 128k/320k')
  const id = getIdByFields(musicInfo, ['songmid', 'mid', 'id', 'hash'])
  if (!id) throw new Error('lzm 缺少 id')
  const body = await httpPostForm('https://music.lzmhhh.com/api/music/url',
    { id, type }, { Referer: 'https://music.lzmhhh.com/' })
  const url = extractUrl(body, ['data.url', 'data', 'url'])
  if (url) return url
  throw new Error('lzm 无数据')
}

// ---------- 后端：网易三小接口（yutang / kangqi / qjqq，仅 wy） ----------

// qingliang/latest.js L267-277：level 128k→standard、320k→exhigh、flac→lossless。
// yutang：GET https://api.yutangxiaowu.cn/api/music/Song_V1?url=&level=&type=json → url/data.url。
// kangqi：POST https://ncm.kangqiovo.com/Song_V1，表单 { url, level, type: json }，
//   Referer https://ncm.kangqiovo.com/ → data.url/url。
// qjqq：POST https://metings.qjqq.cn/Song_V1，表单同上 → data.url/url。
const WY_EXTRA_LEVEL = { '128k': 'standard', '320k': 'exhigh', flac: 'lossless' }
const yutangUrl = async (source, musicInfo, quality) => {
  if (source !== 'wy') throw new Error('yutang 只支持 wy')
  const level = WY_EXTRA_LEVEL[quality]
  if (!level) throw new Error('yutang 不支持音质 ' + quality)
  const id = getIdByFields(musicInfo, ['songmid', 'mid', 'id', 'hash'])
  if (!id) throw new Error('yutang 缺少 id')
  const body = await httpGetJson(
    'https://api.yutangxiaowu.cn/api/music/Song_V1?url=' + encodeURIComponent(id)
    + '&level=' + level + '&type=json',
    { 'User-Agent': 'Mozilla/5.0' })
  const url = extractUrl(body, ['url', 'data.url'])
  if (url) return url
  throw new Error('yutang 无数据')
}
const kangqiUrl = async (source, musicInfo, quality) => {
  if (source !== 'wy') throw new Error('kangqi 只支持 wy')
  const level = WY_EXTRA_LEVEL[quality]
  if (!level) throw new Error('kangqi 不支持音质 ' + quality)
  const id = getIdByFields(musicInfo, ['songmid', 'mid', 'id', 'hash'])
  if (!id) throw new Error('kangqi 缺少 id')
  const body = await httpPostForm('https://ncm.kangqiovo.com/Song_V1',
    { url: id, level, type: 'json' }, { Referer: 'https://ncm.kangqiovo.com/' })
  const url = extractUrl(body, ['data.url', 'url'])
  if (url) return url
  throw new Error('kangqi 无数据')
}
const qjqqUrl = async (source, musicInfo, quality) => {
  if (source !== 'wy') throw new Error('qjqq 只支持 wy')
  const level = WY_EXTRA_LEVEL[quality]
  if (!level) throw new Error('qjqq 不支持音质 ' + quality)
  const id = getIdByFields(musicInfo, ['songmid', 'mid', 'id', 'hash'])
  if (!id) throw new Error('qjqq 缺少 id')
  const body = await httpPostForm('https://metings.qjqq.cn/Song_V1',
    { url: id, level, type: 'json' })
  const url = extractUrl(body, ['data.url', 'url'])
  if (url) return url
  throw new Error('qjqq 无数据')
}

// ---------- 后端：酷狗官方两接口（m.kugou.com / wwwapi.kugou.com，仅 kg） ----------

// qingliang/latest.js L292-322（kugouMobile / kugouWebApi）与
// xinglan/latest.js 酷狗官方：均无音质参数，返回的即服务端给的播放地址；
// 按合并规则不以低音质冒充请求音质，故只挂在 kg 链末尾作兜底。
// 手机版：GET https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash= → url/data.url。
// Web 版：GET https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=&platid=4
//   &album_id=&mid=00000000000000000000000000000000 → status 1 + data.play_backup_url/data.play_url。
const kgMobileUrl = async (source, musicInfo, quality) => {
  if (source !== 'kg') throw new Error('酷狗手机版 只支持 kg')
  const hash = getIdByFields(musicInfo, ['hash', 'songmid', 'id'])
  if (!hash) throw new Error('酷狗手机版 缺少 hash')
  const body = await httpGetJson(
    'https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + encodeURIComponent(hash),
    { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36', Referer: 'https://m.kugou.com/' })
  const url = extractUrl(body, ['url', 'data.url'])
  if (url) return url
  throw new Error('酷狗手机版 无数据')
}
const kgWebApiUrl = async (source, musicInfo, quality) => {
  if (source !== 'kg') throw new Error('酷狗Web版 只支持 kg')
  const hash = getIdByFields(musicInfo, ['hash', 'songmid', 'id'])
  if (!hash) throw new Error('酷狗Web版 缺少 hash')
  const albumId = musicInfo.albumId || musicInfo.album_id || musicInfo.albumid || ''
  const body = await httpGetJson(
    'https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=' + encodeURIComponent(hash)
    + '&platid=4&album_id=' + encodeURIComponent(String(albumId))
    + '&mid=00000000000000000000000000000000',
    { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.kugou.com/' })
  if (body && body.status === 1 && body.data) {
    const url = extractUrl(body, ['data.play_backup_url', 'data.play_url'])
    if (url) return url
  }
  throw new Error('酷狗Web版 无数据')
}

// ---------- 后端：网易免费外链（music.163.com，仅 wy/128k） ----------

// qingliang/latest.js L394：直接返回 URL 字符串，不发请求；
// https://music.163.com/song/media/outer/url?id={id}.mp3（128k mp3）。
const neteaseFreeUrl = async (source, musicInfo, quality) => {
  if (source !== 'wy' || quality !== '128k') throw new Error('网易免费外链 只支持 wy/128k')
  const id = getIdByFields(musicInfo, ['songmid', 'mid', 'id', 'hash'])
  if (!id) throw new Error('网易免费外链 缺少 id')
  return 'https://music.163.com/song/media/outer/url?id=' + encodeURIComponent(id) + '.mp3'
}

// ---------- 后端：落月 QQ（api.vkeys.cn，仅 tx） ----------

// xinglan/latest.js L862-905（v4.0.2 主线路）、L364-372（音质映射）：
// 线路1 GET /v2/music/tencent/geturl?mid=&quality=，失败降级线路2
// GET /music/tencent/song/link?mid=&quality=；取 data.url 或 data 字符串本身。
// quality：128k→6、320k→8、flac→10、flac24bit→10。
// （同文件另有一份旧 vkeys 条目用 8/9/10/16…另一套映射，按 host+路径去重只留落月这一份。）
const LUOYUE_QUALITY = { '128k': '6', '320k': '8', flac: '10', flac24bit: '10' }
const luoyueUrl = async (source, musicInfo, quality) => {
  if (source !== 'tx') throw new Error('落月QQ 只支持 tx')
  const q = LUOYUE_QUALITY[quality]
  if (!q) throw new Error('落月QQ 不支持音质 ' + quality)
  const mid = getIdByFields(musicInfo, ['songmid', 'strMediaMid', 'mediaMid', 'id'])
  if (!mid) throw new Error('落月QQ 缺少 mid')
  const paths = [
    'https://api.vkeys.cn/v2/music/tencent/geturl?mid=' + encodeURIComponent(mid) + '&quality=' + q,
    'https://api.vkeys.cn/music/tencent/song/link?mid=' + encodeURIComponent(mid) + '&quality=' + q,
  ]
  let lastError = null
  for (const url of paths) {
    try {
      const body = await httpGetJson(url, { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' })
      const result = extractUrl(body, ['data.url', 'data', 'url'])
      if (result) return result
      throw new Error('落月QQ 未返回有效 URL')
    } catch (e) {
      lastError = e
    }
  }
  throw new Error('落月QQ 两线路均失败: ' + ((lastError && lastError.message) || 'unknown'))
}

// ---------- 后端：317ak（api.317ak.cn，仅 tx） ----------

// xinglan/latest.js（_u 解码后）：
// GET /api/yinyue/qqyinyue?ckey=&i=&br=&type=json&lrc=1 → url/data.url；
// br：128k→5、320k→6、flac→8、flac24bit→7。ckey 为上游公开值（同 HYW 卡密类共享密钥）。
const AK317_BR = { '128k': '5', '320k': '6', flac: '8', flac24bit: '7' }
const ak317Url = async (source, musicInfo, quality) => {
  if (source !== 'tx') throw new Error('317ak 只支持 tx')
  const br = AK317_BR[quality]
  if (!br) throw new Error('317ak 不支持音质 ' + quality)
  const id = getIdByFields(musicInfo, ['songmid', 'id', 'hash'])
  if (!id) throw new Error('317ak 缺少 songmid')
  const body = await httpGetJson(
    'https://api.317ak.cn/api/yinyue/qqyinyue?ckey=ZK76QJCIH5PPICJOOXUH&i=' + encodeURIComponent(id)
    + '&br=' + br + '&type=json&lrc=1',
    { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' })
  const url = extractUrl(body, ['url', 'data.url'])
  if (url) return url
  throw new Error('317ak 无数据')
}

// ---------- 后端：ygking QQ（api.ygking.cn，仅 tx） ----------

// xinglan/latest.js L737-748（_u 解码后）：
// GET /api/song/url?mid=&quality= → code 0 + data[mid]；
// quality：128k→128、320k→320、flac→flac、flac24bit→hires。
const YGKING_QUALITY = { '128k': '128', '320k': '320', flac: 'flac', flac24bit: 'hires' }
const ygkingUrl = async (source, musicInfo, quality) => {
  if (source !== 'tx') throw new Error('ygking 只支持 tx')
  const q = YGKING_QUALITY[quality]
  if (!q) throw new Error('ygking 不支持音质 ' + quality)
  const mid = getIdByFields(musicInfo, ['songmid', 'strMediaMid', 'mediaMid', 'id'])
  if (!mid) throw new Error('ygking 缺少 mid')
  const body = await httpGetJson(
    'https://api.ygking.cn/api/song/url?mid=' + encodeURIComponent(mid) + '&quality=' + q,
    { 'User-Agent': 'Mozilla/5.0' })
  if (body && body.code === 0 && body.data && isUrl(body.data[mid])) return body.data[mid].trim()
  throw new Error('ygking 失败')
}

// ---------- 后端：残像 WY（api.canxiang.cn，仅 wy） ----------

// xinglan/latest.js L750-769（_u 解码后）：
// GET /api/wyymusic?token=canxiang_token_2026&type=&id=（无 id 时 msg=歌名+歌手&n=1）
// → code 200 + data.url；type：128k→128k、320k→320k、flac→flac、flac24bit→hires。
const CANXIANG_TYPE = { '128k': '128k', '320k': '320k', flac: 'flac', flac24bit: 'hires' }
const canxiangUrl = async (source, musicInfo, quality) => {
  if (source !== 'wy') throw new Error('残像 只支持 wy')
  const type = CANXIANG_TYPE[quality]
  if (!type) throw new Error('残像 不支持音质 ' + quality)
  const params = { token: 'canxiang_token_2026', type }
  const id = getIdByFields(musicInfo, ['songId', 'id', 'songmid'])
  if (id) params.id = id
  else {
    const name = musicInfo.name || musicInfo.songName || ''
    const singer = musicInfo.singer || ''
    if (!name) throw new Error('残像 缺少 id 或歌名')
    params.msg = singer ? name + ' ' + singer : name
    params.n = 1
  }
  const query = Object.keys(params)
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&')
  const body = await httpGetJson('https://api.canxiang.cn/api/wyymusic?' + query,
    { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' })
  if (body && body.code === 200 && body.data && body.data.url) return body.data.url
  throw new Error('残像 失败')
}

// ---------- 后端：笒鬼鬼（api.cenguigui.cn，仅 wy） ----------

// xinglan/latest.js（_u 解码后）：
// GET /api/netease/music_v1.php?id=&type=json&level= → data.url/url；
// level：128k→standard、320k→exhigh、flac→lossless、flac24bit→hires。
const cenguiguiUrl = async (source, musicInfo, quality) => {
  if (source !== 'wy') throw new Error('笒鬼鬼 只支持 wy')
  const level = WY_EXTRA_LEVEL[quality] || (quality === 'flac24bit' ? 'hires' : null)
  if (!level) throw new Error('笒鬼鬼 不支持音质 ' + quality)
  const id = getIdByFields(musicInfo, ['songmid', 'id', 'hash'])
  if (!id) throw new Error('笒鬼鬼 缺少 id')
  const body = await httpGetJson(
    'https://api.cenguigui.cn/api/netease/music_v1.php?id=' + encodeURIComponent(id)
    + '&type=json&level=' + level,
    { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' })
  const url = extractUrl(body, ['data.url', 'url'])
  if (url) return url
  throw new Error('笒鬼鬼 无数据')
}

// ---------- 后端：星海 api.xinghai.com（kw / kg / mg） ----------

// xinglan/latest.js L770-789 getXinghai（_u 解码后）：
// GET /lx/api/?source={kw|kg|migu}&name={歌名 歌手}&songmid=&quality= → code 200 + url；
// quality：128k→128kmp3、320k→320kmp3、flac→flac、flac24bit→hires。
// 与 yy.zddyr.top 的星海聚合不是同一 host，按去重规则单列。
const XINGHAI_API_SOURCE_MAP = { kw: 'kw', kg: 'kg', mg: 'migu' }
const XINGHAI_API_QUALITY = { '128k': '128kmp3', '320k': '320kmp3', flac: 'flac', flac24bit: 'hires' }
const xinghaiApiUrl = async (source, musicInfo, quality) => {
  const backendSource = XINGHAI_API_SOURCE_MAP[source]
  const qualityParam = XINGHAI_API_QUALITY[quality]
  if (!backendSource || !qualityParam) throw new Error('星海api.xinghai.com 不支持 ' + source + '/' + quality)
  const id = source === 'kg'
    ? getIdByFields(musicInfo, ['hash', 'songmid', 'id'])
    : getIdByFields(musicInfo, ['songmid', 'rid', 'id', 'hash'])
  if (!id) throw new Error('星海api.xinghai.com 缺少 id')
  const name = ((musicInfo.name || '') + ' ' + (musicInfo.singer || '')).trim()
  const url = 'https://api.xinghai.com/lx/api/?source=' + backendSource
    + '&name=' + encodeURIComponent(name)
    + '&songmid=' + encodeURIComponent(id)
    + '&quality=' + qualityParam
  const body = await httpGetJson(url, { 'User-Agent': 'Mozilla/5.0' })
  if (body && body.code === 200 && body.url) return body.url
  throw new Error('星海api.xinghai.com 失败')
}

// ---------- 后端：酷我流媒体（175.27.166.236:8928，仅 kw，直接返回 URL 字符串） ----------

// xinglan/latest.js（_u 解码后）：
// http://175.27.166.236:8928/kwstream?id=&level=&stream=1（音频流型地址，
// 由洛雪客户端当播放地址请求）；level：128k→128k、320k→320k、flac→flac。
// flac24bit 在该源里映射为 flac，属降级，不纳入（该音质跳过本后端）。
const KWSTREAM_LEVEL = { '128k': '128k', '320k': '320k', flac: 'flac' }
const kwstreamUrl = async (source, musicInfo, quality) => {
  if (source !== 'kw') throw new Error('酷我流媒体 只支持 kw')
  const level = KWSTREAM_LEVEL[quality]
  if (!level) throw new Error('酷我流媒体 不支持音质 ' + quality)
  const id = getIdByFields(musicInfo, ['songmid', 'id', 'hash', 'songId', 'musicId'])
  if (!id) throw new Error('酷我流媒体 缺少 id')
  return 'http://175.27.166.236:8928/kwstream?id=' + encodeURIComponent(id)
    + '&level=' + level + '&stream=1'
}

// ---------- 后端：酷我手机版（mobi.kuwo.cn，仅 kw） ----------

// xinglan/latest.js（_u 解码后）：
// GET https://mobi.kuwo.cn/mobi.s?f=web&rid=&br= → code 200 + data.url/data.surl；
// br：128k→128kmp3、320k→320kmp3、flac→2000kflac、flac24bit→4000kflac。
// 与 nmobi.kuwo.cn 的酷我官方不是同一 host，单列。
const kuwoMobileUrl = async (source, musicInfo, quality) => {
  if (source !== 'kw') throw new Error('酷我手机版 只支持 kw')
  const br = KUWO_BR_MAP[quality]
  if (!br) throw new Error('酷我手机版 不支持音质 ' + quality)
  const rid = getIdByFields(musicInfo, ['songmid', 'rid', 'hash', 'id'])
  if (!rid) throw new Error('酷我手机版 缺少 rid')
  const body = await httpGetJson(
    'https://mobi.kuwo.cn/mobi.s?f=web&rid=' + encodeURIComponent(rid) + '&br=' + br,
    { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36' })
  const url = extractUrl(body, ['data.url', 'data.surl'])
  if (url) return url
  throw new Error('酷我手机版 无数据')
}

// ---------- 后端：念心酷狗（mcp.nianxinxz.com，仅 kg） ----------

// xinglan/latest.js L813-825 getNianxinKg（_u 解码后）：
// GET /kgqq/kg.php?id=&level=&type=mp3 → code 200 + url，或直接返回 URL 字符串；
// level：128k→128kmp3、320k→320kmp3、flac→2000kflac、flac24bit→4000kflac。
// 与 music.nxinxz.com 的念心直链不是同一 host，单列。
const NIANXIN_KG_LEVEL = { '128k': '128kmp3', '320k': '320kmp3', flac: '2000kflac', flac24bit: '4000kflac' }
const nianxinKgUrl = async (source, musicInfo, quality) => {
  if (source !== 'kg') throw new Error('念心酷狗 只支持 kg')
  const level = NIANXIN_KG_LEVEL[quality]
  if (!level) throw new Error('念心酷狗 不支持音质 ' + quality)
  const hash = getIdByFields(musicInfo, ['hash', 'songmid', 'id'])
  if (!hash) throw new Error('念心酷狗 缺少 hash')
  const res = await httpFetch(
    'https://mcp.nianxinxz.com/kgqq/kg.php?id=' + encodeURIComponent(hash)
    + '&level=' + level + '&type=mp3',
    { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } })
  const body = res.body
  if (typeof body === 'string' && isUrl(body)) return body.trim()
  if (body && body.code === 200 && body.url) return body.url
  throw new Error('念心酷狗 失败')
}

// ---------- 后端：咪咕官方两接口（music.migu.cn / app.c.nf.migu.cn，仅 mg） ----------

// xinglan/latest.js MG 池（_u 解码后），无 Cookie/签名，协议完整：
// Migu直接源：GET https://music.migu.cn/v3/api/music/audioPlayer/getPlayInfo
//   ?copyrightId=&level= → data.playUrl/url/playUrl；
//   level：128k→standard、320k→exhigh、flac/flac24bit→lossless。
// Migu API：GET https://app.c.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.2
//   ?copyrightId=&quality= → data.url/url/data.playUrl；
//   quality：128k→PQ、320k→HQ、flac→SQ、flac24bit→ZQ。
const getMiguId = (musicInfo) => getIdByFields(musicInfo, ['copyrightId', 'songmid', 'id', 'hash'])
const miguDirectUrl = async (source, musicInfo, quality) => {
  if (source !== 'mg') throw new Error('Migu直接源 只支持 mg')
  const level = qualityToLevel(quality)
  const id = getMiguId(musicInfo)
  if (!id) throw new Error('Migu直接源 缺少 id')
  const body = await httpGetJson(
    'https://music.migu.cn/v3/api/music/audioPlayer/getPlayInfo?copyrightId=' + encodeURIComponent(id)
    + '&level=' + level,
    { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Referer: 'https://music.migu.cn/' })
  const url = extractUrl(body, ['data.playUrl', 'url', 'playUrl'])
  if (url) return url
  throw new Error('Migu直接源 无数据')
}
const MIGU_API_QUALITY = { '128k': 'PQ', '320k': 'HQ', flac: 'SQ', flac24bit: 'ZQ' }
const miguApiUrl = async (source, musicInfo, quality) => {
  if (source !== 'mg') throw new Error('Migu API 只支持 mg')
  const level = MIGU_API_QUALITY[quality]
  if (!level) throw new Error('Migu API 不支持音质 ' + quality)
  const id = getMiguId(musicInfo)
  if (!id) throw new Error('Migu API 缺少 id')
  const body = await httpGetJson(
    'https://app.c.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.2?copyrightId=' + encodeURIComponent(id)
    + '&quality=' + level,
    { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36', Referer: 'https://app.c.nf.migu.cn/' })
  const url = extractUrl(body, ['data.url', 'url', 'data.playUrl'])
  if (url) return url
  throw new Error('Migu API 无数据')
}

// ---------- 后端：Fish API（music.gdstudio.xyz，tx / wy，签名请求） ----------

// xinglan/latest.js L710-735（Fish API）：
// 先 GET https://music.gdstudio.xyz/time 取服务端时间，timeStr 取前 9 位数字；
// sign = md5('music.gdstudio.xyz|20260510|' + timeStr + '|' + secret).slice(-8).toUpperCase()，
// secret 为 encodeURIComponent(songmid)；
// 再 POST 表单到 https://music.gdstudio.xyz/api.php，
// { types: 'url', id: songmid, source: 'qq' | 'netease', br, s: sign } → body.url。
// br：128k→128、320k→320、flac→740、flac24bit→999。
// md5 取 globalThis.lx.utils.crypto.md5（洛雪客户端提供）；无此工具时本后端跳过。
const FISH_DOMAIN = 'music.gdstudio.xyz'
const FISH_VERSION = '20260510'
const FISH_BR_MAP = { '128k': 128, '320k': 320, flac: 740, flac24bit: 999 }
const cleanFishUrl = (url) => String(url || '')
  .replace(/\\?u0026/gi, '&')
  .replace(/\\&/g, '&')
  .replace(/\\$/, '&')
const fishSign = async (secret) => {
  const md5 = globalThis.lx && globalThis.lx.utils && globalThis.lx.utils.crypto && globalThis.lx.utils.crypto.md5
  if (typeof md5 !== 'function') throw new Error('FishAPI 需要 lx.utils.crypto.md5')
  let timeStr = ''
  try {
    const res = await httpFetch('https://' + FISH_DOMAIN + '/time', { method: 'GET' })
    timeStr = String(Number(res.body) || Date.now()).slice(0, 9)
  } catch (e) {
    timeStr = String(Date.now()).slice(0, 9)
  }
  const signInput = FISH_DOMAIN + '|' + FISH_VERSION + '|' + timeStr + '|' + secret
  return md5(signInput).slice(-8).toUpperCase()
}
const fishApiUrl = async (source, musicInfo, quality) => {
  const fishSource = source === 'tx' ? 'qq' : source === 'wy' ? 'netease' : null
  const br = FISH_BR_MAP[quality]
  if (!fishSource || !br) throw new Error('FishAPI 不支持 ' + source + '/' + quality)
  const songmid = getIdByFields(musicInfo, ['songmid', 'id', 'hash'])
  if (!songmid) throw new Error('FishAPI 缺少 songmid')
  const sign = await fishSign(encodeURIComponent(songmid))
  const body = await httpPostForm('https://' + FISH_DOMAIN + '/api.php',
    { types: 'url', id: songmid, source: fishSource, br, s: sign },
    {
      Origin: 'https://' + FISH_DOMAIN,
      Referer: 'https://' + FISH_DOMAIN + '/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'X-Requested-With': 'XMLHttpRequest',
    })
  const url = body && body.url ? cleanFishUrl(body.url) : ''
  if (isUrl(url)) return url.trim()
  throw new Error('FishAPI 无数据')
}

// ---------- 后端：FFAPI（ffapi.cn，tx / wy / kw / kg / mg） ----------

// xinglan/latest.js L827-860 getFFAPI：
// GET https://ffapi.cn/int/v2/songurl?url={平台歌曲页地址} → 取 url 字段；
// 平台页：tx y.qq.com/n/ryqq/songDetail/{id}、wy music.163.com/song?id={id}、
// kw www.kuwo.cn/play_detail/{id}、kg www.kugou.com/song/#hash={id}、
// mg music.migu.cn/v3/music/song/{id}。
const FFAPI_PAGE = {
  tx: (id) => 'https://y.qq.com/n/ryqq/songDetail/' + id,
  wy: (id) => 'https://music.163.com/song?id=' + id,
  kw: (id) => 'https://www.kuwo.cn/play_detail/' + id,
  kg: (id) => 'https://www.kugou.com/song/#hash=' + id,
  mg: (id) => 'https://music.migu.cn/v3/music/song/' + id,
}
const ffapiUrl = async (source, musicInfo, quality) => {
  const page = FFAPI_PAGE[source]
  if (!page) throw new Error('FFAPI 不支持 ' + source)
  const id = source === 'kw' ? getKwRid(musicInfo)
    : source === 'kg' ? getKgId(musicInfo)
    : getSongId(musicInfo)
  if (!id) throw new Error('FFAPI 缺少 id')
  const body = await httpGetJson(
    'https://ffapi.cn/int/v2/songurl?url=' + encodeURIComponent(page(id)),
    { 'User-Agent': 'Mozilla/5.0' })
  const data = typeof body === 'string' ? parseBody(body) : body
  const url = extractUrl(data, ['url', 'data.url', 'data.play_url', 'data.vipmusic.url'])
  if (url) return url
  if (data && Array.isArray(data.data) && data.data[0]) {
    if (isUrl(data.data[0])) return data.data[0].trim()
    if (isUrl(data.data[0].url)) return data.data[0].url.trim()
  }
  if (typeof data === 'string' && isUrl(data)) return data.trim()
  if (data && typeof data.data === 'string' && isUrl(data.data)) return data.data.trim()
  throw new Error('FFAPI 无数据')
}

// ---------- 后端注册与每平台顺序链 ----------

// 同一后端只出现一次；链内某后端不支持某平台/音质时抛错跳过，继续下一个。
const BACKENDS = {
  hyw: { name: 'HYWmusic', run: hywMusicUrl },
  haitangResolve: { name: '海棠resolve-url', run: haitangResolveUrl },
  haitangResolveQt: { name: '海棠resolve-url-qt', run: haitangResolveQtUrl },
  xinghaiAgg: { name: '星海聚合主', run: xinghaiAggUrl },
  xinghaiAggBackup: { name: '星海聚合备', run: xinghaiAggBackupUrl },
  xinghaiApi: { name: '星海api.xinghai.com', run: xinghaiApiUrl },
  gd: { name: 'GDStudio', run: gdStudioUrl },
  huibq: { name: 'Huibq', run: huibqUrl },
  lerd: { name: '聚合API', run: lerdUrl },
  sayqz: { name: 'sayqz直链', run: sayqzUrl },
  ikun: { name: 'ikun', run: ikunUrl },
  lingchuan: { name: '聆川', run: lingchuanUrl },
  wwwweb: { name: 'wwwweb', run: wwwwebUrl },
  tang: { name: 'tang', run: tangUrl },
  aaCab: { name: 'a.aa.cab', run: aaCabUrl },
  mcp: { name: 'mcp念心', run: mcpUrl },
  kuwoOfficial: { name: '酷我官方', run: kuwoOfficialUrl },
  kuwoMobile: { name: '酷我手机版', run: kuwoMobileUrl },
  kwstream: { name: '酷我流媒体', run: kwstreamUrl },
  oiapiQQ: { name: '溯音QQ', run: oiapiQQUrl },
  oiapi163: { name: '溯音163', run: oiapi163Url },
  oiapiKuwo: { name: '溯音酷我', run: oiapiKuwoUrl },
  oiapiMigu: { name: '溯音咪咕', run: oiapiMiguUrl },
  xcvtsMigu: { name: 'xcvts咪咕', run: xcvtsMiguUrl },
  chksz: { name: 'ChKsZ', run: chkszUrl },
  canxiang: { name: '残像', run: canxiangUrl },
  cenguigui: { name: '笒鬼鬼', run: cenguiguiUrl },
  yutang: { name: 'yutang', run: yutangUrl },
  kangqi: { name: 'kangqi', run: kangqiUrl },
  qjqq: { name: 'qjqq', run: qjqqUrl },
  lzm: { name: 'lzm', run: lzmUrl },
  neteaseFree: { name: '网易免费外链', run: neteaseFreeUrl },
  luoyue: { name: '落月QQ', run: luoyueUrl },
  ak317: { name: '317ak', run: ak317Url },
  ygking: { name: 'ygking', run: ygkingUrl },
  xunhuisi: { name: '迅回QQ', run: xunhuisiUrl },
  kgMobile: { name: '酷狗手机版', run: kgMobileUrl },
  kgWebApi: { name: '酷狗Web版', run: kgWebApiUrl },
  nianxinKg: { name: '念心酷狗', run: nianxinKgUrl },
  miguDirect: { name: 'Migu直接源', run: miguDirectUrl },
  miguApi: { name: 'Migu API', run: miguApiUrl },
  fishApi: { name: 'FishAPI', run: fishApiUrl },
  ffapi: { name: 'FFAPI', run: ffapiUrl },
  qishuiH5: { name: '汽水H5', run: qishuiH5Url },
  directYinyue: { name: '长青直链yinyue', run: makeDirect('yinyue') },
  direct175: { name: '长青直链175', run: makeDirect('ip175') },
  directHaitangCc: { name: '海棠直链cc', run: makeDirect('haitangCc') },
  directHaitangNet: { name: '海棠直链net', run: makeDirect('haitangNet') },
  directNianxin: { name: '念心直链', run: makeDirect('nianxin') },
}

// 新后端一律插在直链模板之前（直链直接返回 URL 字符串，排在其后的后端永远跑不到）；
// 无音质参数的酷狗官方两接口只挂 kg 链末尾（直链之前）作兜底。
const CHAINS = {
  kw: ['hyw', 'haitangResolve', 'haitangResolveQt', 'xinghaiAgg', 'xinghaiAggBackup', 'xinghaiApi',
    'gd', 'sayqz', 'huibq', 'lingchuan', 'ikun', 'wwwweb', 'kuwoOfficial', 'kuwoMobile',
    'oiapiKuwo', 'ffapi',
    'directYinyue', 'directHaitangNet', 'directNianxin', 'kwstream'],
  kg: ['hyw', 'haitangResolve', 'haitangResolveQt', 'xinghaiAgg', 'xinghaiAggBackup', 'xinghaiApi',
    'huibq', 'lingchuan', 'wwwweb', 'ffapi', 'nianxinKg', 'kgMobile', 'kgWebApi',
    'directYinyue', 'directHaitangCc', 'directNianxin'],
  tx: ['hyw', 'haitangResolve', 'haitangResolveQt', 'xinghaiAgg', 'xinghaiAggBackup', 'gd', 'sayqz',
    'huibq', 'lingchuan', 'luoyue', 'ak317', 'ygking', 'fishApi', 'ffapi', 'xunhuisi', 'lzm',
    'tang', 'oiapiQQ', 'aaCab',
    'directYinyue', 'direct175', 'directNianxin'],
  wy: ['hyw', 'wwwweb', 'haitangResolve', 'haitangResolveQt', 'xinghaiAgg', 'xinghaiAggBackup',
    'gd', 'huibq', 'lingchuan', 'ikun', 'oiapi163', 'chksz', 'canxiang', 'cenguigui',
    'yutang', 'kangqi', 'qjqq', 'lzm', 'fishApi', 'ffapi', 'mcp',
    'directYinyue', 'direct175', 'directNianxin', 'neteaseFree'],
  mg: ['hyw', 'xinghaiAgg', 'xinghaiAggBackup', 'xinghaiApi', 'gd', 'huibq', 'lingchuan',
    'miguDirect', 'miguApi', 'ffapi', 'xcvtsMigu', 'oiapiMigu',
    'directYinyue', 'directHaitangCc', 'directNianxin'],
  qs: ['hyw', 'xinghaiAgg', 'xinghaiAggBackup', 'qishuiH5'],
}

// ---------- 核心：顺序 fallback ----------

const getMusicUrl = async (source, musicInfo, quality) => {
  const chain = CHAINS[source] || []
  const errors = []
  for (const key of chain) {
    const backend = BACKENDS[key]
    if (!backend) continue
    try {
      const url = await backend.run(source, musicInfo, quality)
      if (isUrl(url)) return url.trim()
      throw new Error(backend.name + ' 返回空链接')
    } catch (e) {
      const msg = (e && e.message) || String(e)
      errors.push(backend.name + ': ' + msg)
      try { console.warn('[音乐源]', backend.name, '失败:', msg) } catch (err) { /* 忽略日志错误 */ }
    }
  }
  throw new Error('全部后端失败(' + source + '/' + quality + '): ' + errors.join(' | '))
}

// ---------- 事件处理与初始化 ----------

on(EVENT_NAMES.request, ({ action, source, info }) => {
  if (action !== 'musicUrl') return Promise.reject(new Error('不支持的操作: ' + action))
  if (!musicSources[source]) return Promise.reject(new Error('不支持的平台: ' + source))
  const quality = info && info.type
  if (!quality || MUSIC_QUALITY[source].indexOf(quality) < 0) {
    return Promise.reject(new Error('不支持的音质: ' + quality))
  }
  if (!info || !info.musicInfo) return Promise.reject(new Error('缺少 musicInfo'))
  return getMusicUrl(source, info.musicInfo, quality)
})

send(EVENT_NAMES.inited, { status: true, sources: musicSources })

// 聚合 API 启动拉一次 init.conf（juhe/latest.js L7）：
// 失败不阻塞、不影响 inited，只影响聚合 API 这一个后端。
httpFetch(LERD_API + '/init.conf', { method: 'GET' })
  .then((res) => {
    if (res.body && res.body.code === 200) lerdInitOk = true
  })
  .catch(() => { /* 忽略，聚合 API 后端在 musicUrl 时仍会尝试 */ })

// 星海聚合启动时预取一次服务器令牌（xinghai/latest.js 启动时 ensureTokenFresh）：
// 失败不阻塞、不影响 inited，musicUrl 时会按需再取。
ensureXinghaiToken().catch(() => { /* 忽略，星海聚合后端在 musicUrl 时仍会尝试 */ })
