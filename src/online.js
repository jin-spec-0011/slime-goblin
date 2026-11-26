// 온라인 기능: 닉네임 계정 + 무한의 탑 랭킹 (Firebase Auth / Realtime Database REST)
// - SDK 없이 fetch만 사용 (PWA 용량 증가 없음)
// - 진행 데이터(골드·강화 등)는 업로드하지 않는다. 클라우드에는 닉네임·탑 최고 층만 저장
// - 네트워크 실패는 예외 대신 { ok:false, msg } 로 돌려준다 (게임은 오프라인으로 계속)
// DOM 의존 없음: Node 테스트에서 순수 함수 검증 가능

export const FB = {
  apiKey: 'AIzaSyCPAiwt_cj8lEqmv-CTDSUIDkcMD8JvsLs',          // 웹용 공개 키 (보안은 DB 규칙이 담당)
  authDomain: 'slime-goblin.firebaseapp.com',
  databaseURL: 'https://slime-goblin-default-rtdb.asia-southeast1.firebasedatabase.app',
};
export const ACCOUNT_KEY = 'esd.account';
export const RANK_CACHE_KEY = 'esd.rankCache';
export const RANK_LIMIT = 100;          // 랭킹 TOP N
export const RANK_CACHE_MS = 60 * 1000; // 랭킹 캐시 60초 (무료 다운로드 한도 절약)
export const NICK_MIN = 2, NICK_MAX = 12, PW_MIN = 6;
const TIMEOUT_MS = 10000;
const BANNED = ['admin', 'administrator', '관리자', '운영자', '운영진', 'gm', '시발', '씨발', 'ㅅㅂ', '병신', '개새', '좆', '존나', 'fuck', 'shit', 'bitch'];

// ---------- 닉네임 ----------
export function validNick(raw) {
  const n = String(raw ?? '').normalize('NFC').trim();
  if (n.length < NICK_MIN || n.length > NICK_MAX) return { ok: false, msg: `닉네임은 ${NICK_MIN}~${NICK_MAX}자입니다.` };
  if (!/^[A-Za-z0-9가-힣]+$/.test(n)) return { ok: false, msg: '닉네임은 한글(완성형)·영문·숫자만 쓸 수 있습니다.' };
  const low = n.toLowerCase();
  if (BANNED.some(w => low.includes(w))) return { ok: false, msg: '사용할 수 없는 단어가 포함되어 있습니다.' };
  return { ok: true, nick: n };
}
export const nickKey = nick => String(nick).normalize('NFC').trim().toLowerCase();

// 닉네임 -> 내부 이메일 (메일은 발송되지 않음). UTF-8 바이트를 base32로 인코딩해 대소문자 구분 없이 1:1 대응
// 한글 12자 = 36바이트 -> base32 58자 + 접두사 1자 = 59자 (이메일 아이디 64자 제한 이내)
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
export function base32(bytes) {
  let out = '', bits = 0, val = 0;
  for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export const nickEmail = nick => `n${base32(new TextEncoder().encode(nickKey(nick)))}@${FB.authDomain}`;

// 랭킹 정렬 점수: 층 우선, 같은 층이면 먼저 달성한 사람이 위
// score = floor x 1e10 + (9999999999 - 달성 초)  (999층이어도 2^53 이내)
export const rankScore = (floor, atMs) => floor * 1e10 + (9999999999 - Math.floor(atMs / 1000));

// 서버 응답(객체) -> 점수 내림차순 배열
export function parseRanking(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj)
    .filter(([, v]) => v && typeof v.floor === 'number' && typeof v.nick === 'string')
    .map(([uid, v]) => ({ uid, nick: v.nick, floor: v.floor, at: v.at || 0, score: typeof v.score === 'number' ? v.score : rankScore(v.floor, v.at || 0) }))
    .sort((a, b) => b.score - a.score);
}

// ---------- 저장 (localStorage 래퍼를 호출측이 넘김) ----------
export function loadAccount(storage) {
  try { const a = JSON.parse(storage?.getItem(ACCOUNT_KEY) || 'null'); return a && a.uid && a.refreshToken ? a : null; } catch { return null; }
}
export function saveAccount(storage, a) { try { storage?.setItem(ACCOUNT_KEY, JSON.stringify(a)); } catch { /* 저장 불가 환경 무시 */ } }
export function clearAccount(storage) { try { storage?.setItem(ACCOUNT_KEY, ''); } catch { /* 무시 */ } }

