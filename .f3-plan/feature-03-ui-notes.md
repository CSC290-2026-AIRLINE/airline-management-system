# Feature 3 – UI notes (from Figma)

Read on 6 Nov 2026 from the Figma file, frame **"Feature 3 – Search, Booking & Seat Inventory"**:
https://www.figma.com/design/HwEXqgzHjx3SwVAW5EOKIO/CS26-UIUX-Integrated-Project?node-id=4670-27155

Use this file together with `feature-03-work-split.md`. Task numbers (A6, B9, C11, …) are stable IDs; owners are in the Revision 2 table and §0 of that file (B7 lookup/B13 → A, B5 BookingProvider → C12, C7 cancellation policy → B14).

**What is exact and what is estimated**
- **Exact:** frame names, the text on each screen, the layout, and which elements appear.
- **Exact hex values:** colors and fonts are taken from the repo's existing stylesheets, which other teams built from the same Figma kit. Figma's inspect panel needs a signed-in account, so its values could not be read directly.
- **Estimated:** sizes, radii and spacing.
- **Not to build:** footers that say "Prototype with sample data…" and links that start with "Preview: …" exist only in the prototype.

Contents
1. Design system
2. Customer-web layout
3. Customer screens
4. Mobile screens
5. Staff-web layout
6. Staff screens
7. Where the design and the plan differ (decide before building)
8. Reusing existing code
9. How to use these notes with an AI coding tool

---

## 1. Design system

### Fonts
- **Inter** for all UI text. Page titles such as "Find a flight" and "Bookings" are bold Inter.
- **Merriweather** for the "Flython" wordmark next to the logo mark (staff-web token `--font-heading`).
- Monospace (`ui-monospace`) only where codes need it, if at all.

### Colors
These hex values come from the repo: staff-web `src/index.css` on `dev`, Feature 6 `features/checkin-boarding/styles/tokens.css`, Feature 7 `profile.css` and Feature 12 `globals.css`.

| Role in the Feature 3 frames | Hex | Repo token |
| --- | --- | --- |
| Brand navy: logo mark, staff sidebar, Profile pill | `#14213d` | staff `--color-navy`, F6 `--f6-navy` |
| Primary button fill, selected fare border, active step | `#102544` | staff `--color-primary`, F12 `--primary` |
| Primary button hover | `#1c3e6a` | F7 |
| Staff sidebar active item | `#2a4372` | staff `--color-navy-active` |
| Heading and body text | `#0a1424` | staff `--color-ink` |
| Muted text (labels, hints, "FL203 · 6 h 15 m · direct") | `#677287` | F6 `--f6-muted`, F12 `--muted-foreground` |
| Page background | `#f7f9fc` | staff `--color-page` |
| Cards | `#ffffff` with a 1px border `#d9dfe9` (or `#e6e8ef` for table lines) | staff `--color-border`, `--color-line` |
| Amber accent: logo swoosh, extra-legroom seats, low-seat text | `#fca311` (F6) / `#f2a800` (staff gold) | `--f6-amber`, `--color-gold` |
| Success chip ("Confirmed", "Accepted", "Ordering open") | text `#1f8a4c` on `#e4f5e9` | staff `--color-success-strong`, `--color-success-soft` |
| Warning chip and banner ("Held", "Pending", hold banner) | text `#94651c` on `#fef4de` | staff `--color-warning`, `--color-warning-soft` |
| Danger ("Cancelled", "Hold expired", red buttons, 409 chips) | `#b8171f`; soft background `#fdecec` | staff `--color-danger`, `--color-danger-soft` |
| Info banner (light blue) | text `#1d4ed8` on `#dbeafe` (or `#eaf2ff`) | F7 |
| Selected tab or fare cell fill | `#eaf2ff` with border `#102544` | F7 |
| Neutral chip ("Expired", "Completed", "Open") | text `#475569` on `#eef2f7` | F7 |

### Shape and spacing (estimated)
- 4 px spacing grid (staff `--spacing: 4px`).
- Cards have a radius of about 10 px. Buttons and inputs about 6–8 px. Chips are pill-shaped.
- Desktop frames are 1440 px wide. The customer content column is about 1000 px wide and centered.
- Mobile frames are 393 px wide.

