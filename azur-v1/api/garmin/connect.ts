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

  const athleteResponse = await fetch(
    `${supabaseUrl}/rest/v1/athlete_profile?user_id=eq.${encodeURIComponent(
      user.id,
    )}&select=id&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
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

  const state = crypto
    .randomBytes(32)
    .toString('base64url');

  const expiresAt = new Date(
    Date.now() + 10 * 60 * 1000,
  ).toISOString();

  const stateResponse = await fetch(
    `${supabaseUrl}/rest/v1/garmin_oauth_state`,
    {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        athlete_id: athleteId,
        state,
        code_verifier: codeVerifier,
        expires_at: expiresAt,
      }),
    },
  );

  if (!stateResponse.ok) {
    const errorText = await stateResponse.text();

    console.error(
      'Unable to save Garmin OAuth state:',
      stateResponse.status,
      errorText,
    );

    return res.status(500).json({
      error: 'Unable to prepare Garmin connection.',
    });
  }

  const redirectUri =
    'https://azur-triathlon.vercel.app/api/garmin/callback';

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
