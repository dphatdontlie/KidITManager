# PWA and teaching reminders

Design read: continue the existing KidIT green palette, type, buttons and light/dark themes. ENERGY 1 / RHYTHM 1 / MOTION 1. A single settings column separates device permission from account reminder timing. The notification Bell represents the actual destination; native form controls provide keyboard and touch affordances. No new animation or decoration. The temporary SVG KI text mark is an explicit placeholder; iOS reuses the existing logo.

Delivery verification is scoped to the new notification page, PWA metadata, worker and server reminder flow. Existing unrelated screens are outside this change.

## Follow-up: alternate deployment and iPhone input zoom

The repository is connected to both `kid-it-manager` and `kid-it-manager-8k8k`. The second project's production environment lacked the four Push variables, reproducing `configured:false`; the primary project returned `configured:true`. The missing values were provisioned as production secrets on the second project. Both projects share the existing database and VAPID configuration, so the existing single reminder job can process registered devices from either site.

Mobile/coarse-pointer form controls now use a minimum 16px font to address iOS focus zoom. The existing large numeric Quiz join field is excluded. The viewport still permits user zoom. A configuration retry button lets an open notification screen re-check server readiness.

- Hard gate PASS: build/lint and fixture click-through passed; retry changed the disabled/unconfigured screen into an enabled button, then registration succeeded. Login text/password, month, selects, text and textarea measured 16px at phone widths; no horizontal overflow at 320/390px. Actual iPhone keyboard/zoom behavior still needs device confirmation.
- Purpose gate PASS: the only style adjustment makes form text readable at the iOS focus threshold; no new colors, icons, media, or motion.
- Liveliness PASS: inherited KidIT forms and 1/1/1 dials retained; the numeric Quiz field remained 28px while the name field measured 16px.
- Craftsmanship PASS: standard viewport zoom retained; fixture form was closed without saving data; screenshot saved to `outputs/mobile-input-fix.png`; temporary viewport override reset.

## Automated checks

### Admin schedule notifications and session attendance

Design read: keep KidIT's existing forms, green accent and light/dark themes (ENERGY 1 / RHYTHM 1 / MOTION 1). Slot rows identify which lesson to open; a distinct session header shows whether edits are allowed. The initial roster has explicit pending states. Date entry reuses the existing day/month/year component to avoid locale-dependent date ordering. The existing 3D view remains available, with read-only state independent of loading.

- Hard gate PASS: subscription/digest tests cover admin accounts without teacher records, 09:00 Vietnam timing, empty days and daily deduplication. Session tests cover unique opening, separate same-day slots, snapshot rosters, role checks, start/end boundaries, stale writes, closure/reopening and rollback on audit failure. UI exercised open, present, absent, clear, cancel close, confirm close, read-only teacher review, admin reopen, no-class day, invalid date, Hôm nay, reload and 3D mode. Phone fields retain 16px type; no document overflow observed at 320/390/768px.
- Purpose gate PASS: inherited colors/type; slot and session panels distinguish scheduled lessons from saved attendance. Native controls and existing 3D assets only; no decorative additions.
- Liveliness PASS: 1/1/1 inherited; clear session state and action lead the view; whitespace separates the slot list, session state, counts and roster.
- Craftsmanship PASS: existing daily attendance remains separate for reference, payroll is untouched, changes use transactional audit and version checks. Closed entries cannot be changed until an admin reopens. Browser checks use fixture data and a fixed lesson clock, not real student records. Screenshots: `outputs/attendance-session.png`, `outputs/admin-notifications.png`. Actual 09:00 push delivery and iPhone notification receipt require the normal scheduled run on an opted-in device.

- Subscription API: authentication, owner/session isolation, invalid endpoints and keys, rate limit, logout cleanup, expired endpoints and transient failures.
- Reminder runner: Vietnam dates, midnight crossing, reminder window, lead time, historic/per-slot staff, ambiguous names, overlapping calls, expired sessions, retries and dead endpoints.
- Worker: malformed payload still displays a notification; navigation restricted to the same origin; no fetch cache of private data.

Latest verification: `npm test` passed all 109 tests, including the admin morning digest and student attendance session tests. `npm run build`, `npm run lint` and `git diff --check` passed. Build retains the existing classroom-scene chunk-size advisory.

## Browser verification

Local fixture server and simulated Push transport only; no production data or actual push messages were used. Checked enable, send test, disable, enable again, save 5/15/30 minutes, retry an injected API error, denied permission instructions, iPhone user-agent installation instructions, and logout/relogin requiring a fresh opt-in. New controls were exercised through the UI. Temporary browser viewport and user-agent overrides were reset.

No horizontal overflow at widths 320, 390, 768 and 1280. Checked both themes and visible keyboard focus. Measured the page's foreground/background color pairs: light 12.06:1, 7.04:1 and 6.02:1; dark 12.54:1, 7.77:1 and 8.28:1. Disabled controls are excluded from WCAG text contrast requirements. Screenshot: `outputs/push-notifications.png` (fixture data, not a live deployment).