### Shared components seen across screens
- **Buttons:**
  - Primary: navy fill, white text ("Search flights", "Continue to passengers", "Pay now").
  - Secondary: white, 1px border ("Back to flights", "Keep booking").
  - Destructive: red fill ("Yes, cancel", "Cancel booking" inside a dialog, "Reject request").
  - Destructive outline: red text and border ("Cancel booking" on Booking detail, "Reject" in the queue).
- **Segmented tabs:**
  - Customer: "One-way / Return / Multi-city" and "Upcoming / Past". The selected tab has a light-blue fill and a navy border.
  - Mobile: the selected tab is solid navy.
- **Stepper:** ✓ Flights — 2 Passengers — 3 Seats — 4 Review & pay. Done steps show a navy circle with a check, the current step a navy circle with its number, and later steps a grey circle.
- **Status chips:**
  - Confirmed: green
  - Held (also "Held · expires in 03:12"): amber
  - Cancelled and "Cancelled · refunded": red
  - Expired and Completed: grey
  - Pending: amber
  - Accepted: green
  - Rejected: red
- **Info banners:** full width, light blue, small text. Hold and warning banners are amber.
- **Dialogs:** a centered white card over a dimmed page, with a title, one line of context, an optional amount table, and the buttons right-aligned (secondary first, then primary or destructive).
- **Error dialogs from the API** show the error code as a small red chip, for example `409 SEAT_UNAVAILABLE`.

---

## 2. Customer-web layout

- **Top bar**, inside the page in a light card:
  - Left: Flython logo (navy and amber swoosh mark plus the Merriweather wordmark).
  - Right: links **Book**, **My Trips**, **Membership**, **Help**, and a navy **Profile** pill with the initials avatar ("SW"). The active link is underlined.
- **Page:**
  - Page title (bold, about 28 px) with a one-line muted subtitle.
  - Content in white cards on the `#f7f9fc` background.
- **Booking-flow pages** (Passengers, Seats, Review & pay) use two columns: the main column, plus a right summary card about 220 px wide.
- **Check with the Dev Leads** whether a shared customer header exists or is planned before building one; Features 6, 7 and 12 show the same header.

---

## 3. Customer screens

Frame names are copied exactly, so you can find each one in Figma.

### A6 – Flight search (start)
Frames:
- `F3 / Customer / Desktop / 01 Flight search — Return (start)`
- `01a … — One-way (start)`
- `01b … — Multi-city (start)`

Content:
- Title "Find a flight". Subtitle: "Direct flights only. Seats and prices are checked live; nothing is reserved until you continue."
- **Search card:**
  - Trip-type tabs.
  - Fields **From**, **To**, **Depart**, plus **Return** for a return trip. Examples: "Bangkok (BKK)", "Tokyo Narita (NRT)", "12 Nov 2026".
  - Counters **Adults**, **Children (2–11)**, **Infants (under 2)**.
  - Hint: "Up to 9 adults and children together. Infants sit on a lap, so you can't have more infants than adults."
  - Primary button **Search flights**, on the right.
- **Multi-city** adds a row "Leg 2 · From / To / Depart" and a secondary button "+ Add another leg (up to 5)".
- **Empty state card:** "Find your flight". Hint: "Choose where you are flying and when, then press Search flights to see the available flights."

### A6 – Flight results
Frames:
- `01c Flight results — Return`
- `01d … — One-way`
- `01e … — Multi-city`
- `… Flight results — Return, flights selected`
- `… One-way, flights selected`
- `… Multi-city, flights selected`

Content:
- The search card stays on top.
- Above the results:
  - left: a small pill "Prices guaranteed until 15:45 · simulated time" (see difference **D1**)
  - right: "SORT" with toggles **Price** (selected) and **Departure**
- **One card per leg:**
  - Header "LEG 1 · OUTBOUND" (or "LEG 2 · RETURN", "LEG 2") and the route line "Bangkok → Tokyo Narita · Thu 12 Nov".
  - Right of the header: "Price shown is the total for 1 adult + 1 child" (see **D2**).
  - Table columns: **Flight | Economy | Premium economy | Business**.
- **Flight cell:**
  - "22:30 → 06:45", with a small "+1 day" when the flight lands the next day
  - below it, muted: "FL205 · 6 h 15 m · direct"
- **Fare cell:** a bordered button showing "USD 398.00", and below it the seats left.
  - Seats left: "9+ seats left" in muted text; a low count such as "4 seats left" in amber.
  - Unavailable cell: "Not available" plus the reason, for example "Fewer than 2 seats left", in muted text and not clickable.
  - Selected cell: light-blue fill and navy border.
