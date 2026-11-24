import { compilePattern, requiredCandleCount } from "../src/utils/patternEngine.js";
import { fetchDeltaSymbols, fetchDeltaCandles } from "../src/utils/deltaScanner.js";
import { buildTelegramMsg, telegramMessagePayload } from "../src/utils/scanner.js";

const FIREBASE_API_KEY = "AIzaSyAZahY8Ci0yGHHZcf5TLTakNod16Hihbqo";
const MAX_MARKET_TASKS = 16;
const MAX_TOTAL_FETCHES = 25;
const ALLOWED_TFS = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"];
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
let fcmAccessTokenCache = null;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Content-Type": "application/json",
  };
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}
function b64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(value) {
  const s = atob(value);
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
async function encryptionKey(env) {
  if (!env.CREDENTIAL_ENCRYPTION_KEY) throw new Error("Missing CREDENTIAL_ENCRYPTION_KEY secret");
  const raw = unb64(env.CREDENTIAL_ENCRYPTION_KEY);
  if (raw.length !== 32) throw new Error("CREDENTIAL_ENCRYPTION_KEY must be base64 for exactly 32 bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encryptTelegram(value, env) {
  const key = await encryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { iv: b64(iv), data: b64(new Uint8Array(cipher)) };
}
async function decryptTelegram(value, env) {
  const key = await encryptionKey(env);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(value.iv) },
    key,
    unb64(value.data)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
async function decryptPushToken(value, env) {
  const key = await encryptionKey(env);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(value.iv) },
    key,
    unb64(value.data)
  );
  const decoded = new TextDecoder().decode(plain);
  try {
    const parsed = JSON.parse(decoded);
    return typeof parsed === "string" ? parsed : decoded;
  } catch {
    // Older saved push tokens may have been encrypted as raw text.
    return decoded;
  }
}
async function authenticate(request) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  try {
    const response = await fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.users?.[0]?.localId || null;
  } catch {
    return null;
  }
}
function activePatternsFor(config, tf) {
  const mode = config.scanModeByTf?.[tf] || "all";
  return (config.patterns || []).filter(pattern =>
    pattern.enabled === true &&
    Array.isArray(pattern.tfs) &&
    pattern.tfs.includes(tf) &&
    Array.isArray(pattern.conditions) &&
    pattern.conditions.some(condition => condition.enabled === true) &&
    (!(mode === "bull" || mode === "bear") || pattern.side === mode)
  );
}
function symbolListFor(config, mode, allSymbols) {
  if (mode === "custom") {
    const bySymbol = new Map(allSymbols.map(s => [s.symbol, s]));
    return [...new Set((config.customPairs || []).map(s => String(s).toUpperCase()))]
      .filter(s => /^[A-Z0-9]+USDT$/.test(s))
      .map(symbol => bySymbol.get(symbol) || { symbol, volume: 0, dailyChangePct: null });
  }
  return allSymbols;
}
function volumeThreshold(value) {
  return ({ all: 0, "500k": 500000, "1m": 1000000, "5m": 5000000, "10m": 10000000 })[value] ?? 0;
}
function base64Url(bytes) {
  return b64(bytes).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function pemBytes(pem) {
  return unb64(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, ""));
}
function getFirebaseServiceAccount(env) {
  const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON secret");
  // Cloudflare JSON-type variables may already be objects; Secret/Text values are strings.
  const account = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!account || typeof account !== "object" || Array.isArray(account)) {
    throw new Error("Invalid Firebase service account JSON");
  }
  return account;
}

