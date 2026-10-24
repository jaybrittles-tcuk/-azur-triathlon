export default async function handler(req: any, res: any) {
  const code =
    typeof req.query.code === 'string'
      ? req.query.code
      : null;

  const returnedState =
    typeof req.query.state === 'string'
      ? req.query.state
      : null;

  if (!code || !returnedState) {
    return res.status(400).json({
      error: 'Missing Garmin authorization code or state.',
    });
  }

  const clientId = process.env.GARMIN_CLIENT_ID;
  const clientSecret = process.env.GARMIN_CLIENT_SECRET;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !clientId ||
    !clientSecret ||
    !supabaseUrl ||
    !serviceKey
  ) {
    return res.status(500).json({
      error: 'Server configuration is incomplete.',
    });
  }

  // 1. Find the server-side OAuth state.
  const stateResponse = await fetch(
    `${supabaseUrl}/rest/v1/garmin_oauth_state?state=eq.${encodeURIComponent(
      returnedState,
    )}&select=id,athlete_id,code_verifier,expires_at&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );

  if (!stateResponse.ok) {
    return res.status(500).json({
      error: 'Unable to validate Garmin OAuth state.',
    });
  }

  const stateRows = await stateResponse.json();
  const savedState = stateRows?.[0];

  if (!savedState) {
    return res.status(400).json({
      error: 'Garmin OAuth state validation failed.',
    });
  }

  if (
    new Date(savedState.expires_at).getTime() <
    Date.now()
  ) {
    return res.status(400).json({
      error: 'Garmin OAuth request has expired.',
    });
  }

  const athleteId = savedState.athlete_id;
  const codeVerifier = savedState.code_verifier;

  // 2. Delete the temporary state so it cannot be reused.
  await fetch(
    `${supabaseUrl}/rest/v1/garmin_oauth_state?id=eq.${encodeURIComponent(
      savedState.id,
    )}`,
    {
      method: 'DELETE',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );

  // 3. Exchange Garmin authorization code for tokens.
  const redirectUri =
    'https://azur-triathlon.vercel.app/api/garmin/callback';

  const basicAuth = Buffer.from(
    `${clientId}:${clientSecret}`,
  ).toString('base64');

  const tokenResponse = await fetch(
    'https://diauth.garmin.com/di-oauth2-service/oauth/token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
      }),
    },
  );

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();

    console.error(
      'Garmin token exchange failed:',
      tokenResponse.status,
      errorText,
    );

    return res.status(502).json({
      error: 'Unable to exchange Garmin authorization code.',
    });
  }

  const tokens = await tokenResponse.json();

  // 4. Fetch persistent Garmin User ID.
  const userResponse = await fetch(
    'https://apis.garmin.com/partner-gateway/rest/user/id',
    {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    },
  );

  if (!userResponse.ok) {
    return res.status(502).json({
      error: 'Garmin connected, but user ID lookup failed.',
    });
  }

  const garminUser = await userResponse.json();

  // 5. Calculate access-token expiry.
  const accessExpiresAt = new Date(
    Date.now() +
      Number(tokens.expires_in ?? 86400) * 1000,
  ).toISOString();

  // 6. Save/update the Garmin connection.
  const integrationResponse = await fetch(
    `${supabaseUrl}/rest/v1/athlete_integration?on_conflict=athlete_id,provider`,
    {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        athlete_id: athleteId,
        provider: 'garmin',
        provider_athlete_id: garminUser.userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: accessExpiresAt,
        scopes: tokens.scope ?? null,
        connected_at: new Date().toISOString(),
      }),
    },
  );

  if (!integrationResponse.ok) {
    const errorText = await integrationResponse.text();

    console.error(
      'Unable to save Garmin integration:',
      integrationResponse.status,
      errorText,
    );

    return res.status(500).json({
      error:
        'Garmin connected, but Azur could not save the connection.',
    });
  }

  // 7. Return to Azur.
  return res.redirect(
    302,
    'https://azur-triathlon.vercel.app/?garmin=connected',
  );
}
