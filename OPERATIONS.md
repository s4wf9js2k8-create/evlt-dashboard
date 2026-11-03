# Visitor bookings, equipment loans and fleet maintenance

## Getting started

System Admins can open Visitor Bookings and Equipment & Loans immediately. Grant other roles view/edit access through Settings & Permissions. Maintenance & Fleet uses its existing page permission. Public visit requests remain closed until a System Admin opens them in Visitor Bookings → Visit rules.

## Visits

Visit rules configure simultaneous group capacity, opening hours, visit days, minimum notice, optional adult/child/minimum prices and public instructions. Prices are estimates; each booking can have a separate agreed quote. There is no payment collection.

Requests move through Request, Reviewing, Confirmed and Completed, with Cancelled and Declined retained. System Admin approval is required by default; an admin can delegate confirmation in Visit rules. Only a System Admin can approve exceptions to configured limits, with a recorded reason. Capacity counts overlapping confirmed group bookings; it does not count unrecorded walk-in visitors.

Confirming creates or updates one linked Events entry. Contact details, private arrangements and quotes stay in the booking hub. Events staff can create a linked booking from an existing event. Cancelling or declining removes the linked calendar entry and retains the booking history. Outlook publication is a separate explicit action; later EVLT changes must be published again if the Outlook entry needs updating.

The public form at `booking-request.html` accepts organiser details and preferred arrangements. It always creates an unconfirmed request, returns a reference, and does not send automatic email. Staff review and contact the organiser. Do not request children's names, card details or sensitive personal information there.

## Equipment

Register operational equipment explicitly. Linking an existing Documents item code does not make the wider museum collection loanable. Checkout is restricted to names in the EVLT volunteer directory. One active loan per item is enforced on the server. Returns retain the loan record. A damaged return or an item needing inspection creates a blocking work order and holds the asset.

## Maintenance

Fleet records, photographs and historical maintenance logs are retained. Work orders move through Reported, In progress and Awaiting inspection. Recording inspection findings closes a job. An explicit return-to-service review remains necessary to release the asset. Open blocking jobs, unresolved red-tagged fleet defects, overdue required service plans and expired equipment inspections prevent release. The named reviewer must follow EVLT procedures; the app does not certify engineering competence.

Recurring plans use day intervals and completion findings. A completion advances the due date from the actual completed day. Required overdue plans create holds; a daily midnight London-time check applies holds at date rollover. Completed-work entries preserve history without closing other jobs or releasing assets. QR labels open the relevant record after normal EVLT sign-in and permission checks.

## Microsoft 365 setup

In Microsoft Entra, register an organisation application and add the production root URL as a **Single-page application** redirect:

`https://s4wf9js2k8-create.github.io/evlt-dashboard/`

Use delegated Microsoft Graph permissions as needed: `User.Read`, `Calendars.ReadWrite`, `Calendars.ReadWrite.Shared` for a shared mailbox, and `Files.Read`. Apply your organisation's consent policy. Put the Application (client) ID and Directory (tenant) ID in Settings → Microsoft 365 connections. Do not create or enter a client secret.

Publishing offers My Outlook calendar and, when configured, Shared EVLT calendar. Each person’s own calendar is always available. An optional shared mailbox email enables the shared destination. Users must already have editing access to that mailbox calendar. Leave Calendar ID blank for its default calendar, or enter an ID belonging to that mailbox. Leave the shared mailbox blank until its address is known. Personal links are separated by EVLT user and Microsoft account; shared links can be updated by staff who have editing rights. A record can be published to both destinations. Changing the configured shared mailbox selects a new destination; it does not move old Outlook events.

Each person connects their own Microsoft account. Tokens stay in the browser session and are never stored in Firebase. Outlook publication creates/updates calendar entries without adding attendees or sending invitations. OneDrive selection stores an existing file link and never changes sharing permissions. Outlook confirmation links open a draft for staff to review and send themselves.

Reference: https://learn.microsoft.com/en-us/graph/outlook-create-event-in-shared-delegated-calendar

## Verification

See `tests/README.md`. Tests use synthetic records and local emulators; no production business records are needed. Real Microsoft consent and connected-account actions need a separate organisation account check after setup.