async function getFcmAccessToken(env) {
  if (fcmAccessTokenCache && fcmAccessTokenCache.expiresAt > Date.now() + 60000) return fcmAccessTokenCache.token;
  const account = getFirebaseServiceAccount(env);
  if (!account.client_email || !account.private_key || !account.project_id) throw new Error("Invalid Firebase service account JSON");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = base64Url(new TextEncoder().encode(JSON.stringify({
    iss: account.client_email, scope: FCM_SCOPE,
    aud: account.token_uri || "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })));
  const unsigned = header + "." + claim;
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const response = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: unsigned + "." + base64Url(new Uint8Array(signature)),
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error("Google OAuth token exchange failed: " + response.status);
  fcmAccessTokenCache = { token: result.access_token, expiresAt: Date.now() + (result.expires_in || 3600) * 1000 };
  return result.access_token;
}
async function sendWebPush(projectId, token, alert, env) {
  const accessToken = await getFcmAccessToken(env);
  const side = alert.side === "bear" ? "SELL" : "BUY";
  const title = (alert.side === "bear" ? "🔴 SELL" : "🟢 BUY") + " · " + alert.symbol + " · " + alert.timeframe.toUpperCase();
  const body = alert.scannerName + "\n24h " + (alert.dailyChangePct == null ? "—" : alert.dailyChangePct.toFixed(2) + "%") +
    " · 1h " + (alert.hourlyChangePct == null ? "—" : alert.hourlyChangePct.toFixed(2) + "%");
  const response = await fetch("https://fcm.googleapis.com/v1/projects/" + projectId + "/messages:send", {
    method: "POST", headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ message: {
      token,
      data: { title, body, symbol: alert.symbol, timeframe: alert.timeframe, side,
        scannerName: alert.scannerName,
        time: String(alert.time || Date.now()), dailyChangePct: String(alert.dailyChangePct ?? ""), hourlyChangePct: String(alert.hourlyChangePct ?? ""),
        url: "https://www.tradingview.com/chart/?symbol=BYBIT:" + encodeURIComponent(alert.symbol.replace(/USDT$/, "") + "USDT.P") + "&interval=" + ({"1m":"1","3m":"3","5m":"5","15m":"15","30m":"30","1h":"60","4h":"240","1d":"D"}[alert.timeframe] || "15") },
      webpush: { headers: { Urgency: "high", TTL: "900" } },
    } }),
  });
  if (!response.ok) throw new Error("FCM send failed: " + response.status + " " + (await response.text()).slice(0, 250));
}
async function sendTelegram(token, chatId, message) {
  const response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      ...telegramMessagePayload(message),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!response.ok) throw new Error("Telegram send failed: " + response.status);
  const result = await response.json();
  if (!result.ok) throw new Error("Telegram rejected the message");
}
async function enqueuePendingChannel(env, config, alert, dedupKey, cooldownMs, channel) {
  const key = "pending-alert:" + dedupKey;
  let item;
  try { item = JSON.parse(await env.SCANNER_KV.get(key) || "null"); } catch { item = null; }
  if (!item) {
    item = {
      uid: config.uid, alert, dedupKey, cooldownMs,
      telegramPending: false, pushPending: false,
      attempts: { telegram: 0, push: 0 },
      nextAttemptAt: Date.now(),
      createdAt: Date.now(),
    };
  }
  if (channel === "telegram") item.telegramPending = true;
  if (channel === "push") item.pushPending = true;
  await env.SCANNER_KV.put(key, JSON.stringify(item), { expirationTtl: 172800 });
}

async function processPendingAlerts(env, configs) {
  const byUid = new Map(configs.map(config => [config.uid, config]));
  const page = await env.SCANNER_KV.list({ prefix: "pending-alert:", limit: 100 });
  let deliveredCount = 0;
  for (const entry of page.keys) {
    let item;
    try { item = JSON.parse(await env.SCANNER_KV.get(entry.name) || "null"); } catch { item = null; }
    if (!item) { await env.SCANNER_KV.delete(entry.name); continue; }
    const now = Date.now();
    if (now - Number(item.createdAt || now) > 172800000) {
      await env.SCANNER_KV.delete(entry.name);
      continue;
    }
    if (Number(item.nextAttemptAt || 0) > now) continue;
    const config = byUid.get(item.uid);
    if (!config) {
      await env.SCANNER_KV.delete(entry.name);
      continue;
    }
    let delivered = false;
    for (const channel of ["telegram", "push"]) {
      const pendingField = channel === "telegram" ? "telegramPending" : "pushPending";
      if (!item[pendingField]) continue;
      if (channel === "telegram" && !config.telegram) { item[pendingField] = false; continue; }
      if (channel === "push" && !config.pushToken) { item[pendingField] = false; continue; }
      try {
        if (channel === "telegram") {
          const telegram = await decryptTelegram(config.telegram, env);
          await sendTelegram(telegram.token, telegram.chatId, buildTelegramMsg(item.alert));
        } else {
          const token = await decryptPushToken(config.pushToken, env);
          const account = getFirebaseServiceAccount(env);
          await sendWebPush(account.project_id || "signal-engines", token, item.alert, env);
        }
        const dedup = channel === "telegram"
          ? item.dedupKey
          : "dedup:push:" + item.dedupKey.slice("dedup:".length);
        await env.SCANNER_KV.put(dedup, String(Date.now() + item.cooldownMs), {
          expirationTtl: Math.max(60, Math.ceil(item.cooldownMs / 1000)),
        });
        item[pendingField] = false;
        delivered = true;
      } catch (error) {
        item.attempts = item.attempts || { telegram: 0, push: 0 };
        item.attempts[channel] = (item.attempts[channel] || 0) + 1;
        console.error("[CoinSniper] Pending " + channel + " retry failed for user", item.uid, error?.message || error);
      }
    }
    if (delivered) deliveredCount++;
    if (!item.telegramPending && !item.pushPending) {
      await env.SCANNER_KV.delete(entry.name);
    } else {
      const attempts = Math.max(item.attempts?.telegram || 0, item.attempts?.push || 0);
      item.nextAttemptAt = Date.now() + Math.min(900000, 30000 * Math.pow(2, Math.min(attempts, 5)));
      await env.SCANNER_KV.put(entry.name, JSON.stringify(item), { expirationTtl: 172800 });
    }
  }
  return deliveredCount;
}

async function handleSync(request, env) {
  const uid = await authenticate(request);
  if (!uid) return json({ ok: false, error: "Authentication required" }, 401);
  let payload;
  try { payload = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const patterns = Array.isArray(payload.patterns) ? payload.patterns : [];
  const safePatterns = patterns
    .filter(p => p && p.enabled === true && typeof p.id === "string" && Array.isArray(p.tfs))
    .map(p => ({
      id: p.id,
      name: String(p.name || "Pattern").slice(0, 80),
      side: p.side === "bear" ? "bear" : "bull",
      icon: String(p.icon || (p.side === "bear" ? "🔴" : "🟢")).slice(0, 8),
      enabled: true,
      tfs: p.tfs.filter(tf => ALLOWED_TFS.includes(tf)),
      conditions: (p.conditions || []).filter(c => c && c.enabled === true),
    }))
    .filter(p => p.tfs.length && p.conditions.length);

  const telegramReady = payload.enabled === true &&
    typeof payload.tgToken === "string" && payload.tgToken.length > 20 &&
    typeof payload.tgChatId === "string" && payload.tgChatId.length > 0;
  let telegram = null;
  if (telegramReady) {
    telegram = await encryptTelegram(
      { token: payload.tgToken.trim(), chatId: payload.tgChatId.trim() },
      env
    );
  }

  const pushReady = payload.webPushOn === true && typeof payload.pushToken === "string" && payload.pushToken.length > 20;
  const pushToken = pushReady ? await encryptTelegram(payload.pushToken, env) : null;
  const timeframes = [...new Set(safePatterns.flatMap(p => p.tfs))];
  const config = {
    uid,
    enabled: (telegramReady || pushReady) && timeframes.length > 0,
    patterns: safePatterns,
    timeframes,
    scanModeByTf: Object.fromEntries(ALLOWED_TFS.map(tf => [
      tf,
      ["all", "bull", "bear", "custom", "single"].includes(payload.scanModeByTf?.[tf])
        ? payload.scanModeByTf[tf] : "all",
    ])),
    customPairs: Array.isArray(payload.customPairs)
      ? [...new Set(payload.customPairs.map(s => String(s).toUpperCase()).filter(s => /^[A-Z0-9]+USDT$/.test(s)))].slice(0, 200)
      : [],
    volumeFilter: ["all", "500k", "1m", "5m", "10m"].includes(payload.volumeFilter)
      ? payload.volumeFilter : "all",
    dedupMsByTf: Object.fromEntries(ALLOWED_TFS.map(tf => {
      const ms = Number(payload.dedupMsByTf?.[tf]);
      return [tf, Number.isFinite(ms) && ms >= 15000 && ms <= 86400000 ? ms : 180000];
    })),
    telegram,
    pushToken,
    updatedAt: Date.now(),
  };
  await env.SCANNER_KV.put("cfg:" + uid, JSON.stringify(config));
  return json({
    ok: true,
    enabled: config.enabled,
    activeTimeframes: timeframes,
    activePatterns: safePatterns.length,
  });
}
async function handleTestPush(request, env) {
  const uid = await authenticate(request);
  if (!uid) return json({ ok: false, error: "Authentication required" }, 401);
  const raw = await env.SCANNER_KV.get("cfg:" + uid);
  if (!raw) return json({ ok: false, error: "No synced settings found for this account" }, 404);
  const config = JSON.parse(raw);
  if (!config.pushToken) return json({ ok: false, error: "No Web Push token saved. Turn Web Push OFF then ON in Preview Settings." }, 404);
  try {
    const token = await decryptPushToken(config.pushToken, env);
    const account = getFirebaseServiceAccount(env);
    await sendWebPush(account.project_id || "signal-engines", token, {
      side: "bull", timeframe: "test", scannerName: "Coin Sniper Test",
      symbol: "WEBPUSH", dailyChangePct: null, hourlyChangePct: null,
    }, env);
    return json({ ok: true, message: "Test push sent to this device" });
  } catch (error) {
    const detail = String(error?.message || error || "Unknown error").slice(0, 500);
    console.error("[CoinSniper] Test push failed:", detail);
    return json({ ok: false, error: detail }, 500);
  }
}
async function loadConfigs(env) {
  const configs = [];
  let cursor;
  do {
    const page = await env.SCANNER_KV.list({ prefix: "cfg:", limit: 1000, cursor });
    for (const key of page.keys) {
      const raw = await env.SCANNER_KV.get(key.name);
      if (!raw) continue;
      try {
        const config = JSON.parse(raw);
        if (config.enabled && (config.telegram || config.pushToken) && config.timeframes?.length) configs.push(config);
      } catch {}
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return configs.sort((a, b) => a.uid.localeCompare(b.uid));
}
function makeUserTasks(config, allSymbols) {
  const tasks = [];
  for (const tf of config.timeframes || []) {
    const patterns = activePatternsFor(config, tf);
    if (!patterns.length) continue;
    const mode = config.scanModeByTf?.[tf] || "all";
    const symbols = symbolListFor(config, mode, allSymbols);
    for (const item of symbols) {
      tasks.push({
        key: item.symbol + "|" + tf,
        symbol: item.symbol,
        timeframe: tf,
        ticker: item,
        consumers: [{ config, patterns }],
      });
    }
  }
  return tasks;
}
function interleaveAndMerge(configs, allSymbols) {
  const perUser = configs.map(config => makeUserTasks(config, allSymbols));
  const merged = new Map();
  const max = Math.max(0, ...perUser.map(list => list.length));
  for (let i = 0; i < max; i++) {
    for (const list of perUser) {
      const task = list[i];
      if (!task) continue;
      const existing = merged.get(task.key);
      if (existing) existing.consumers.push(...task.consumers);
      else merged.set(task.key, task);
    }
  }
  return [...merged.values()];
}
function requiredHtf(tasks) {
  const needed = new Map();
  for (const task of tasks) {
    for (const consumer of task.consumers) {
      for (const pattern of consumer.patterns) {
        for (const condition of pattern.conditions || []) {
          if (condition.enabled !== false && condition.htfTf && ALLOWED_TFS.includes(condition.htfTf) && condition.htfTf !== task.timeframe) {
            const key = task.symbol + "|" + condition.htfTf;
            if (!needed.has(key)) {
              needed.set(key, { key, symbol: task.symbol, timeframe: condition.htfTf, conditions: [] });
            }
            needed.get(key).conditions.push(condition);
          }
        }
      }
    }
  }
  return [...needed.values()];
}
async function scanCron(env) {
  const configs = await loadConfigs(env);
  if (!configs.length) return { users: 0, tasks: 0, alerts: 0 };

  const tickerResult = await fetchDeltaSymbols();
  const allSymbols = tickerResult.symbols || [];
  if (!allSymbols.length) return { users: configs.length, tasks: 0, alerts: 0, error: "No market symbols" };

  const allTasks = interleaveAndMerge(configs, allSymbols);
  if (!allTasks.length) return { users: configs.length, tasks: 0, alerts: 0 };

  const rawCursor = Number(await env.SCANNER_KV.get("scheduler:cursor") || 0);
  const cursor = Number.isFinite(rawCursor) ? rawCursor % allTasks.length : 0;
  const selected = [];
  for (let i = 0; i < Math.min(MAX_MARKET_TASKS, allTasks.length); i++) {
    selected.push(allTasks[(cursor + i) % allTasks.length]);
  }
  await env.SCANNER_KV.put("scheduler:cursor", String((cursor + selected.length) % allTasks.length));

  const htfTasks = requiredHtf(selected);
  const tickerBySymbol = new Map(selected.map(task => [task.symbol, task.ticker]));
  const fetchTaskMap = new Map();
  function addFetchTask(task, conditions, ticker) {
    const limit = requiredCandleCount(conditions || []);
    const existing = fetchTaskMap.get(task.key);
    fetchTaskMap.set(task.key, {
      key: task.key,
      symbol: task.symbol,
      timeframe: task.timeframe,
      limit: Math.max(existing?.limit || 0, limit),
      ticker: existing?.ticker || ticker || null,
    });
  }
  for (const task of selected) {
    const conditions = task.consumers.flatMap(consumer =>
      consumer.patterns.flatMap(pattern => (pattern.conditions || []).filter(condition => !condition.htfTf || condition.htfTf === task.timeframe))
    );
    addFetchTask(task, conditions, task.ticker);
  }
  for (const task of htfTasks) {
    addFetchTask(task, task.conditions, tickerBySymbol.get(task.symbol));
  }
  const fetchTasks = [...fetchTaskMap.values()].slice(0, MAX_TOTAL_FETCHES);

  const candleMap = new Map();
  await Promise.all(fetchTasks.map(async task => {
    const candles = await fetchDeltaCandles(task.symbol, task.timeframe, task.limit, task.ticker);
    if (candles?.length >= 10) candleMap.set(task.key, candles);
  }));

  let alertsSent = await processPendingAlerts(env, configs);
  const sentThisRun = new Set();
  for (const task of selected) {
    const candles = candleMap.get(task.key);
    if (!candles) continue;
    for (const consumer of task.consumers) {
      const config = consumer.config;
      const htfMap = {};
      for (const pattern of consumer.patterns) {
        for (const condition of pattern.conditions || []) {
          if (!condition.htfTf) continue;
          if (condition.htfTf === task.timeframe) {
            htfMap[condition.htfTf] = candles;
            continue;
          }
          const htf = candleMap.get(task.symbol + "|" + condition.htfTf);
          if (htf) htfMap[condition.htfTf] = htf;
        }
      }
      for (const pattern of consumer.patterns) {
        const hasMissingHtf = (pattern.conditions || []).some(c =>
          c.htfTf && c.htfTf !== task.timeframe && !htfMap[c.htfTf]
        );
        if (hasMissingHtf) continue;

        const result = compilePattern(pattern)(candles, htfMap);
        if (!result) continue;

        const dedupKey = [
          "dedup", config.uid, task.symbol, task.timeframe, pattern.id, pattern.side,
        ].join(":");
        const cooldownMs = config.dedupMsByTf?.[task.timeframe] || 180000;
        // Delivery cooldowns are checked independently for Telegram and Web Push below.
        const alertKey = dedupKey;
        if (sentThisRun.has(alertKey)) continue;
        sentThisRun.add(alertKey);
        // If an earlier delivery is queued for retry, don't send the same signal again here.
        const pending = await env.SCANNER_KV.get("pending-alert:" + dedupKey, "json");

        let hourlyChangePct = null;
        try {
          const hourly = await fetchDeltaCandles(task.symbol, "1h", 2);
          const last = hourly?.[hourly.length - 1];
          if (last?.open > 0 && last?.close > 0) {
            hourlyChangePct = ((last.close - last.open) / last.open) * 100;
          }
        } catch {}

        const alert = {
          symbol: task.symbol,
          time: Date.now(),
          timeframe: task.timeframe,
          side: pattern.side,
          scannerName: pattern.name,
          dailyChangePct: Number.isFinite(Number(task.ticker?.dailyChangePct))
            ? Number(task.ticker.dailyChangePct) : null,
          hourlyChangePct,
        };
        let delivered = false;
        if (config.telegram && !pending?.telegramPending) {
          const expiry = Number(await env.SCANNER_KV.get(dedupKey) || 0);
          if (!expiry || Date.now() >= expiry) {
            try {
              const telegram = await decryptTelegram(config.telegram, env);
              await sendTelegram(telegram.token, telegram.chatId, buildTelegramMsg(alert));
              await env.SCANNER_KV.put(dedupKey, String(Date.now() + cooldownMs), {
                expirationTtl: Math.max(60, Math.ceil(cooldownMs / 1000)),
              });
              delivered = true;
            } catch (error) {
              console.error("[CoinSniper] Telegram delivery failed for user", config.uid, error?.message || error);
              try { await enqueuePendingChannel(env, config, alert, dedupKey, cooldownMs, "telegram"); }
              catch (queueError) { console.error("[CoinSniper] Could not queue Telegram alert:", queueError?.message || queueError); }
            }
          }
        }
        if (config.pushToken && !pending?.pushPending) {
          const pushDedupKey = "dedup:push:" + config.uid + ":" + task.symbol + ":" + task.timeframe + ":" + pattern.id + ":" + pattern.side;
          const pushExpiry = Number(await env.SCANNER_KV.get(pushDedupKey) || 0);
          if (!pushExpiry || Date.now() >= pushExpiry) {
            try {
              const token = await decryptPushToken(config.pushToken, env);
              const account = getFirebaseServiceAccount(env);
              await sendWebPush(account.project_id || "signal-engines", token, alert, env);
              await env.SCANNER_KV.put(pushDedupKey, String(Date.now() + cooldownMs), {
                expirationTtl: Math.max(60, Math.ceil(cooldownMs / 1000)),
              });
              delivered = true;
            } catch (error) {
              console.error("[CoinSniper] Web Push delivery failed for user", config.uid, error?.message || error);
              try { await enqueuePendingChannel(env, config, alert, dedupKey, cooldownMs, "push"); }
              catch (queueError) { console.error("[CoinSniper] Could not queue Web Push alert:", queueError?.message || queueError); }
            }
          }
        }
        if (delivered) alertsSent++;
      }
    }
  }
  return { users: configs.length, tasks: selected.length, alerts: alertsSent };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "coin-sniper-scanner", time: new Date().toISOString() });
    }
    if (request.method === "POST" && url.pathname === "/test-push") {
      try { return await handleTestPush(request, env); }
      catch (error) {
        console.error("[CoinSniper] Test push route failed:", error?.message || error);
        return json({ ok: false, error: "Test push failed" }, 500);
      }
    }
    if (request.method === "POST" && url.pathname === "/sync") {
      try { return await handleSync(request, env); }
      catch (error) {
        console.error("[CoinSniper] Sync failed:", error?.message || error);
        return json({ ok: false, error: "Settings sync failed" }, 500);
      }
    }
    return json({ ok: false, error: "Not found" }, 404);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(scanCron(env).catch(error => {
      console.error("[CoinSniper] Scheduled scan failed:", error?.message || error);
    }));
  },
};