// ---------- HTTP ----------
async function req(url, opts = {}) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetch(url, { ...opts, signal: ctl?.signal });
    let body = null; try { body = await res.json(); } catch { body = null; }
    return { status: res.status, ok: res.ok, body };
  } catch {
    return { status: 0, ok: false, body: null };
  } finally { if (timer) clearTimeout(timer); }
}
const json = (method, data) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const authUrl = op => `https://identitytoolkit.googleapis.com/v1/accounts:${op}?key=${FB.apiKey}`;
const dbUrl = (path, token, query = '') => `${FB.databaseURL}/${path}.json?${token ? `auth=${encodeURIComponent(token)}&` : ''}${query}`;

const AUTH_MSG = {
  EMAIL_EXISTS: '이미 사용 중인 닉네임입니다.',
  INVALID_LOGIN_CREDENTIALS: '닉네임 또는 비밀번호가 틀렸습니다.',
  INVALID_PASSWORD: '닉네임 또는 비밀번호가 틀렸습니다.',
  EMAIL_NOT_FOUND: '닉네임 또는 비밀번호가 틀렸습니다.',
  USER_DISABLED: '사용이 정지된 계정입니다.',
  TOO_MANY_ATTEMPTS_TRY_LATER: '시도가 너무 많습니다. 잠시 후 다시 해주세요.',
  OPERATION_NOT_ALLOWED: '서버에서 가입이 꺼져 있습니다. (Firebase 이메일/비밀번호 로그인 설정 확인)',
};
function authErr(r) {
  if (r.status === 0) return '인터넷 연결을 확인해 주세요.';
  const code = String(r.body?.error?.message || '').split(' ')[0].split(':')[0];
  if (code.startsWith('WEAK_PASSWORD')) return `비밀번호는 ${PW_MIN}자 이상이어야 합니다.`;
  return AUTH_MSG[code] || `서버 오류 (${code || r.status})`;
}
const dbErr = r => (r.status === 0 ? '인터넷 연결을 확인해 주세요.' : r.status === 401 || r.status === 403 ? '권한이 없습니다. (DB 보안 규칙 확인)' : `서버 오류 (${r.status})`);
const session = (uid, nick, d) => ({ uid, nick, idToken: d.idToken, refreshToken: d.refreshToken, exp: Date.now() + (+d.expiresIn || 3600) * 1000 - 60000, submitted: 0 });

// ---------- 계정 ----------
export async function nickTaken(nick) {
  const r = await req(dbUrl(`nicknames/${encodeURIComponent(nickKey(nick))}`));
  if (!r.ok) return { ok: false, msg: dbErr(r) };
  return { ok: true, taken: r.body !== null };
}

export async function signUp(rawNick, pw) {
  const v = validNick(rawNick); if (!v.ok) return v;
  if (String(pw).length < PW_MIN) return { ok: false, msg: `비밀번호는 ${PW_MIN}자 이상이어야 합니다.` };
  const t = await nickTaken(v.nick); if (!t.ok) return t;
  if (t.taken) return { ok: false, msg: '이미 사용 중인 닉네임입니다.' };
  const a = await req(authUrl('signUp'), json('POST', { email: nickEmail(v.nick), password: String(pw), returnSecureToken: true }));
  if (!a.ok) return { ok: false, msg: authErr(a) };
  const uid = a.body.localId, acc = session(uid, v.nick, a.body);
  // 닉네임 등록 + 유저 정보를 한 번에 (규칙: 닉네임이 비어 있을 때만 성공)
  const w = await req(dbUrl('', acc.idToken), json('PATCH', {
    [`nicknames/${nickKey(v.nick)}`]: uid,
    [`users/${uid}`]: { nick: v.nick, joined: { '.sv': 'timestamp' } },
  }));
  if (!w.ok) {
    await req(authUrl('delete'), json('POST', { idToken: acc.idToken })); // 동시에 같은 닉네임 가입 등: 계정 되돌리기
    return { ok: false, msg: w.status === 401 || w.status === 403 ? '이미 사용 중인 닉네임입니다.' : dbErr(w) };
  }
  return { ok: true, account: acc, msg: `${v.nick}님, 가입 완료!` };
}

