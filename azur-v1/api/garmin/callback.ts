import crypto from 'crypto';

function getCookie(
  cookieHeader: string | undefined,
  name: string,
) {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');

  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.trim().split('=');

    if (key === name) {
      return decodeURIComponent(valueParts.join('='));
    }
  }

  return null;
}

export default async function handler(req: any, res: any) {
  const code =
    typeof req.query.code === 'string'
      ? req.query.code
      : null;

  const returnedState =
    typeof req.query.state === 'string'
      ? req.query.state
      : null;

  const codeVerifier = getCookie(
    req.headers.cookie,
    'garmin_code_verifier',
  );

  const expectedState = getCookie(
    req.headers.cookie,
    'garmin_oauth_state',
  );

  if (!code || !returnedState) {
    return res.status(400).json({
      error: 'Missing Garmin authorization code or state.',
    });
  }

  if (
    !expectedState ||
    !crypto.timingSafeEqual(
      Buffer.from(returnedState),
      Buffer.from(expectedState),
    )
  ) {
    return res.status(400).json({
      error: 'Garmin OAuth state validation failed.',
    });
  }

  if (!codeVerifier) {
    return res.status(400).json({
      error: 'Garmin PKCE verifier was not found.',
    });
  }

  const clientId = process.env.GARMIN_CLIENT_ID;
  const clientSecret = process.env.GARMIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      error: 'Garmin credentials are not configured.',
    });
  }

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

  const permissionResponse = await fetch(
    'https://apis.garmin.com/partner-gateway/rest/user/permissions',
    {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    },
  );

  const permissions = permissionResponse.ok
    ? await permissionResponse.json()
    : null;

  res.setHeader('Set-Cookie', [
    `garmin_access_token=${encodeURIComponent(
      tokens.access_token,
    )}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${
      tokens.expires_in ?? 86400
    }`,

    `garmin_refresh_token=${encodeURIComponent(
      tokens.refresh_token,
    )}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${
      tokens.refresh_token_expires_in ?? 7775998
    }`,

    'garmin_code_verifier=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
    'garmin_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
  ]);

  return res.status(200).json({
    connected: true,
    garminUserId: garminUser.userId,
    permissions,
  });
}