- **Bottom bar** (a card):
  - Left: "YOUR TRIP" with "Choose a flight", "Choose an outbound and…", or the selection, for example "FL203 + FL204 · 1 adult, 1 child".
  - Right: "TOTAL USD 892.00" and the primary button **Continue to passengers**.
  - With nothing selected, it shows TOTAL USD 0.00.

### A6 – No results
Frame: `… Flight search — No results`

- A compact search card: From, To, Depart, Passengers ("6 adults") and **Search flights**.
- Card title: "No direct flights with 6 seats on 14 Nov". Text: "Flights that match the route and date are sold out in this cabin or have fewer seats left than your party needs. Try another day or fewer passengers."
- Section "NEARBY DATES WITH 6 OR MORE SEATS" with three date cards, for example "Thu 12 Nov · from USD 446.00" (see **D5**).
- Info banner: "Search returns only flights that are on sale and not yet departed. Cancelled and departed flights are hidden."

### A8 – Passengers & extras (C10 builds the assistance block inside it)
Frames:
- `03 Passengers & extras`
- `03a Passengers & extras — after going back` (the same page with its values kept)

Content:
- Stepper at step 2.
- **One card per passenger:**
  - Header "PASSENGER 1 · ADULT" or "PASSENGER 2 · CHILD (AGE 9)", then the full name.
  - Top right: a select "Fill from saved traveller" (Feature 7 autocomplete).
  - Fields: Given name (as on passport), Family name, Date of birth, Passport number (see **D9**).
- **Special assistance (optional) block (C10 `<AssistanceFields>`):**
  - Checkboxes:
    - "WCHR - ramp, can climb stairs"
    - "WCHS - steps need help"
    - "WCHC - carried to seat"
    - "UMNR - unaccompanied minor (5–11)"
    - "MEDA - medical assistance"
  - Text field "Note for the airport team (required for UMNR and MEDA)".
  - Hint: "Wheelchair requests need at least 24 hours before departure. UMNR and MEDA need at least 48 hours. Staff review each request; you will be told the outcome."
- **Contact for this booking:** Email, Phone.
- **Promo code:**
  - Field "Code (optional)" and a secondary **Apply** button.
  - Info banner: "Pricing (feature 4) checks the code when you continue and shows the new total on the next step. The code is used up only when payment succeeds."
- Buttons: **Back to flights** (secondary, left) and **Continue to seats** (primary, right).
- **Right summary card "YOUR TRIP":**
  - Each flight, for example "FL203 · Thu 12 Nov" with "BKK 11:40 → NRT 19:55 · Economy".
  - "1 adult, 1 child — USD 1,740.00".
  - Info: "Seats are held for 15 minutes after you finish this step."

### C9 – Seat selection
Frames:
- `04 Seat selection`
- `04a Seat selection — Return leg`
- `04b Seat selection — seats cleared`

Content:
- Title "Choose your seats". Stepper at step 3.
- **Left card:**
  - Segment tabs "FL203 · BKK → NRT" and "FL204 · NRT → BKK".
  - Legend: **Free** (white seat, blue-grey border), **Extra legroom · USD 12.00** (amber seat with an icon), **Yours** (solid navy), **Taken** (grey with an ×).
  - Seat grid with columns **A B C | aisle | D E F** and row numbers on the left. In the example, rows 10–11 are extra legroom.
  - The seat chosen for the active passenger shows their initial in a navy square.
- **Right card "PASSENGERS ON FL203":**
  - One button per passenger: "Anya Saranpat (adult) — 14C", "Mali Saranpat (child) — No seat yet". The active passenger has a navy border.
  - "Seat fees USD 0.00".
  - Info: "Pick a passenger, then a seat. You can skip any flight and choose later in My Trips or at check-in. Seats you pick are held with your booking."
  - Buttons: **Continue to review** (primary), **Skip, choose seats later** (secondary), **Back** (secondary).
- **"Seats cleared"** state: every passenger shows "No seat yet".

### A – Seat taken (dialog)
Frame: `P2 Seat no longer available`

- Red chip `409 SEAT_UNAVAILABLE`.
- Title "That seat was just taken".
- Text: "Another traveller completed their booking for 14D on FL203 a moment ago. Your other choices are still held."
- Primary button **Pick another seat**.
- It appears over Seat selection when the hold answers 409 (see **D3**).

