import crypto from 'crypto';

export default function handler(req: any, res: any) {
  const clientId = process.env.GARMIN_CLIENT_ID;

  if (!clientId) {
    return res.status(500).json({
      error: 'Garmin Client ID is not configured.',
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

  res.redirect(302, authorizationUrl.toString());
}
