# Geostrøm AS – Firmahytta

Public site: `/hytte/`. Administrator login: `/hytte/admin`.

The cabin router runs in the existing Express service, before the ToDo authentication middleware. It uses its own data file (`data/hytte.json`) and administrator session. Back up this file along with the existing data directory. Writes replace the file atomically. This deployment assumes one Node process.

Set `HYTTE_ADMIN_PASSWORD` in the service environment to override the initial password `Hytte2026!`. Administrator sessions expire after eight hours and on service restart. Login attempts are rate limited.

The internal booking form requires only a full name and dates (1–30 nights). There is no guest count or acknowledgement checkbox. Departure is at 12:00 and arrival at 15:00; a departure and new arrival may share a date.

Guests receive a unique random six-digit numeric visit code. The code is stored in the server data file so authenticated administrators can view it, alongside its SHA-256 hash for lookup. Admin can view or replace codes. Existing bookings receive a six-digit code automatically, while their previously issued codes remain valid until admin replaces the code. Neither codes nor hashes appear in public calendar or guest visit responses. Failed code attempts are rate limited. Names, dates and booking status are public; checklist answers and notes require the visit code or admin login. Full names are format-validated, not identity-verified.

Brand: Geostrøm AS, primary color `#549534`.

Every checklist question requires Yes, No or Not applicable. No requires a note. Arrival can be recorded during the booking dates; departure requires a recorded arrival. Submitted checklists store the original question text. Editing questions does not change previous visits. Removing a booking hides it from the calendar and frees the dates, while retaining the admin history.

The Norwegian default checklist should be adapted to the actual cabin's appliances and routines in Admin. The website does not send email or SMS.

Run integration checks: `node --test tests/hytte.test.js`.

Caddy must route `/hytte` and `/hytte/*` on ehalvorsen.no to the existing WorkTracker service at `127.0.0.1:3002`, preserving the path.