### B9 – Review & pay
Frames:
- `05 Review & pay (hold)`
- `05b Review & pay — seats not chosen`

Content:
- Title "Review & pay". Stepper at step 4.
- **Amber hold banner**, full width:
  - "Seats held for 14:32 · booking Q4RT9B. If time runs out, the seats go back on sale."
  - On the right, a small pill: "hold ends 15:45 · simulated time".
- **Card "Flights":**
  - One row per flight, for example "FL203 · Thu 12 Nov · Economy / BKK 11:40 → NRT 19:55 · direct".
  - Right side: "Seats 14C (Anya), 14D (Mali)", or "Seats: choose later · **Choose now**" (link).
- **Card "Passengers":**
  - One row per person: "Anya Saranpat · adult — no extras".
  - A request shows an amber chip, for example "WCHC requested · staff will review".
- **Right card "PRICE":**
  - "Adult fare × 2 flights USD 870.00".
  - "Child fare × 2 flights USD 870.00 (same quote as adult)".
  - "Seat fees USD 0.00".
  - **Total USD 1,740.00** in bold.
  - Note: "Fares are quoted by pricing (feature 4) and fixed for this hold. Payment is taken by checkout (feature 5a)."
  - Buttons: **Pay now** (primary), **Back to seats** (secondary), **Cancel** (secondary).
  - Note: "You can go back to change seats or passengers. Your hold keeps running."
  - "Want a meal on board? You can add meals from your booking once it is paid." with a small "Feature 12" chip.

### B9 – Cancel an unpaid booking (dialog)
Frames:
- `05a Review & pay (hold) — Cancel dialog (overlay)`
- `P1 Cancel unpaid booking`

Content:
- "Cancel this booking?"
- Text: "Booking Q4RT9B has not been paid. Cancelling releases your 4 held seats and the booking is closed. Nothing is charged."
- Buttons **Keep booking** (secondary) and **Yes, cancel** (red).
- See **D4**.

### B9 – Price changed (dialog)
Frame: `P4 Price changed (409 PRICE_CHANGED)`

- Title "The price has changed". Text: "Fares were updated since you searched. Nothing is held yet."
- Table: "Price you saw USD 1,740.00 / **New total USD 1,812.40**".
- Buttons:
  - **Back to search** (secondary).
  - **Continue at USD 1,812.40** (primary), which sends the hold again with the new `expected_total`.

### B9 – Hold expired (its own page)
Frame: `06 Hold expired`

- A card with a red chip "Hold expired" and the title "Your seats were released".
- Text: "Booking Q4RT9B was not paid within 15 minutes, so the 4 held seats are back on sale and the booking is marked expired. Nothing was charged."
- Buttons **Search again** (primary) and **Go to My Trips** (secondary).
- Info banner: "Prices and seat counts may have changed. If the seats are gone, search will show what is left."

### B10 – Payment confirmation (no frame)
Figma has no confirmation page, because payment belongs to Feature 5a. Until 5a's page exists, B's dev-only confirm result shows:
- a white card with a green "Confirmed" chip and the booking reference
- the primary button **View trip**
- an **Add meals** button that opens Feature 12, styled like the meals card on Booking detail

Copy the layout of `06 Hold expired`, with green in place of red.

### B11 – My Trips
Frames:
- `07 My bookings`
- `07a My bookings — Past`

Content:
- Title "My Trips". Subtitle "Your bookings, newest departure first." (see **D10**).
- Primary button **Book a flight**, top right.
- Tabs **Upcoming / Past**, then the section title "Upcoming bookings" with a count chip.
- **One card per booking:**
  - Route "Bangkok ⇄ Tokyo Narita" (⇄ for a return trip, → for one-way) and a status chip.
  - Dates: "12 – 19 Nov 2026".
  - Muted line: "Q4RT9B · 1 adult, 1 child · 2 flights".
  - Right side: **View trip** (primary, small) and a link below it:
    - Confirmed, upcoming: **Add meals**
    - Held (chip "Held · expires in 03:12"): **Complete payment**
    - Past and completed (chip "Completed"): **Report a problem**
    - Cancelled (chip "Cancelled · refunded"): **View receipt**
- Info banner: "Held bookings show a countdown. When it reaches zero the seats are released and the booking expires."

### B12 – Booking detail
Frame: `08 Booking detail`

