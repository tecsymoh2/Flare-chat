# Private Chat (static HTML/CSS/JS) - Cloudflare chat storage edition

**Where things live:** chats are stored in Cloudflare (Worker + D1, see `../worker/README.md`). Login, photos, videos, files,
voice notes, live pings and push notifications use Supabase.
**Before it works:** deploy the Worker, then set `API_URL` in `js/config.js` to the Worker address and redeploy this site.


No build step, no npm. Supabase (database, security rules, storage, edge functions, the two accounts) is already set up.

## Deploy
Upload this folder to https://vercel.com/new (framework preset: **Other**) so `index.html` is at the top level. Any static host works. HTTPS is required for voice notes, calls, install and push.

## Log in
- Stacy / `7ca654ld` (MARY)
- Symoh / `87dm654ls` (SYMOH)

## Features
Messages: replies (swipe right), reactions, edit, delete, pin, star, search, emoji, stickers, files, photos/videos with a full-screen viewer, voice notes (waveform, 1x/1.5x/2x, lock-screen controls, auto-play next), link previews, message info (tap the ticks), read receipts, older messages load on scroll.
Presence: online / last seen, typing indicator. Calls: voice and video.
Chat: disappearing messages, delete whole chat, theme + wallpaper, profile photos, **export backup** (.txt or .zip with media).
Device: app lock (PIN), sound, **mute for 1h / 8h / until 8am / until unmuted**, **background push notifications**, install to home screen.

## New in this version
- **Sending:** messages show a clock while sending, queue offline and send when you reconnect, and show "Tap to retry" if they fail. Drafts (text and reply) are kept when you close the app.
- **Reading:** a "New messages" divider, and a jump-to-latest button with an unread count. Call history lines (outgoing, incoming, missed, declined). "Recording voice…" shows in the header.
- **Media:** thumbnails (faster chat), several photos/videos in one go, view-once photos (deleted from storage after they are closed), reaction picker with any emoji.
- **For two:** scheduled messages (sent even when the app is closed), shared to-do list and countdowns, location sharing, and Share-to-chat from the phone gallery (Android, installed app).
- **Account:** change password, see where you are signed in and sign out other devices, and a cooldown after repeated wrong passwords.

## Storage and deletes
- Photos are resized to at most 1600 px and re-saved as JPEG; videos are re-encoded in the browser (about 960 px, ~1.3 Mbps, up to 3 minutes) before upload. Small files and GIFs are sent as they are. A "Send original" button skips video shrinking.
- Deleting a message, deleting the whole chat, and disappearing messages all delete the files from Supabase Storage on the server. An hourly cleanup also removes any file that no message points to.

## Turn on background notifications
Menu (your avatar) → Notifications & sound → Turn on background notifications. On iPhone, first add the app to the Home Screen (Share → Add to Home Screen) and open it from there. Each person does this on their own device.

## Reliable calls (optional)
Calls use free public STUN servers and work on most networks. For strict networks add a TURN relay: create a free account with a TURN provider (for example Metered or Cloudflare), then put the credentials in `js/config.js` under `TURN_SERVERS`.

## Not included
End-to-end encryption, GIF search (needs a Tenor/Giphy key).
