# Events, group bookings and document scanning

## Events & Bookings

Ordinary museum visitors do not need a booking. The combined Events & Bookings page has Events, Group bookings and Booking schedule views. Use group bookings for organised schools, private groups and parties. The separate Visitor Bookings and Equipment & Loans pages have been removed. Existing records are retained.

Events page permissions cover the combined workspace. System Admins set group capacity, visit times, notice, prices and confirmation rules under Group booking rules. Public requests stay closed until enabled. Confirmed group bookings link into Events; contact details and arrangement notes stay in their booking record. The public form states that ordinary museum visitors do not need to book.

## Scan documents and old maintenance logs

Open Documents → Scan document / PDF, or Maintenance & Fleet → Scan old maintenance log. Take a photo or upload photographs/PDFs, up to six pages per scan and 20 MB per source file. Pages are prepared as readable images; rotate any sideways page before reading.

The default reader uses Gemini 3.8 Flash through an authenticated Firebase Cloud Function and Google Cloud Gemini in the same Firebase project. There is no public AI secret in the site. Only verified accounts with Documents or Maintenance editing access can read pages. Requests are limited to 60 pages per user and 400 pages per project per day. On-device OCR is available as an alternative or fallback, with an explicit message when it is used. It is less suitable for handwriting.

Review the transcription against Compare original pages. Correct uncertain names, handwriting and dates. Unknown dates stay blank. Choose the original work date and an existing asset before saving a historical maintenance log. Work performer and person importing the scan are recorded separately. Scanning never closes defects, signs off work or changes service status. Historical imports preserve existing maintenance and archive records, and reject repeated saves of the same scan.

Save reviewed document stores the text and source-page images in Documents. View scan & text reopens them. Maintenance history offers View original paperwork. Original PDF pages are retained as prepared page images rather than the original PDF file.

Gemini model reference: https://firebase.google.com/docs/ai-logic/models

## Microsoft 365

Publishing offers My Outlook calendar and, when a System Admin configures its mailbox, Shared EVLT calendar. Personal event links are separated by EVLT user and Microsoft account; shared links are reused by authorised staff. OneDrive selection stores an existing link without changing sharing permissions.

Register an organisation application in Microsoft Entra with this Single-page application redirect:
https://s4wf9js2k8-create.github.io/evlt-dashboard/

Use delegated permissions as needed: User.Read, Calendars.ReadWrite, Calendars.ReadWrite.Shared and Files.Read. Put the application/client and directory/tenant IDs in Settings → Microsoft 365 connections. Never enter a client secret. Staff need existing Microsoft permission to edit the shared calendar. Outlook publication is explicit, adds no attendees and sends no invitations. Later EVLT changes must be published again to update an Outlook entry.

## Maintenance

The work board, recurring services, inspection findings, maintenance history and explicit return-to-service review remain available. Open blocking work, unresolved red tags and overdue required service prevent release. A scan imports historical paperwork; a competent person still follows EVLT procedures when assessing an asset for use.

## Verification

Run tests as described in tests/README.md. Tests use synthetic records and the local database emulator. The Gemini model was additionally exercised against sample maintenance paperwork. Real Microsoft consent and connected-account operations require organisation setup.