- Back link "← My Trips". Title "Booking Q4RT9B" with a green "Confirmed" chip.
- Muted line: "Booked 27 Oct 2026 · 1 adult, 1 child · USD 1,740.00".
- Buttons, top right: **Change booking** (stretch), **Report a problem**, **Cancel booking** (red outline).
- Info banner after an aircraft change: "Your seat on FL203 moved from 14C to 15C after an aircraft change. Everyone in your party stayed together." This shows when `booking.seat_changed` happened.
- **Card "Flights":** a table with columns **Flight | Seats | Ticket | Coupon**.
  - Flight: "FL203 · BKK → NRT / Thu 12 Nov · 11:40 → 19:55".
  - Seats: "Anya 15C / Mali 15D".
  - Ticket: "217-4400123456" (see **D11**).
  - Coupon: a chip "Open".
- **"Check-in and boarding pass" section:**
  - "Digital Boarding Pass — Available once check-in is complete. Scan the QR code at the gate."
  - Buttons **Download boarding pass** and **Add to wallet**.
  - This is Feature 6's content: link to it, don't build it.
- **"Passengers":** a list with initial avatars, each name with the role ("Account holder", "Adult", "Child").
- **"Meals & Onboard Shop" (Feature 12):**
  - "Add meals, snacks and duty-free to this booking." with the primary button **Browse onboard shop**.
  - Three secondary buttons: Pre-order meals, Snacks and drinks, Duty-free.
  - Green banner: "Ordering open · Closes Sat 10 Oct, 09:40, 48 hours before departure."
- **"Payment":**
  - Fares USD 1,740.00; Paid with Card ending 4242; **Total**.
  - Note: "Cancelling shows the fee and refund before you confirm. Refunds go back to the original card through checkout."
- **Two cards at the bottom:**
  - "Lost or delayed baggage? [F10] Report a lost bag or follow a bag case for this booking. Report a lost bag →"
  - "Something went wrong? [F13] Tell us about the flight, the food or a staff member. Report a problem →"
- Not in the frame, but in the plan:
  - a "Choose seat" link when a seat is missing (C9)
  - the special-assistance status with "Request assistance" (C10)
  - add both in the same card style (see **D8**)

### B12 – Cancel a confirmed booking (dialog)
Frame: `08a Booking detail — Cancel booking dialog (overlay)`

- Title "Cancel booking Q4RT9B?" Text: "Both flights and all 4 seats will be released. This cannot be undone."
- Table: "Total paid USD 1,740.00 / Cancellation fee − USD 70.00 (red) / **Refund to card USD 1,670.00**".
- Note: "Fee comes from the fare rules in pricing (feature 4). The refund is processed by checkout (feature 5a) and shown in your booking." (In the plan, refunds are Feature 5b.)
- Buttons **Keep booking** (secondary) and **Cancel booking** (red).

---

## 4. Mobile screens (393 px)

### A7 – Mobile flight search
Frame: `F3 / Customer / Mobile / 01 Flight search`

- **Header:** logo, an initials avatar, and a navy square menu button (hamburger).
- **Card "Find a flight":**
  - Small pill tabs Return / One-way / Multi-city.
  - From and To stacked; Depart and Return side by side.
  - One field "Passengers: 1 adult, 1 child".
  - Full-width **Search flights** button.
- **Results:** a heading "OUTBOUND · THU 12 NOV", then one card per flight.
  - Each card: "22:30 → 06:45" with "USD 398.00" on the right, "FL205 · direct · Economy", and "9+ seats left" (amber when low).
- **Sticky bottom card:** "TOTAL USD 1,740.00" and the primary button **Continue**.

### B11 – Mobile My Trips
Frame: `F3 / Customer / Mobile / 02 My bookings`

- Title "My Trips". Segmented control **Upcoming** (solid navy when selected) and **Past**.
- **Cards:**
  - Reference "Q4RT9B" with a chip on the right ("Confirmed" green, "Held" amber).
  - Route, for example "Bangkok ⇄ Tokyo Narita".
  - "1 adult, 1 child · 12 – 19 Nov".
  - A last line "Tickets issued" or "Expires in 09:12".
- Full-width **Book a flight** button.

---

## 5. Staff-web layout

