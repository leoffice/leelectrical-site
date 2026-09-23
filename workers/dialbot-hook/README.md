# le-dialbot-hook

Cloudflare Worker: Twilio Voice webhook for **spare DID only** `+17185502330` (PN `PN0f812aeebc9d9b092d095f9b4935f6fd`) → Dialbot voice assistant.

Sibling of `workers/helen-hook` (`le-helen-hook`). Same SAS-style shape:
- `POST /twilio/voice` — answer inbound, start conference, REST-dial Dialbot Bland leg
- `POST /twilio/voice-next` — next step after Dial action
- `GET/POST /twilio/wait` — conference waitUrl
- `GET /health` — `{ ok, service: dialbot-hook }`

SAS Flex conversation logic (Emergency · Power Outage · General Service · Estimate · Follow-up · Other, intake, escalate Levi `+12196140913`, post-call `sas-inbound`) lives in the **Bland Dialbot agent prompt**. This Worker is the Twilio front only. It does not dial Helen and it does not edit 320 or 920.

## Hard gates

Do **not** change VoiceUrl on Helen live lines:
- `+13203857608` (320 Bland Helen)
- `+19208161747` (920 helen-hook Twilio)

Worker refuses those DIDs if somehow pointed here. The AI leg dials env `DIALBOT_BLAND_DID` from the spare DID, and refuses that env var when it is 320 or 920.

## Repo placement

Land as `workers/dialbot-hook/` in `leoffice/leelectrical-site` (wrangler name `le-dialbot-hook`).

**Do not deploy** from this change. Levi holds deploy until GO, after a public Worker URL is wanted.

## Secrets (`wrangler secret put`)

- `HOOK_KEY` — query `?k=`
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`
- `DIALBOT_BLAND_DID` — Bland inbound DID for **Dialbot** (never Helen `+13203857608`)
- `BLAND_API_KEY` — optional

## Twilio attach (Dialbot owns; only after Levi GO + live Worker URL)

Only this IncomingPhoneNumber. Do not PATCH any other SID.

```
POST /2010-04-01/Accounts/{AccountSid}/IncomingPhoneNumbers/PN0f812aeebc9d9b092d095f9b4935f6fd.json
VoiceUrl=https://<worker>/twilio/voice?k=<HOOK_KEY>
VoiceMethod=POST
```

Example (spare PN only):

```
curl -sS -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/IncomingPhoneNumbers/PN0f812aeebc9d9b092d095f9b4935f6fd.json" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  --data-urlencode "VoiceUrl=https://le-dialbot-hook.<subdomain>.workers.dev/twilio/voice?k=$HOOK_KEY" \
  --data-urlencode "VoiceMethod=POST"
```

## Smoke (local, no Cloudflare deploy)

`CallSid=CA_TEST` is not a real Twilio SID, so the handler returns TwiML and does **not** REST-dial.

```
# from workers/dialbot-hook, with HOOK_KEY in the environment of a local wrangler dev:
npx wrangler dev --port 8787
curl -sS http://127.0.0.1:8787/health
curl -sS -X POST 'http://127.0.0.1:8787/twilio/voice?k=<HOOK_KEY>' \
  -d 'From=%2B12195551212&To=%2B17185502330&CallSid=CA_TEST'
```

## Smoke (after a later deploy)

```
curl -sS https://<worker>/health
curl -sS -X POST 'https://<worker>/twilio/voice?k=<HOOK_KEY>' \
  -d 'From=%2B12195551212&To=%2B17185502330&CallSid=CA_TEST'
```
