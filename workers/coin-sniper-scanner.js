import { compilePattern } from "../src/utils/patternEngine.js";
import { fetchDeltaSymbols, fetchDeltaCandles } from "../src/utils/deltaScanner.js";
import { buildTelegramMsg } from "../src/utils/scanner.js";

const FIREBASE_API_KEY = "AIzaSyAZahY8Ci0yGHHZcf5TLTakNod16Hihbqo";
const MAX_MARKET_TASKS = 16;
const MAX_TOTAL_FETCHES = 25;
const MAX_ALERTS_PER_RUN = 5;
const ALLOWED_TFS = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"];

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
async function sendTelegram(token, chatId, message) {
  const response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!response.ok) throw new Error("Telegram send failed: " + response.status);
  const result = await response.json();
  if (!result.ok) throw new Error("Telegram rejected the message");
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

  const timeframes = [...new Set(safePatterns.flatMap(p => p.tfs))];
  const config = {
    uid,
    enabled: telegramReady && timeframes.length > 0,
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
        if (config.enabled && config.telegram && config.timeframes?.length) configs.push(config);
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
  const needed = new Set();
  for (const task of tasks) {
    for (const consumer of task.consumers) {
      for (const pattern of consumer.patterns) {
        for (const condition of pattern.conditions || []) {
          if (condition.htfTf && ALLOWED_TFS.includes(condition.htfTf) && condition.htfTf !== task.timeframe) {
            needed.add(task.symbol + "|" + condition.htfTf);
          }
        }
      }
    }
  }
  return [...needed].map(key => {
    const [symbol, timeframe] = key.split("|");
    return { key, symbol, timeframe };
  });
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
  const fetchTasks = [...new Map([...selected.map(t => ({ key: t.key, symbol: t.symbol, timeframe: t.timeframe })), ...htfTasks]
    .map(t => [t.key, t])).values()].slice(0, MAX_TOTAL_FETCHES);

  const candleMap = new Map();
  await Promise.all(fetchTasks.map(async task => {
    const candles = await fetchDeltaCandles(task.symbol, task.timeframe, 80);
    if (candles?.length >= 10) candleMap.set(task.key, candles);
  }));

  let alertsSent = 0;
  const sentThisRun = new Set();
  for (const task of selected) {
    const candles = candleMap.get(task.key);
    if (!candles) continue;
    for (const consumer of task.consumers) {
      if (alertsSent >= MAX_ALERTS_PER_RUN) break;
      const config = consumer.config;
      const htfMap = {};
      for (const pattern of consumer.patterns) {
        for (const condition of pattern.conditions || []) {
          if (!condition.htfTf || condition.htfTf === task.timeframe) continue;
          const htf = candleMap.get(task.symbol + "|" + condition.htfTf);
          if (htf) htfMap[condition.htfTf] = htf;
        }
      }
      for (const pattern of consumer.patterns) {
        if (alertsSent >= MAX_ALERTS_PER_RUN) break;
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
        const existingExpiry = Number(await env.SCANNER_KV.get(dedupKey) || 0);
        if (existingExpiry && Date.now() < existingExpiry) continue;
        const alertKey = dedupKey;
        if (sentThisRun.has(alertKey)) continue;
        sentThisRun.add(alertKey);

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
          timeframe: task.timeframe,
          side: pattern.side,
          scannerName: pattern.name,
          dailyChangePct: Number.isFinite(Number(task.ticker?.dailyChangePct))
            ? Number(task.ticker.dailyChangePct) : null,
          hourlyChangePct,
        };
        try {
          const telegram = await decryptTelegram(config.telegram, env);
          await sendTelegram(telegram.token, telegram.chatId, buildTelegramMsg(alert));
          await env.SCANNER_KV.put(dedupKey, String(Date.now() + cooldownMs), {
            expirationTtl: Math.max(60, Math.ceil(cooldownMs / 1000)),
          });
          alertsSent++;
        } catch (error) {
          console.error("[CoinSniper] Alert delivery failed for user", config.uid, error?.message || error);
        }
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