- **Left sidebar** in navy `#14213d`:
  - Top: logo with "ADMIN WORKSPACE".
  - Groups: Reports & Analytics, + Operations, + Commercial, + Airport & Onboard, − **Customer Management** (open), Administration.
  - Under Customer Management: Customer Search, **Bookings**, **Book for Customer**, **Assistance Queue**, Service & Compensation, Loyalty Programme. The active item has the darker background `#2a4372`.
  - Bottom cards:
    - "SIMULATION CLOCK — 27 Oct 2026", with an amber dot
    - "SIGNED IN AS — Administrator", with a green dot
  - Bottom note: "Navigation follows assigned staff permissions." Then **Sign out**.
- **Main area:** white. Top right: "Alex Carter · Admin". Two small chips above the title, "FEATURE 3" (blue pill) and "STAFF VIEW" (beige outline); these are prototype labels; do not build them (D15).
- **Page title** in bold with a muted subtitle.
- The same shell already exists in staff-web (see section 8).

---

## 6. Staff screens

### B13 – Bookings (staff lookup)
Frames:
- `F3 / Staff / Desktop / 01 Bookings`
- `01a Bookings — Page 2`
- `01b … — Date type menu`
- `01c … — Period menu`
- `01d … — Custom range`
- `01e … — Status menu`
- `01f … — Travelling on`
- `01g … — Today`
- `01h … — This month`
- `01i … — This year`
- `01j … — Last year`
- `01k … — Status Held`
- `01l … — Status Confirmed`
- `01m … — Status Cancelled`
- `01n … — Status Expired`
- `01q … — After cancel`

Content:
- Title "Bookings". Subtitle "All bookings, newest first. Filter by date or status, or search by reference, name, ticket number or passport."
- **Filter bar:**
  - Search box: "Reference, passenger name, ticket number or passport".
  - **Date type** select: Booked on / Travelling on.
  - **Period** select: Today, This week, This month, This year, Last year, Custom range (with a date range).
  - **Status** select: All / Held / Confirmed / Cancelled / Expired.
- Results line, for example "9 bookings — Booked 26 Oct 2026 to 1 Nov 2026 · newest first".
- **Table:**

  | Column | Content |
  | --- | --- |
  | Booking | Reference |
  | Lead passenger | Name |
  | Trip | "BKK → NRT", with "Travelling 12 Nov 2026" below |
  | Booked | Date |
  | Status | Chip |
  | Assistance | Chip such as "1 pending", "WCHR pending" (amber) or "WCHS accepted" (green) |
  | Total | Amount, right-aligned |

- Footer: "Showing 1 to 6 of 9" with **Previous / Next**.
- Info banner: "Click a booking to open its details. Search looks at every date; the filters only narrow the list when the search box is empty."
- See **D7**.

### B13 – Booking details (staff dialog)
Frames:
- `01o Bookings — Booking detail… (overlay)`
- `01r Bookings — Booking details, cancelled (overlay)`

Content:
- Header "BOOKING K7M4QX" with a status chip. Below it, "Booked by agent (Nok)" or the customer.
- Two columns:
  - **Flights**, for example "FL203 · Thu 12 Nov / BKK 11:40 → NRT 19:55 · Economy".
  - **Passengers**, for example "Somchai Wongchai (adult) · 22A".
- **Ticket numbers**, plus **Total USD 892.00** with "Booked 26 Oct 2026".
- Amber banner for open assistance: "Somchai has a WCHC request awaiting review. Departure is more than 24 hours away."
- **History** list:
  - "26 Oct 2026 · Booking held (Nok)"
  - "26 Oct 2026 · Payment confirmed, tickets issued"
  - "27 Oct 2026 · Booking cancelled"
- Button **Open assistance queue**, and a close ×.

### B13 – Staff cancel (dialog)
Frame: `01p Bookings — Cancel booking dialog (overlay)`

- Title "Cancel booking K7M4QX?" Context line: "Somchai Wongchai and 1 other · FL203 · 12 Nov".
- Table: "Total paid USD 892.00 / Cancellation fee − USD 70.00 / **Refund USD 822.00**".
- Select "Reason (kept in the booking history)", for example "Customer request by phone".
- Buttons **Keep booking** and **Cancel booking** (red).
- See **D8**.

### A9 – Book for Customer
Frames:
- `02 Book for customer`
- `02a Book for Customer — Guest`

Content:
- Title "Book for Customer". Subtitle "Create a booking on behalf of a customer."
- **Card "1 · Customer":**
  - Tabs **Existing customer** / **Guest (no account)**.
  - Existing: a search box with a **Find customer** button, then an info banner "Somchai Wongchai · somchai.w@example.com · member since 2023. The booking will appear in their My Trips."
  - Guest (see **D6**):
    - Fields: Contact name, Contact email (required), Contact phone (optional).
    - Info: "No account is created. The e-ticket and payment link go to this email. The customer manages the booking with the reference and last name, and can register later to attach it to My Trips. A guest booking earns no miles."
