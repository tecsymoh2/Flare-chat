# Chat API (Cloudflare Worker + D1)

Chats (messages, reactions, stars, scheduled messages, shared list) are stored in the Cloudflare D1 database
**private-chat** (already created, tables already added). Login, photos/videos/files, live pings and push stay on Supabase.

## Deploy from the dashboard (no command line)
1. Cloudflare dashboard > **Workers & Pages** > **Create** > **Create Worker** > name it `private-chat-api` > **Deploy**.
2. Click **Edit code**, delete everything, paste the contents of `index.js`, click **Deploy**.
3. **Settings > Bindings > Add > D1 database**: variable name `DB`, database `private-chat`.
4. **Settings > Variables and Secrets**, add these as **Text**:
   - `SUPABASE_URL` = https://faetctxgwkqytxukoweu.supabase.co
   - `SUPABASE_ANON_KEY` = your public anon key (same as in `site/js/config.js`)
   - `CONVERSATION_ID` = 11111111-1111-4111-8111-111111111111
   - `ALLOWED_ORIGINS` = the address of your site, e.g. https://private-chats-3vbg.vercel.app
   and these as **Secret**:
   - `SUPABASE_SERVICE_ROLE_KEY` = Supabase > Project Settings > API > the `service_role` key (use the legacy JWT key if you see two)
   - `PUSH_SECRET` = the push secret you were given in chat
5. **Settings > Triggers > Cron Triggers > Add** `* * * * *` (sends scheduled messages, deletes expired ones, hourly cleanup of stray files).
6. Copy the Worker address (https://private-chat-api.YOUR-NAME.workers.dev), put it in `site/js/config.js` as `API_URL`, and redeploy the site.
7. Open the site and sign in. The first request copies your old chats from Supabase into D1 automatically (once).

Check it is alive: open `https://YOUR-WORKER/api/health`. It should show `{"ok":true}`.

## Notes
- Deleting a message, a view-once photo or the whole chat also deletes the files from Supabase Storage (done by the Worker).
- The hourly sweep removes files no message points to (older than 1 hour) and refuses to delete anything if most files look orphaned.
- `test.mjs` is the test suite used to check the Worker (`node --no-warnings test.mjs`, Node 22+).
