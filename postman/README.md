# Postman collection

Drives the reference server in [`../server`](../server) without building or installing a
sample app. Everything runs in Postman except the sign-in itself, which needs a person in
the KRDPASS app on a phone.

Import both files:

- `krdpass-auth.postman_collection.json`
- `krdpass-local.postman_environment.json`

## Just checking that PAR works

You do not need a tunnel, a phone, or the callback catcher to answer "does PAR succeed and
what does it need". PAR is a server-to-CAS call. Only steps 3 and 4 involve a device.

What you do need is the server running, and that is the part a `clientId` alone will not
buy you. This server is the confidential half of the flow: it signs the authorization
request with an RSA key and authenticates to CAS with a client secret. It refuses to start
without `CLIENT_ID`, `CLIENT_SECRET`, `RSA_PRIVATE_KEY` and `ALLOWED_REDIRECT_HOSTS`.

So there are two versions of this.

**Without real credentials.** Generate a throwaway key and use placeholder values:

```bash
cd server
cp .env.example .env
openssl genrsa 2048 | awk '{printf "%s\\n", $0}' | sed 's/^/RSA_PRIVATE_KEY="/; s/$/"/' >> .env
npm start
```

Then edit `.env` so `ALLOWED_REDIRECT_HOSTS` matches the host in the `redirectUri` you put
in Postman. The **Validation checks** folder passes in full, because every one of those
rejections happens before the server talks to CAS. Step 2 reaches CAS and is turned away,
which still shows you the exact request and the exact response. Nothing secret changes
hands.

**With real credentials.** `CLIENT_ID`, `CLIENT_SECRET` and the RSA private key registered
during onboarding, in `server/.env`. Step 2 then answers 200 with a `request_uri`, which is
proof that the client id, secret, signing key, redirect URI and scopes are all accepted.

## What has to be true first

The authorization code is only ever delivered to your **registered redirect URI**. Postman
cannot receive it, so something has to be listening there.

1. Onboarding-approved credentials in `server/.env`, and the server running.
2. `DEMO_CALLBACK_CATCHER=true` in `server/.env`, so the server answers at the redirect
   path and parks what arrives.
3. Your registered redirect URI has to reach that server. It is an HTTPS URL and the
   server binds to `127.0.0.1`, so a local run needs a tunnel whose hostname is the
   registered host:

   Use whatever already routes that hostname, or a named tunnel pointed at
   `http://localhost:3000`. Check your tunnel's own current syntax; the exact flags
   change between versions.

   If the registered host is already a machine you control, run the server there instead
   and point `catcherBaseUrl` at it. Only the catcher may live elsewhere: `/oauth/par` and
   `/oauth/token` must hit the same process, because the transaction store is in memory.
4. `ALLOWED_REDIRECT_HOSTS` in `server/.env` contains that host.
5. **No app on the test phone may claim that host.** An installed sample app takes the
   redirect through Universal Links or App Links, fails its own `state` check because the
   transaction belongs to Postman, and the catcher never sees it. Uninstall it.
6. Fill `clientId` and `redirectUri` in the Postman environment. Both are in
   `shared/secrets/.env` as `CLIENT_ID` and `REDIRECT_URI`.

Use an iPhone. The iOS transport is a Universal Link in both directions, which is the
closest thing to what this collection does by hand. Android sign-in is an Activity result,
so KRDPASS reads the calling package and signing certificate from the OS; a launch from a
browser carries neither and counts as a browser transport, which needs a separate
browser-client registration.

## The run

Open the Sign-in flow folder and send the four requests in order.

| Step | What happens |
| --- | --- |
| 1. Health | Confirms the server is up. |
| 2. Pushed authorization request | Generates PKCE and `state`, gets a `request_uri`, and logs a launch URL to the Postman console. |
| 3. Wait for the authorization code | Collects whatever the redirect delivered. |
| 4. Token exchange | Trades the code for tokens. |

Between 2 and 3, open the launch URL from the console on the phone and sign in. The phone
lands on a page showing the code, and step 3 picks it up. Step 3 answers
`{"pending": true}` until that happens, so send it again after signing in.

A 200 on step 2 is worth something on its own. It means CAS accepted the signed request,
so the client id, client secret, RSA signing key, redirect URI and scopes are all correct
and reachable from that machine.

## Two other folders

**Validation checks** runs entirely against the local server, no phone and no CAS round
trip. Eight requests covering the rejections: non-S256 method, short code challenge, scope
without `openid`, unknown environment, redirect host outside the allowlist, `authServerUrl`
override, extra fields on the token request, unknown state.

**Optional token routes** covers refresh and revoke. Both answer 404 unless
`DEMO_UNAUTHENTICATED_TOKEN_ROUTES=true`, and they need a refresh token from a completed
sign-in.

## Things that will catch you out

- **Two clocks.** The server transaction defaults to 5 minutes, caps at 10 through
  `AUTH_TRANSACTION_TTL_MS`, and never outlives the PAR `expires_in` CAS returns. KRDPASS
  expires the same `request_uri` on its own schedule. Have the phone in your hand before
  sending step 2.
- **One shot per PAR.** The `state` is consumed atomically at token exchange and the code
  is single use. Any mistake means starting again at step 2.
- **A capture is handed out once.** A second read of step 3 answers `{"pending": true}`,
  so a stale code from an abandoned attempt is never exchanged by accident.
- **Rate limit.** 30 requests a minute per peer address across `/oauth/*`, and everything
  from one machine shares a bucket. Running the whole collection twice in a minute trips
  it. The catcher routes sit outside `/oauth/`, so polling step 3 is free.
- **Nothing arrives at all?** Check the Postman console for the launch URL, check the
  hostname really routes to the server running the catcher, and check no app on the phone
  claims the redirect host. One unverified possibility is left: if KRDPASS opens the
  redirect as a universal link only and nothing on the device claims that host, the
  redirect fails silently and the catcher never sees it.
