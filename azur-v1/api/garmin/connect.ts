import crypto from 'crypto';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed.',
    });
  }

  const clientId = process.env.GARMIN_CLIENT_ID;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!clientId || !supabaseUrl || !serviceKey) {
    return res.status(500).json({
      error: 'Server configuration is incomplete.',
    });
  }

  const authorization = req.headers.authorization;

  if (
    !authorization ||
    !authorization.startsWith('Bearer ')
  ) {
    return res.status(401).json({
      error: 'Azur authentication required.',
    });
  }

  const userToken = authorization.slice(7);

  // Verify the logged-in Supabase user.
  const userResponse = await fetch(
    `${supabaseUrl}/auth/v1/user`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${userToken}`,
      },
    },
  );

  if (!userResponse.ok) {
    return res.status(401).json({
      error: 'Invalid Azur session.',
    });
  }

  const user = await userResponse.json();

  if (!user?.id) {
    return res.status(401).json({
      error: 'Unable to identify Azur user.',
    });
  }

  // Find the athlete profile belonging to this user.
  const athleteResponse = await fetch(
    `${supabaseUrl}/rest/v1/athlete_profile?user_id=eq.${encodeURIComponent(
      user.id,
    )}&select=id&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${userToken}`,
      },
    },
  );

  if (!athleteResponse.ok) {
    return res.status(500).json({
      error: 'Unable to load athlete profile.',
    });
  }

  const athletes = await athleteResponse.json();
  const athleteId = athletes?.[0]?.id;

  if (!athleteId) {
    return res.status(404).json({
      error: 'Athlete profile not found.',
    });
  }

  const codeVerifier = crypto
    .randomBytes(48)
    .toString('base64url');

  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  const nonce = crypto
    .randomBytes(24)
    .toString('base64url');

  const statePayload = `${athleteId}.${nonce}`;

  const stateSignature = crypto
    .createHmac('sha256', serviceKey)
    .update(statePayload)
    .digest('base64url');

  const state = Buffer.from(
    `${statePayload}.${stateSignature}`,
  ).toString('base64url');

  const redirectUri =
    'https://azur-triathlon.vercel.app/api/garmin/callback';

  res.setHeader('Set-Cookie', [
    `garmin_code_verifier=${codeVerifier}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
    `garmin_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
  ]);

  const authorizationUrl = new URL(
    'https://connect.garmin.com/oauth2Confirm',
  );

  authorizationUrl.searchParams.set(
    'response_type',
    'code',
  );

  authorizationUrl.searchParams.set(
    'client_id',
    clientId,
  );

  authorizationUrl.searchParams.set(
    'code_challenge',
    codeChallenge,
  );

  authorizationUrl.searchParams.set(
    'code_challenge_method',
    'S256',
  );

  authorizationUrl.searchParams.set(
    'redirect_uri',
    redirectUri,
  );

  authorizationUrl.searchParams.set(
    'state',
    state,
  );

  return res.status(200).json({
    authorizationUrl: authorizationUrl.toString(),
  });
}
