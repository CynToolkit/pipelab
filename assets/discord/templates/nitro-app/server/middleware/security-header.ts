export default eventHandler((event) => {
  setResponseHeader(event, 'X-Frame-Options', '')
  setResponseHeader(
    event,
    'Content-Security-Policy',
    "frame-ancestors 'self' https://*.discordsays.com"
  )
})