- **Card "2 · Flight":**
  - From, To, Depart, and a **Cabin** select.
  - The chosen flight shows as a selected row: "FL203 · 11:40 → 19:55 / 12 seats left · direct — USD 446.00 per adult".
- **Card "3 · Passengers & seats":**
  - Button **Add passenger**.
  - One row per passenger: name, **Type** select (Adult …), **Seat** (for example "22A"), **Assistance** select (None …), **Remove**.
  - Hint: "Up to 9 passengers. An infant travels on an adult's lap with no seat, and there can be no more infants than adults. Leave the seat empty to choose it later."
- **Right card "SUMMARY":**
  - "2 adults · FL203 USD 892.00", **Total USD 892.00**.
  - Amber note: "The seats are held for 15 minutes. Send the customer to checkout, or take payment for them."
  - Primary button **Hold seats & go to checkout**, or, disabled for a guest with no email, "Enter a contact email to continue".
  - Button **Cancel**.
  - Note: "Uses the same hold, price and seat rules as customer web."

### C11 – Special Assistance Queue
Frames:
- `03 Special assistance queue`
- `03a Queue — Accepted tab`
- `03b Queue — All`
- `03c Queue — Rejected`
- `03e Queue — All (marked done)`

Content:
- Title "Special Assistance Queue". Subtitle "Review requests from bookings. Oldest departure first." (see **D10**).
- Tabs with counts: **Pending (3)**, **Accepted (1)**, **Rejected (1)**, **All (5)**. The active tab is underlined.
- **Table:**

  | Column | Content |
  | --- | --- |
  | Booking | Reference as a blue link |
  | Passenger | Name, with "Adult" or "Child, age 9" below |
  | Code | `WCHC`, `MEDA`, `UMNR`, … |
  | Flight · note | "FL203 · 12 Nov", with the passenger's note below |
  | Status | Chip |
  | Action | Buttons that depend on the status |

- Actions:
  - Pending: **Accept** (primary) and **Reject** (red outline)
  - Accepted: **Mark done** (secondary)
  - Completed: no buttons
  - Rejected: no buttons; the reason shows in red under the note
- Status chips: Pending (amber), Accepted (green), Completed (grey), Rejected (red).
- Info banner: "Accepting, rejecting or completing a request tells the customer in their booking. A rejection needs a reason."

### C11 – Reject (dialog)
Frame: `03d Queue — Reject dialog (overlay)`

- Title "Reject WCHC for Somchai Wongchai?" with "Booking K7M4QX · FL203 · 12 Nov".
- Textarea "Reason (shown to the customer, required)".
- Buttons **Back** (secondary) and **Reject request** (red).

---

## 7. Where the design and the plan differ (decide before building)