## Delivery gate

### Hard gate

- R-02 PASS: new page copy contains no em dashes.
- R-03 PASS: 320/390/768/1280 viewport checks showed scroll width no larger than viewport; actions wrap and use minimum 44px targets.
- R-17 PASS: 5/15/30-minute choices, three-minute health and iOS 16.4 requirement match implementation or Apple documentation; no marketing statistics.
- R-18 PASS: no testimonials or generated portraits added.
- R-23 PASS: existing iOS logo reused; SVG KI text icon explicitly marked temporary in its source and README.
- R-24 PASS: new menu link points to the implemented `/notifications` route.
- R-25 PASS: enabled text color pairs measured at 6.02:1 or better in light and 7.77:1 or better in dark.
- R-26 PASS: enable, disable, send test, retry and preference save all exercised through the page against fixture API endpoints.
- R-27 PASS: loading text, not-enabled state, API error/retry, denied permission, missing setup and missing teacher linkage have explicit content.
- R-28 PASS: no FAQ added.
- R-32 PASS: native buttons/select, visible select label and visible keyboard focus verified.
- R-33 PASS: product changes written directly in source with patches; temporary simulated browser plumbing exists only under ignored `outputs/`.
- R-34 PASS: light and dark screenshots inspected, including page panels and native controls.
- R-35 PASS: production build passed; new page actions exercised; subscription and scheduling paths have passing integration tests. Actual iPhone delivery remains a deployment check, explicitly disclosed.
- R-36 PASS: UI says a test was submitted to Push, not that delivery was proven; no unmeasured performance or security claims.
- R-37 PASS: existing KidIT interface supplied the direction; design read and 1/1/1 dials recorded above.
- R-38 PASS: page content describes implemented preferences and device/permission state, with no invented social proof.
- R-39 PASS: native labeled controls, inherited button hover/disabled styles, explicit focus outline, no new motion, existing Vietnamese document language/title and main landmark retained.
- R-40 PASS: no content media added; SVG icon dimensions explicit; no load or performance score claimed.

### Purpose gate

- R-01 PASS: no gradients or glows introduced.
- R-04 PASS: the menu Bell represents notification settings and uses the application's existing icon system.
- R-06 PASS: inherited KidIT type; no new typeface or decorative uppercase labels.
- R-07 PASS: no decorative background grids.
- R-08 PASS: no decorative CTA arrows; iPhone instructions use arrows to show actual navigation steps.
- R-09 PASS: no decorative capsule badges.
- R-10 PASS: no glass effects.
- R-12 PASS: no new shadows; bordered panels separate device settings from account settings.
- R-13 PASS: no glows.
- R-14 PASS: two functional sections have different contents and controls; no feature-card grid.
- R-19 PASS: no new animation; action progress uses live status text.
- R-22 PASS: no generic illustrations.

### Liveliness

- Dials PASS: ENERGY 1 / RHYTHM 1 / MOTION 1 matches a calm operational settings page.
- Consistency PASS: single-column form follows existing KidIT spacing and theme variables.
- Focal point PASS: page heading and device enable/test control lead the view.
- Whitespace PASS: separate panels distinguish device permission from account reminder timing.
- Accent PASS: existing green accent identifies the primary action.
- Identity PASS: existing KidIT palette, KI mark and sidebar retained.
- Design read PASS: continuation of the current product interface recorded above.

### Craftsmanship and quality locks

- C-1 PASS: inherited palette/type and panel/form choices have functional reasons recorded in the design read.
- C-2 PASS: all new enabled controls have implemented and exercised actions.
- C-3 PASS: both sections serve permission, test delivery or reminder preferences.
- C-4 PASS: new page verified at mobile/tablet/desktop widths, in both themes, with native keyboard controls.
- C-5 PASS: no fabricated testimonials, statistics or proof of real APNs delivery.
- R-05 PASS: settings layout follows device versus account responsibilities; no marketing template sections.
- R-11 PASS: panel and control radii inherit existing 10px/6px styles; no all-pill layout.
- R-15 PASS: buttons name concrete notification actions.
- R-16 PASS: no marketing buzzwords added.
- R-20 PASS: existing KidIT identity remains intact.
- R-21 PASS: existing light/dark toggle works with both new panels.
- R-29 PASS: existing neutral/green palette reused.
- R-30 PASS: no external product design copied.
- R-31 PASS: design-read paragraph documents color, layout, type, spacing and icon rationale.

## Deployment validation still required

- Run `npm run db:migrate:push` on the target MySQL database.
- Set the VAPID pair/contact and cron secret on hosting; configure a minute scheduler.
- Install the HTTPS site on an actual iPhone, grant permission from the button, send a test, close the app and check a scheduled reminder.
- Real APNs delivery, iOS notification permission and Focus behavior cannot be verified by the local simulated transport.
