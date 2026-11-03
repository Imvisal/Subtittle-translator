# One-time announcements

Send a one-time message (notification + popup with optional picture, an
"Open" button and a "Not now" button) to every app user, any time you want.
No new app release is needed: just edit `announcement.json` and deploy.

## How to send one

Open `/admin.html`, sign in with the admin key and use the **Announcement** card: fill the
fields, press **Send announcement** (a new ID = shown again to everyone) or **Stop it**.
It is saved in the database, so no deploy or app release is needed. The apps still read
`/announcement.json`, which the site answers from the database (`vercel.json` rewrite).

Users get it:
- Android: within about 15 minutes even when the app is closed (a notification
  with the picture), or right away when they open the app. Tapping the notification
  opens the app and shows the popup. The announcement is also saved in the bell
  (Notifications) list inside the app, even if the phone notification is switched
  off, and tapping it there opens the popup again.
- Windows: within ~6 hours, or when the app starts. It is added to the bell list too.

Each user sees each `id` **only once**. To send another one later, change the `id`.
To stop an announcement, set `"enabled": false`.

## Fields

| field        | meaning                                                              |
|--------------|----------------------------------------------------------------------|
| `enabled`    | `true` to send, `false` to stop                                      |
| `id`         | unique text; a new id = shown again to everyone                      |
| `title`      | heading                                                              |
| `body`       | message text (line breaks allowed with `\n`)                         |
| `image`      | optional. `https://...` link, or a file in the site root like `/promo.png` |
| `url`        | optional. `https://...` link opened by the Open button. No `url` = only an OK button |
| `openLabel`  | text of the Open button (default `Open`)                             |
| `laterLabel` | text of the "Not now" button (default `Not now`)                     |
| `platforms`  | optional: `["android"]`, `["windows"]` or both (default: both)       |
| `expires`    | optional `YYYY-MM-DD`; not shown after that day                      |

Only `https` links and images are accepted. Write `expires` as `YYYY-MM-DD`.

Android can delay background work when the phone is in battery saver, so the
15 minutes is "usually", not a promise. Users can turn off the battery limit in
the app's Settings tab. (Instant delivery needs Firebase push, which is not set up.)

## Example

```json
{
  "enabled": true,
  "id": "tg-1",
  "title": "Join our Telegram group",
  "body": "Updates, tips and help for SinSubz.\nTap Join Telegram!",
  "image": "/telegram-banner.png",
  "url": "https://t.me/your_group",
  "openLabel": "Join Telegram",
  "laterLabel": "Not now",
  "platforms": ["android", "windows"],
  "expires": "2026-12-31"
}
```

Note: this only works in app versions that contain this feature, so release a new
version first (`node scripts/bump-version.js`, then your normal release steps).
