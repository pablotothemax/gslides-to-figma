# GSlides to Figma

Import Google Slides presentations into Figma as editable frames.

## Features

- OAuth authentication via Cloudflare Worker (popup flow)
- Preserves text content, fonts, and styling
- Imports images
- Supports basic shapes (rectangles, ellipses, lines)
- Tables converted to frame-based layouts
- Font fallback system (serif/sans/mono)

## Setup Instructions

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top and select "New Project"
3. Name it something like "GSlides Figma Plugin"
4. Click "Create"

### 2. Enable the Google Slides API

1. In your new project, go to **APIs & Services > Library**
2. Search for "Google Slides API"
3. Click on it and press **Enable**

### 3. Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen**
2. Select **External** (unless you have a Google Workspace org)
3. Click **Create**
4. Fill in the required fields:
   - App name: "GSlides Figma Plugin"
   - User support email: your email
   - Developer contact: your email
5. Click **Save and Continue**
6. On "Scopes" page, click **Add or Remove Scopes**
7. Add these scopes:
   - `https://www.googleapis.com/auth/presentations.readonly`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
8. Click **Save and Continue**
9. On "Test users" page, add your Google email (and any other testers)
10. Click **Save and Continue**

### 4. Create OAuth 2.0 Credentials

1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Application type: **Web application**
4. Name: "Figma Plugin"
5. Under **Authorized redirect URIs**, add:
   - `https://YOUR_WORKER_NAME.YOUR_SUBDOMAIN.workers.dev/callback`
   - (You'll update this after creating the worker)
6. Click **Create**
7. **Copy both the Client ID and Client Secret** - you'll need these for the worker

### 5. Deploy Cloudflare Worker

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) and sign up/log in (free)
2. Click **Workers & Pages** in the sidebar
3. Click **Create application** > **Create Worker**
4. Give it a name (e.g., `gslides-figma-oauth`)
5. Click **Deploy**
6. Click **Edit code** to open the editor
7. Replace all the code with the contents of `cloudflare-worker.js` from this repo
8. Click **Save and Deploy**
9. Go to **Settings** > **Variables**
10. Add these **Environment Variables**:
    - `GOOGLE_CLIENT_ID`: Your Google OAuth Client ID
    - `GOOGLE_CLIENT_SECRET`: Your Google OAuth Client Secret (click "Encrypt")
11. Click **Save**

### 6. Update Google OAuth Redirect URI

1. Go back to [Google Cloud Console](https://console.cloud.google.com/) > APIs & Services > Credentials
2. Click on your OAuth client
3. Under **Authorized redirect URIs**, update to match your worker URL:
   - `https://gslides-figma-oauth.YOUR_SUBDOMAIN.workers.dev/callback`
4. Click **Save**

### 7. Configure the Plugin

1. Open `ui.html` in a text editor
2. Find this line near the top of the `<script>` section:
   ```javascript
   const OAUTH_WORKER_URL = 'https://YOUR_WORKER_NAME.YOUR_SUBDOMAIN.workers.dev';
   ```
3. Replace with your actual worker URL (without trailing slash)

### 8. Build and Run

```bash
npm install
npm run build
```

Then in Figma:
1. Go to **Plugins > Development > Import plugin from manifest...**
2. Select the `manifest.json` file in this folder
3. Run the plugin from **Plugins > Development > GSlides to Figma**

## Usage

1. Click "Sign in with Google"
2. Authorize the plugin in the popup
3. Paste a Google Slides URL (e.g., `https://docs.google.com/presentation/d/ABC123/edit`)
4. Click "Import Slides"
5. Wait for import to complete

## Supported Elements

| Element | Support Level |
|---------|--------------|
| Text boxes | Full - preserves font, size, color |
| Rectangles | Full |
| Ellipses | Full |
| Rounded rectangles | Full |
| Lines | Full |
| Images | Full (fetched and embedded) |
| Tables | Basic (converted to frame layout) |
| Groups | Basic |
| Charts | Not supported (appear as placeholders) |
| Videos | Not supported |
| Embedded content | Not supported |

## Font Handling

The plugin attempts to match fonts in this order:
1. Exact font family from Google Slides
2. Mapped fallback (e.g., Roboto -> Inter)
3. Category-based fallback (serif -> Georgia, sans -> Inter, mono -> Roboto Mono)
4. Final fallback: Inter or Arial

## Troubleshooting

### "Popup blocked"
- Allow popups for figma.com in your browser settings

### "Authentication failed"
- Verify your worker URL is correct in `ui.html`
- Check that the redirect URI in Google Cloud matches your worker URL exactly
- Make sure your email is added as a test user in the OAuth consent screen
- Check the Cloudflare Worker logs for errors

### "Failed to fetch presentation"
- Verify the Google Slides URL is correct
- Make sure the presentation is shared with or owned by the signed-in account
- Check that the Google Slides API is enabled in your project

### Images not loading
- Some images may have CORS restrictions
- Images from external URLs (not Google Drive) may fail to load

## Development

```bash
# Watch for changes
npm run watch

# Lint
npm run lint
```

## Limitations

- Google OAuth consent screen stays in "Testing" mode unless you go through Google's verification process
- Test mode limits to 100 users
- Complex shapes (stars, arrows, callouts) render as rectangles
- Gradients are converted to solid colors
- Text alignment within shapes may not be perfectly preserved