export async function signIn(rawNick, pw) {
  const n = String(rawNick ?? '').normalize('NFC').trim();
  if (!n || !pw) return { ok: false, msg: '닉네임과 비밀번호를 입력하세요.' };
  const a = await req(authUrl('signInWithPassword'), json('POST', { email: nickEmail(n), password: String(pw), returnSecureToken: true }));
  if (!a.ok) return { ok: false, msg: authErr(a) };
  const uid = a.body.localId, acc = session(uid, n, a.body);
  const u = await req(dbUrl(`users/${uid}`, acc.idToken));             // 가입 때 입력한 표기(대소문자) 그대로
  if (u.ok && u.body?.nick) acc.nick = u.body.nick;
  const rk = await req(dbUrl(`ranking/${uid}`));                         // 다른 기기에서 올린 기록
  if (rk.ok && typeof rk.body?.floor === 'number') acc.submitted = rk.body.floor;
  return { ok: true, account: acc, msg: `${acc.nick}님, 환영합니다!` };
}

// 토큰 갱신 (1시간 만료). 성공 시 acc를 갱신해 돌려준다
export async function freshToken(acc) {
  if (!acc) return { ok: false, msg: '로그인이 필요합니다.' };
  if (acc.idToken && acc.exp > Date.now()) return { ok: true, account: acc };
  const r = await req(`https://securetoken.googleapis.com/v1/token?key=${FB.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(acc.refreshToken)}`,
  });
  if (!r.ok) return { ok: false, msg: r.status === 0 ? '인터넷 연결을 확인해 주세요.' : '로그인이 만료되었습니다. 다시 로그인해 주세요.', expired: r.status >= 400 };
  return { ok: true, account: { ...acc, idToken: r.body.id_token, refreshToken: r.body.refresh_token, exp: Date.now() + (+r.body.expires_in || 3600) * 1000 - 60000 } };
}

// 탑 최고 층 등록 (서버 기록보다 높을 때만)
export async function submitFloor(acc, floor) {
  if (!acc || !(floor >= 1)) return { ok: false, msg: '등록할 기록이 없습니다.' };
  if (floor <= (acc.submitted || 0)) return { ok: true, account: acc, skipped: true };
  const t = await freshToken(acc); if (!t.ok) return t;
  const a = t.account;
  const cur = await req(dbUrl(`ranking/${a.uid}`));
  if (cur.ok && typeof cur.body?.floor === 'number' && cur.body.floor >= floor) return { ok: true, account: { ...a, submitted: cur.body.floor }, skipped: true };
  const w = await req(dbUrl(`ranking/${a.uid}`, a.idToken), json('PUT', {
    nick: a.nick, floor: Math.floor(floor), at: { '.sv': 'timestamp' }, score: rankScore(Math.floor(floor), Date.now()),
  }));
  if (!w.ok) return { ok: false, msg: dbErr(w), account: a };
  rankMem = null;                                   // 내 기록이 바뀌었으니 캐시 무효화
  return { ok: true, account: { ...a, submitted: Math.floor(floor) }, msg: `🏆 랭킹 등록: ${Math.floor(floor)}층` };
}

// 랭킹 TOP 100 (60초 캐시: 메모리 + storage)
let rankMem = null;
export async function fetchRanking(storage, force = false) {
  const now = Date.now();
  if (!force) {
    if (rankMem && now - rankMem.at < RANK_CACHE_MS) return { ok: true, list: rankMem.list, cached: true, at: rankMem.at };
    try { const c = JSON.parse(storage?.getItem(RANK_CACHE_KEY) || 'null'); if (c && now - c.at < RANK_CACHE_MS && Array.isArray(c.list)) { rankMem = c; return { ok: true, list: c.list, cached: true, at: c.at }; } } catch { /* 캐시 손상 무시 */ }
  }
  const r = await req(dbUrl('ranking', null, `orderBy=${encodeURIComponent('"score"')}&limitToLast=${RANK_LIMIT}`));
  if (!r.ok) return { ok: false, msg: dbErr(r) };
  rankMem = { at: now, list: parseRanking(r.body) };
  try { storage?.setItem(RANK_CACHE_KEY, JSON.stringify(rankMem)); } catch { /* 무시 */ }
  return { ok: true, list: rankMem.list, cached: false, at: now };
}
