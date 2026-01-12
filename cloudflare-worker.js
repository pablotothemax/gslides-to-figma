/**
 * Cloudflare Worker for Google OAuth
 *
 * Deploy this to Cloudflare Workers (free tier).
 *
 * Environment variables to set in Cloudflare dashboard:
 * - GOOGLE_CLIENT_ID: Your Google OAuth Client ID
 * - GOOGLE_CLIENT_SECRET: Your Google OAuth Client Secret
 */

const SCOPES = [
  'https://www.googleapis.com/auth/presentations.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
].join(' ');

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS headers for API requests
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Route: Start OAuth flow
    if (url.pathname === '/auth') {
      const redirectUri = `${url.origin}/callback`;
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', SCOPES);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');

      return Response.redirect(authUrl.toString(), 302);
    }

    // Route: OAuth callback
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        return new Response(errorPage(error), {
          headers: { 'Content-Type': 'text/html' }
        });
      }

      if (!code) {
        return new Response(errorPage('No authorization code received'), {
          headers: { 'Content-Type': 'text/html' }
        });
      }

      try {
        // Exchange code for tokens
        const redirectUri = `${url.origin}/callback`;
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
          })
        });

        const tokens = await tokenResponse.json();

        if (tokens.error) {
          return new Response(errorPage(tokens.error_description || tokens.error), {
            headers: { 'Content-Type': 'text/html' }
          });
        }

        // Return success page that sends token to opener
        return new Response(successPage(tokens.access_token), {
          headers: { 'Content-Type': 'text/html' }
        });

      } catch (err) {
        return new Response(errorPage(err.message), {
          headers: { 'Content-Type': 'text/html' }
        });
      }
    }

    // Default: show info
    return new Response('GSlides Figma OAuth Worker. Use /auth to start.', {
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};

function successPage(accessToken) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Authentication Successful</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: white; padding: 40px; border-radius: 12px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #1a1a1a; font-size: 24px; margin: 0 0 8px 0; }
    p { color: #666; margin: 0; }
    .check { font-size: 48px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">&#10003;</div>
    <h1>Signed in!</h1>
    <p>You can close this window.</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'oauth-success', accessToken: '${accessToken}' }, '*');
      setTimeout(() => window.close(), 1500);
    }
  </script>
</body>
</html>`;
}

function errorPage(error) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Authentication Failed</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: white; padding: 40px; border-radius: 12px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; }
    h1 { color: #c00; font-size: 24px; margin: 0 0 8px 0; }
    p { color: #666; margin: 0; }
    .icon { font-size: 48px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10007;</div>
    <h1>Authentication Failed</h1>
    <p>${error}</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'oauth-error', error: '${error}' }, '*');
    }
  </script>
</body>
</html>`;
}
