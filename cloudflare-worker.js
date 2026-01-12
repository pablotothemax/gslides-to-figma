/**
 * Cloudflare Worker for Google OAuth
 *
 * Deploy this to Cloudflare Workers (free tier).
 *
 * Environment variables to set in Cloudflare dashboard:
 * - GOOGLE_CLIENT_ID: Your Google OAuth Client ID
 * - GOOGLE_CLIENT_SECRET: Your Google OAuth Client Secret
 *
 * KV Namespace binding required:
 * - TOKEN_STORE: A KV namespace for temporary token storage
 *
 * To create KV namespace:
 * 1. Go to Workers & Pages > KV
 * 2. Create a namespace called "gslides-tokens"
 * 3. Go to your Worker > Settings > Variables
 * 4. Under "KV Namespace Bindings", add:
 *    - Variable name: TOKEN_STORE
 *    - KV namespace: gslides-tokens
 */

const SCOPES = [
  'https://www.googleapis.com/auth/presentations.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
].join(' ');

const TOKEN_TTL = 300; // 5 minutes in seconds

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
      const sessionId = url.searchParams.get('session') || '';
      const redirectUri = `${url.origin}/callback`;
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', SCOPES);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('state', sessionId); // Pass session ID through OAuth state

      return Response.redirect(authUrl.toString(), 302);
    }

    // Route: OAuth callback
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const sessionId = url.searchParams.get('state') || '';

      if (error) {
        return new Response(errorPage(error, sessionId), {
          headers: { 'Content-Type': 'text/html' }
        });
      }

      if (!code) {
        return new Response(errorPage('No authorization code received', sessionId), {
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
          return new Response(errorPage(tokens.error_description || tokens.error, sessionId), {
            headers: { 'Content-Type': 'text/html' }
          });
        }

        // Store token with session ID in KV for polling
        if (sessionId && env.TOKEN_STORE) {
          await env.TOKEN_STORE.put(sessionId, tokens.access_token, {
            expirationTtl: TOKEN_TTL
          });
        }

        // Return success page
        return new Response(successPage(tokens.access_token, sessionId), {
          headers: { 'Content-Type': 'text/html' }
        });

      } catch (err) {
        return new Response(errorPage(err.message, sessionId), {
          headers: { 'Content-Type': 'text/html' }
        });
      }
    }

    // Route: Poll for token
    if (url.pathname === '/token') {
      const sessionId = url.searchParams.get('session');

      if (!sessionId) {
        return new Response(JSON.stringify({ error: 'Missing session ID' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check if KV is configured
      if (!env.TOKEN_STORE) {
        return new Response(JSON.stringify({
          error: 'KV storage not configured. Please set up TOKEN_STORE KV binding.'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      try {
        const token = await env.TOKEN_STORE.get(sessionId);

        if (token) {
          // Delete token after retrieval (one-time use)
          await env.TOKEN_STORE.delete(sessionId);
          return new Response(JSON.stringify({
            success: true,
            accessToken: token
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Token not ready yet
        return new Response(JSON.stringify({ success: false, pending: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Default: show info
    return new Response('GSlides Figma OAuth Worker. Use /auth to start.', {
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};

function successPage(accessToken, sessionId) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Authentication Successful</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: white; padding: 40px; border-radius: 12px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #1a1a1a; font-size: 24px; margin: 0 0 8px 0; }
    p { color: #666; margin: 0; }
    .check { font-size: 48px; margin-bottom: 16px; color: #34A853; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">&#10003;</div>
    <h1>Signed in!</h1>
    <p>Return to Figma to continue.</p>
  </div>
  <script>
    // Try postMessage (may not work in Figma sandbox)
    if (window.opener) {
      try {
        window.opener.postMessage({ type: 'oauth-success', accessToken: '${accessToken}' }, '*');
      } catch (e) {
        console.log('postMessage failed:', e);
      }
    }
    // Auto-close after delay
    setTimeout(() => {
      window.close();
    }, 2000);
  </script>
</body>
</html>`;
}

function errorPage(error, sessionId) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Authentication Failed</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: white; padding: 40px; border-radius: 12px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; }
    h1 { color: #c00; font-size: 24px; margin: 0 0 8px 0; }
    p { color: #666; margin: 0; word-break: break-word; }
    .icon { font-size: 48px; margin-bottom: 16px; color: #EA4335; }
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
      try {
        window.opener.postMessage({ type: 'oauth-error', error: '${error}' }, '*');
      } catch (e) {
        console.log('postMessage failed:', e);
      }
    }
  </script>
</body>
</html>`;
}
