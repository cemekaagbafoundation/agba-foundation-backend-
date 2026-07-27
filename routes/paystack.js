const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// Save pending Paystack donation
router.post('/save-donation', async (req, res) => {
  const { name, email, amount, reference, currency = 'USD' } = req.body
  if (!email || !amount || !reference) {
    return res.status(400).json({ error: 'email, amount and reference are required' })
  }
  try {
    const { error } = await supabase.from('donations').insert([{
      name: name || 'Anonymous',
      email,
      amount: Number(amount),
      reference,
      currency,
      status: 'pending',
      gateway: 'paystack',
    }])
    if (error) throw error
    res.json({ message: 'Donation saved', reference })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Paystack webhook
router.post('/webhook', async (req, res) => {
  const payload = req.body
  const received_at = new Date().toISOString()
  const secret = process.env.PAYSTACK_SECRET_KEY
  const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(payload)).digest('hex')
  const signature = req.headers['x-paystack-signature']

  console.log('=== PAYSTACK WEBHOOK ===')
  console.log('Time:', received_at)
  console.log('Event:', payload.event)
  console.log('Signature valid:', hash === signature)
  console.log('========================')

  let logId = null
  try {
    const { data: logData } = await supabase
      .from('webhook_logs')
      .insert([{
        provider: 'paystack',
        event_type: payload.event || 'unknown',
        payload: payload || {},
        headers: { 'x-paystack-signature': signature, 'content-type': req.headers['content-type'] },
        received_at,
        processed: false,
        status: 'received',
      }])
      .select('id')
      .single()
    logId = logData && logData.id
  } catch (logErr) {
    console.error('Failed to save webhook log:', logErr.message)
  }

  if (payload.event !== 'charge.success') {
    if (logId) await supabase.from('webhook_logs').update({ status: 'ignored', processed: true }).eq('id', logId)
    return res.status(200).json({ received: true })
  }

  if (hash !== signature) {
    console.error('Paystack signature mismatch')
    if (logId) await supabase.from('webhook_logs').update({ status: 'invalid_signature', processed: true }).eq('id', logId)
    return res.status(200).json({ received: true })
  }

  const data = payload.data || {}
  const reference = data.reference || null
  const customerName = (data.customer && data.customer.name) || null
  const customerEmail = (data.customer && data.customer.email) || null
  const currency = data.currency || 'USD'
  const channel = data.channel || null
  const gatewayRef = data.id ? String(data.id) : null

  console.log('Paystack charge.success:', { reference, currency, customerName })

  if (!reference) {
    if (logId) await supabase.from('webhook_logs').update({ status: 'no_reference', processed: true }).eq('id', logId)
    return res.status(200).json({ received: true })
  }

  const { error } = await supabase
    .from('donations')
    .update({
      status: 'success',
      gateway_reference: gatewayRef,
      collection_method: channel,
      webhook_verified: true,
      webhook_received_at: received_at,
      name: customerName || undefined,
      email: customerEmail || undefined,
    })
    .eq('reference', reference)

  if (error) {
    console.error('Supabase update error:', error.message)
    if (logId) await supabase.from('webhook_logs').update({ status: 'db_error', processed: false }).eq('id', logId)
  } else {
    console.log('Paystack donation marked success:', reference)
    if (logId) await supabase.from('webhook_logs').update({ status: 'success', processed: true }).eq('id', logId)
  }

  res.status(200).json({ received: true })
})

// Verify Paystack payment (fallback)
router.post('/verify-payment', async (req, res) => {
  const { reference } = req.body
  if (!reference) return res.status(400).json({ error: 'Reference required' })
  try {
    const { data: donation } = await supabase
      .from('donations')
      .select('status, reference, amount, currency')
      .eq('reference', reference)
      .single()
    if (!donation) return res.status(404).json({ error: 'Donation not found' })
    if (donation.status === 'success') {
      return res.json({ message: 'Payment verified', status: 'success' })
    }
    const axios = require('axios')
    const paystackRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    )
    const pData = paystackRes.data && paystackRes.data.data
    if (pData && pData.status === 'success') {
      await supabase.from('donations')
        .update({
          status: 'success',
          gateway_reference: String(pData.id),
          collection_method: pData.channel,
          webhook_verified: true,
          webhook_received_at: new Date().toISOString(),
        })
        .eq('reference', reference)
      return res.json({ message: 'Payment verified via Paystack API', status: 'success' })
    }
    return res.json({ message: 'Payment not confirmed', status: pData && pData.status })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
