# SAS Flex (Specialty Answering Service) — integration research

*Researched 2026-07-05 for LE Pro module 1. Question: does SAS Flex
(sasdesk.com / flexclient.sasdesk.com) offer an API or export we can use to
pull calls/messages into LE Pro?*

## Short answer

There is **no public pull/REST API** for the call log — but SAS Flex has a
**Custom Action app that pushes call/message data to any webhook we host**,
which is actually a better fit for us. Point it at a Netlify Function and
every answered call lands in our store in real time.

## What exists

1. **Custom Action app (webhook push) — the winner.**
   Installed from Flex portal → Integrations. Posts message data to any
   endpoint URL on call completion, driven by the call script's merge fields
   (caller name, phone, message body, custom block labels — configurable
   per script path).
   - Auth options: Username+Password, Auth Key, or None — plus the endpoint URL.
   - Payload format: non-encoded (form) or **JSON-encoded** string.
   - SAS support (service@specialtyansweringservice.net) wires it into the
     script block, or it can be self-integrated.
   - Docs: <https://support.specialtyansweringservice.net/article/368-post-message-data-to-webhooks-using-custom-action-app>

2. **Built-in CRM integrations** (Zendesk, Freshdesk, Help Scout, Capsule,
   Clio, Salesforce, Zoho, MailChimp…) — OAuth-based, per-product. None match
   our stack directly; the Custom Action webhook covers the same need.
   A **Zapier bridge** is documented for platforms without webhooks.

3. **Email App / message forwarding (fallback #1).**
   The Flex Email App sends call details to any email in a configurable
   format after each call, and **inbound SMS can be forwarded to up to 5
   email addresses**. Since Dispatch already watches the Gmail inbox, this is
   a zero-code integration path: parse the structured SAS email into
   `calls`/`messages` rows.
   - Docs: <https://support.specialtyansweringservice.net/article/329-how-to-configure-the-sas-flex-email-app>

4. **Google Calendar events (fallback #2, already live).**
   SAS operators already create events on our Google Calendar when booking
   appointments; those flow into the existing `calendar` Netlify store that
   LE Pro's Today view reads. No extra work needed for appointments.

5. **Call log** lives in the Flex portal (web + Flex mobile app) with
   filtering; no documented bulk export/API. An SMS send/receive UI exists in
   the portal. The Instant Callback app explicitly has *no* REST/SOAP API
   (just an HTML form POST to an SAS servlet, unauthenticated).

## Recommended path for LE Pro

1. **Module 2:** add a `sas-inbound` Netlify Function; configure the SAS
   Custom Action app with Auth Key + that endpoint, JSON-encoded. Store each
   post as a `calls`/`messages` record (schema already in
   `pro-src/supabase/schema.sql`: `calls.source='sas'`).
2. **Belt-and-suspenders:** keep SMS→email forwarding on so Dispatch's inbox
   remains the audit copy.
3. **Appointments:** keep using the existing Google Calendar → `calendar`
   store sync (no change).

## Sources

- <https://support.specialtyansweringservice.net/article/368-post-message-data-to-webhooks-using-custom-action-app>
- <https://support.specialtyansweringservice.net/article/329-how-to-configure-the-sas-flex-email-app>
- <https://support.specialtyansweringservice.net/article/446-sending-and-receiving-sms-notifications-from-your-sas-flex-portal>
- <https://support.specialtyansweringservice.net/article/353-introduction-to-the-sas-flex-call-log>
- <https://support.specialtyansweringservice.net/article/461-how-to-configure-the-sas-flex-instant-callback-app>
- <https://support.specialtyansweringservice.net/collection/396-sas-flex>
