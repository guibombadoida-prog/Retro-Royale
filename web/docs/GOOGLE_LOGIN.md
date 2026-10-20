# Google login configuration

The Google login code is implemented, but the button stays disabled until both runtime values are configured. No real Google credentials were available while implementing this change. Creating a Google OAuth client requires access to the owner's Google Cloud project.

1. In Google Cloud Console, configure Google Auth Platform branding and audience for Retro Royale. Request only the `openid`, `email` and `profile` scopes.
2. Create an OAuth client of type **Web application**. Register this exact authorized redirect URI:

   `https://retro-royale-vfx.gabriel-divino1.chatgpt.site/api/account/callback`

3. Configure the existing site's runtime secrets `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` using that client's credentials. Keep the secret out of source and client code. Publish the site with those values.
4. If the Google project is in testing, add the intended test accounts. Set the audience/publishing status appropriate for real players before releasing the Google login publicly.

The Android 1.5 app opens this site's authorization URL in the system browser. The game's original WebView waits on a separate one-time handoff. The session is issued only to that original context, using a Secure, HttpOnly, SameSite=Lax cookie. Google ID tokens are verified using Google's JWKS, issuer, audience, expiry and nonce; the code exchange uses PKCE and a browser-bound state cookie. No Gmail messages or Drive files are requested.

First login copies the server-confirmed visitor progression into a separate canonical account profile. A second device signing in with the same Google subject receives that account's progress, deck and preferences. Existing account decks are kept during a merge. Client save writes cannot grant champions or change battle counts. Revision checks prevent an older device from overwriting a newer save. Signing out revokes that device's app session; it does not delete cloud progress.

A visitor can also copy their 72-character recovery code from the menu and restore it in another installation. The code gives access to that visitor profile, so it is shown only on explicit request. Account progress uses Google sign-in instead of this visitor code.

Until runtime credentials are configured, visitor play, champion progression and room connections continue normally. The button reports that Google login is being configured instead of simulating a successful sign-in.

Official reference: https://developers.google.com/identity/openid-connect/openid-connect
