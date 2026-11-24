const intervals = {'1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1h':'60','4h':'240','1d':'D'}
const duration = {'1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'4h':14400000,'1d':86400000}
export function createLiveCandles() {
  let socket, timer, heartbeat, stopped = false
  const topics = new Set(), latest = new Map()
  function connect() {
    if (stopped || socket || !topics.size) return
    socket = new WebSocket('wss://stream.bybit.com/v5/public/linear')
    const ws = socket
    ws.onopen = () => {
      const list = [...topics]
      for(let i=0;i<list.length;i+=10) ws.send(JSON.stringify({op:'subscribe',args:list.slice(i,i+10)}))
      heartbeat = setInterval(()=>{if(ws.readyState===1)ws.send(JSON.stringify({op:'ping'}))},20000)
    }
    ws.onmessage = event => {
      try {
        const msg = JSON.parse(event.data)
        if (!topics.has(msg.topic)) return
        for(const d of msg.data || []) {
          const candle = {time:Number(d.start),open:Number(d.open),high:Number(d.high),low:Number(d.low),close:Number(d.close),volume:Number(d.volume)}
          if(Object.values(candle).every(Number.isFinite)) latest.set(msg.topic,{candle,received:Date.now()})
        }
      } catch {}
    }
    ws.onerror = () => ws.close()
    ws.onclose = () => {clearInterval(heartbeat);socket=null;latest.clear();if(!stopped)timer=setTimeout(connect,3000)}
  }
  function topic(symbol,tf){return intervals[tf] && /^[A-Z0-9]+USDT$/.test(symbol) ? 'kline.'+intervals[tf]+'.'+symbol : null}
  return {
    watch(symbol,tf) {
      const t=topic(symbol,tf)
      if(!t || stopped || topics.has(t) || topics.size>=600)return
      topics.add(t)
      if(socket?.readyState===1)socket.send(JSON.stringify({op:'subscribe',args:[t]}))
      else connect()
    },
    merge(symbol,tf,candles) {
      const entry=latest.get(topic(symbol,tf))
      if(!entry || Date.now()-entry.received>65000 || !candles?.length)return null
      const last=candles[candles.length-1], next=entry.candle
      if(next.time===last.time)return [...candles.slice(0,-1),{...last,...next}]
      // Missing closed candles require REST backfill rather than guessing.
      return null
    },
    close(){stopped=true;clearTimeout(timer);clearInterval(heartbeat);socket?.close();latest.clear();topics.clear()}
  }
}
