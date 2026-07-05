// Alert notification utilities

export async function sendTelegramAlert(alert, botToken, chatId) {
  if (!botToken || !chatId) return false
  
  const emoji = alert.side === 'bull' ? '🟢' : '🔴'
  const direction = alert.side === 'bull' ? 'LONG' : 'SHORT'
  
  const message = `
${emoji} <b>FOREX ALERT: ${direction}</b>

<b>Pair:</b> ${alert.symbol}
<b>Pattern:</b> ${alert.pattern}
<b>Timeframe:</b> ${alert.timeframe}
<b>Price:</b> ${alert.price}
<b>Confidence:</b> ${alert.confidence}%

<i>Detected at ${new Date(alert.timestamp).toLocaleString()}</i>
  `.trim()
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    })
    
    return response.ok
  } catch (e) {
    console.warn('Telegram alert failed:', e.message)
    return false
  }
}

export async function sendEmailAlert(alert, emailAddress) {
  if (!emailAddress) return false
  
  // In production, this would call your email API
  // For now, just log (implement SendGrid if needed)
  console.log(`Email alert would be sent to ${emailAddress}:`, alert)
  return true
}
