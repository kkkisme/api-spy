/**
 * Vercel Serverless Function — mock any HTTP status code
 * Route: /mock/:status
 */
export default function handler(req, res) {
  const status = Number(req.query.status)
  if (!status || status < 100 || status > 599) {
    res.status(400).json({ error: 'Invalid status code' })
    return
  }
  res.status(status).json({ mocked: true, status })
}
