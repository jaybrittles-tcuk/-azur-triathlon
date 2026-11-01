import { timingSafeEqual } from 'node:crypto';

/**
 * STAGING-ONLY test receiver for synthetic Garmin-shaped health notifications.
 * NOT a Garmin production webhook: vendor authenticity/transport must be
 * verified from the authenticated Garmin API documentation before activation.
 * No Supabase writes or health-data logging.
 */
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  if (process.env.AZUR_GARMIN_WEBHOOK_STAGING !== 'true')
    return res.status(503).json({error:'Garmin health intake is not enabled'});
  const secret = process.env.AZUR_GARMIN_WEBHOOK_STAGING_SECRET;
  if (!secret || secret.length < 32) return res.status(503).json({error:'Staging receiver not configured'});
  const value = req.headers['authorization'];
  const supplied = typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7) : '';
  const actual = Buffer.from(supplied);
  const expected = Buffer.from(secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return res.status(401).json({error:'Unauthorised'});
  const length = Number(req.headers['content-length'] || 0);
  if (length > 65536) return res.status(413).json({error:'Payload too large'});
  // The Vercel body parser may already have read the request; bounded body
  // content is checked again here before any future processing.
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Buffer.byteLength(JSON.stringify(body)) > 65536)
    return res.status(400).json({error:'Invalid payload'});
  // No user IDs, health metrics, tokens or raw payloads written to logs/DB.
  // Respond explicitly that no ingestion occurred.
  return res.status(202).json({acceptedForValidation:true,ingested:false});
}