| # | Design shows | Plan / schema says | Suggested decision | Owner |
| --- | --- | --- | --- | --- |
| D1 | "Prices guaranteed until 15:45 · simulated time" on search results | Search shows no price-guarantee time; the price is fixed only at hold (schema review #6) | Leave the pill out | A |
| D2 | Leg header "Price shown is the total for 1 adult + 1 child", while cells show per-passenger prices (USD 446 selected gives a total of USD 892) | Price per passenger | Change the header to "Price per passenger" | A |
| D3 | The hold ("Seats held for 14:32") starts at Review & pay, after Seats. The seat-taken 409 appears on the Seat step | Work split A8 sends `POST /bookings` from Passengers & extras | Send `POST /bookings` when leaving the Seat step ("Continue to review" or "Skip, choose seats later"), with the chosen seats in the same request. A owns the call in the booking-flow container; C's Seat page returns the choices. The doc's own Passengers page also says "Seats are held for 15 minutes after you finish this step" | A, C |
| D4 | A customer can cancel an unpaid held booking (05a, P1) | Cancel route is for confirmed bookings; a given-up hold expires | `POST /bookings/:ref/cancel` on a `held` booking calls `releaseBooking` (→ `expired`, no fee) | B |
| D5 | No-results page suggests nearby dates with enough seats | Not in the doc | Optional: search ±3 days for the same route; or show only the message | A |
| D6 | Staff "Guest (no account)" booking | `booking.customer_id` is NOT NULL; staff book for an existing customer | Ask Feature 7 whether a guest gets a customer record; until then, hide the Guest tab | A |
| D7 | Staff search by ticket number or passport; date type, period and status filters; a history list | Doc: search by reference, passenger name or flight; no history table | Add the filters to `GET /staff/bookings`. Build the history from `booked_at`, `confirmed_at`, `cancelled_at` and `booked_by_staff_id` (no new table) | B |
| D8 | Staff cancel has a reason select but no fee-waiver option; Booking detail has no "Choose seat" or assistance status | Plan: optional fee waiver logged to Feature 15; Booking detail shows seats and request status | Add a "Waive fee" checkbox to the staff dialog. Add the seat link and assistance block to Booking detail in the same card style | B, C |
| D9 | Passenger form asks for given name, family name, date of birth and passport | Names, date of birth and passport belong to Feature 7; Feature 3 sends `passenger_id` | Use Feature 7's component or API to create or pick the passenger, then send its id | A |
| D10 | My Trips "newest departure first"; queue "oldest departure first" | Doc: My Bookings by `booked_at`, upcoming first; queue by `requested_at` | Follow the design for display order (departure), and agree it in the group | B, C |
| D11 | Ticket shown as "217-4400123456" | Stored as 13 digits without a hyphen | Format with the hyphen in the UI only | B |
| D12 | Queue row with code `STCR` (stretcher) | Allowed codes: WCHR, WCHS, WCHC, UMNR, MEDA | Leave STCR out (it would need a schema change by the DB team) | C |
| D13 | Queue status "Pending" | Database value `requested` | Show "Pending" for `requested` | C |
| D14 | Booking detail note says the refund is processed by checkout (feature 5a) | Refunds are Feature 5b | Use "refunds (feature 5b)" in the copy | B |
| D15 | "FEATURE 3 / STAFF VIEW" chips and "Prototype…" or "Preview: …" lines | Prototype labels | Don't build them | All |

---

## 8. Reusing existing code (don't rebuild what exists)

- **staff-web** already has:
  - shadcn/ui components in `apps/staff-web/src/components/ui/`: `badge`, `button`, `card`, `checkbox`, `dialog`, `dropdown-menu`, `input`, `label`, `select`, `sheet`, `sidebar`, `table`, `tabs`, `tooltip`, `alert`, `separator`, `skeleton`
  - the theme tokens from section 1 in `apps/staff-web/src/index.css`

  Use these for B13, A9 and C11.
- **The staff sidebar shell** (`AdminShell`, `AppSidebar`, `TopBar`) lives in Group 11's folder `apps/staff-web/src/features/admin-console/`. The Figma sidebar matches it. Ask Group 11 or the Dev Leads how Feature 3's pages plug into it (menu items and routes) instead of copying it.
- **customer-web** has no shared theme yet on `dev`:
  - Feature 12's PR #26 adds Tailwind and shadcn with the same palette (`src/globals.css`).
  - Feature 6 keeps its own `features/checkin-boarding/styles/tokens.css`.

  Ask the Dev Leads which way to go. Until then, copy the section 1 values into `features/booking-search/styles/tokens.css` (prefixed `--f3-…`), so nothing clashes.
- **Seat map look:** Feature 6's check-in seat map (PR #28, `components/seatmap.module.css`) is drawn from the same kit. C can match its look for consistency, but must not import from Feature 6's folder.

---

## 9. How to use these notes with an AI coding tool

1. Keep this file next to the other plan files, for example in `.f3-plan/feature-03-ui-notes.md`.
2. For one page at a time, give the tool:
   - the matching section here
   - section 1 (design system)
   - the task from `feature-03-work-split.md`
   - one existing page to copy the style from

   Example:
   > I'm Member C, task C11. Build the staff Special Assistance Queue page described in @.f3-plan/feature-03-ui-notes.md (sections 1, 5 and "C11 – Special Assistance Queue" in section 6). Use the shadcn components in @apps/staff-web/src/components/ui and the tokens in @apps/staff-web/src/index.css. Data comes from `GET /staff/service-requests` (task C6 in @.f3-plan/feature-03-work-split.md). Apply decisions D12 and D13 from section 7.
3. Settle the section 7 differences in your group before building the affected pages.
4. If the tool can read images, also attach a screenshot of the Figma frame; the frame names in this file tell you which one.
