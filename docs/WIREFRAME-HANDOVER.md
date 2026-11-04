# Browns Pharmacy wireframe handover

The working draft is `versions/v1.html`. It remains unreleased and uncommitted. SANCHO owns the architecture and design handover to Salvatore; Brown’s team owns the eventual implementation. Project ID `browns-pharmacy-wireframe`, hostname and shared D1/R2 bindings are unchanged.

## Review

Start with http://127.0.0.1:4173/ and use the customer navigation or reviewer page tabs. Site Architecture lists 47 screen entries, their template families and open decisions. Component Library identifies C01–C28. These are reusable screen families and variants, not 47 unique designs.

The monochrome palette is retained. Images are editable placeholders. Customer copy, content lists, document links, branch details and profile placeholders have stable content keys; reviewer explanations remain structural.

## Revision coverage

- All Services has Health/Beauty category cards plus a searchable, filterable archive. It is reached from Explore services and both service dropdowns, not a separate main-navigation item. Category pages show their own services. Thirteen service records cover the brief’s eleven services and the current Cholesterol/Diabetes packages. Other Health Services provides a general pharmacy/enquiry route rather than inventing a generic consultation.
- The directory contains all 29 pharmacies published on the current website, with addresses, contact details, coordinates and individual weekly hours. Missing day information is labelled for confirmation, not assumed closed.
- There are 152 practitioner records grouped by name, preserving branch-specific visiting schedules. Branch pages support name/specialty filtering and pagination. Swieqi’s 29 practitioners and Zebbug’s 22 exercise larger layouts. These are published directory records, not verified live appointment availability.
- Five service-location lists use current published mappings: Health Check 29, Food Intolerance 29, Allergy Test 12, Laser Hair Removal 11 and Teeth Whitening 1. Locations for other/new services remain labelled examples.
- Optional browser location sorts matching pharmacies by approximate straight-line distance. Service filtering happens before distance sorting. Location stays in memory; the map is an explicitly labelled schematic, not a connected map or travel-time service. Town search works without location permission.
- Shop & Brands is visible in the main navigation. Services have purchase options, basket, checkout and simulated payment. Product catalogue/detail templates and all nine named brand pages are accessible. Actual product inventory and online product sales remain unconfirmed; sample catalogue entries are labelled.
- Seven named management profiles are separate from the pharmacy teams. Pharmacy teams are grouped by branch, with reusable pharmacist profile slots. Pharmacist identities and assignments have not been supplied and are not invented.
- Investor Relations has a distinct top-right utility link, separate from the customer navigation. The hub prioritises announcements and the latest annual report. Company information, eight board members, committee/secretary/auditor details, 42 announcement documents and nine annual financial reports are populated. Financial statements cover 2017–2025. Announcement filtering uses explicitly labelled file-upload years, not unverified publication dates.
- Booking supports multiple services, each with its own branch, date and time. Visitors can add, edit and remove visits, enter contact details once, and review the combined confirmation. Exact duplicate date/time choices are rejected. Durations, travel buffers, atomic reservation and real provider behaviour remain decisions for Brown’s.
- The booking button is compact and positioned by the viewer when embedded, above the bottom review bar and away from editor controls. The standalone snapshot uses a fixed control. It is suppressed during transaction/account/reviewer pages and edit/comment mode.
- Help contains 24 draft FAQs with search, topic navigation, grouped accordions and empty-result recovery. Policy and clinical answers remain content inputs.
- Login, registration, password reset, account overview, appointments, profile, payment methods, loyalty/rewards, help and logout are proposed screens. Appointment cancellation/rescheduling are simulated. The brief names account features but identifies no platform and does not define “CMR”. Credentials and card details are never stored or sent.
- The visible “Reference basis” section and the requested brief/meeting-note paragraph are removed. Internal provenance stays in this handover only.

## Source material

The brief and embedded sitemap, Neil’s meeting notes and 21 screenshots establish the scope. Neil explicitly permitted suitable existing copy/data for the wireframe. Public website records were inspected on 30 October 2026:

- https://browns.pharmacy/ — complete pharmacy and visiting-practitioner directory data embedded in the public page.
- https://browns.pharmacy/health/health-check
- https://browns.pharmacy/health/allergy-test
- https://browns.pharmacy/health/food-intolerance
- https://browns.pharmacy/beauty/laser-clinic
- https://browns.pharmacy/beauty/teeth-whitening
- https://browns.pharmacy/hr/ — management names and roles.
- https://browns.pharmacy/investor-relations/information — company and governance records.
- https://browns.pharmacy/investor-relations/investor-resources/announcements — document titles, codes and original file destinations.
- https://browns.pharmacy/investor-relations/investor-resources/financial — financial statement destinations.

Existing names/data are draft reference records requiring client validation before launch. No source photographs are used. Directory entries grouped by public name may need deduplication/identity validation by Brown’s. Investor biographies are brief summaries, not a full historical migration.

## Behaviour and outstanding decisions

Service purchase and appointment booking are separate. Buying does not reserve a slot. Basket service choices persist in sessionStorage; booking/contact/billing details remain in memory and are cleared on simulated completion. Forms send nothing. Profile changes are a preview, not persistence. No production CMS, scheduling, payment or account integration is included.

Brown’s should confirm fees, variants, consultation requirements, service duration, guest policy, cancellation/refund rules, purchase redemption, account platform and rewards rules, final new-service locations, exceptions to published hours, pharmacist content, product catalogue and launch scope. These do not require SANCHO to choose a CMS.

## Validation

`node scripts/check-snapshot.mjs` checks 942 route/filter variants, 47 screen entries, stable editable keys, existing and multi-visit booking, conflicts, checkout arithmetic and recovery, account previews, directory relationships and filter behaviour. `--write-fields` regenerates the literal snapshot allow-list from covered routes/states. `--export-render-audit` writes an ignored local HTML audit artifact.

The review tests cover worker/local-editor history, comments/replies, project isolation and pagination. Build and deployment configuration checks pass; no release is performed.

Browser checks verified desktop and mobile All Services layouts, the mobile booking panel and compact viewer control, and a complete two-service booking at different pharmacies/days. Further visual checks were interrupted when browser use became disabled in Work settings. A browser log reported an intermittent MutationObserver error during a navigation; the application continued rendering and the booking panel worked, but its source was not identified. Full cross-browser visual/accessibility review remains advisable before client release.

## Sticky navigation and service panels

Only the lower desktop navigation row remains visible while scrolling, with reduced sticky padding below the review toolbar when embedded. The utility strip and logo/account row scroll away. Mobile retains its compact logo/menu header. Dropdowns and the mobile menu have bounded scrolling. Desktop summary sidebars stick below the main header, stop within their content section and scroll internally if taller than the available screen. On mobile the sidebar stays in normal document flow. The schematic map marker canvas has an explicit full width and eight separated pin positions.

### Directory navigation and comparison updates

- Directories now use compact Previous/Next links, up to five page numbers and ellipses. Small screens show the current/total page count between Previous and Next. Search and filters survive pagination.
- Pharmacy and service-location lists offer an optional walking/driving **example** travel-time preview. These sample ranges are not calculated from location, distance, traffic or a routing service. The separate location-based distance remains approximate straight-line distance. A production routing provider and travel-mode choice are needed for actual journey estimates.
- C23 is a reusable before/after comparison on beauty service details, treatment stories and the component library. Drag across the image or use the labelled range control with arrow keys. Existing before/after upload keys are retained. Editing mode exposes both images side by side for uploads. Use matching viewpoint, crop and scale, with approved case context.
- Automated checks cover pagination boundaries/filter retention, comparison movement and explicit travel-preview labelling. Browser visual verification remains pending because browser control is disabled in Work settings.

### Shop architecture revision — 4 November 2026

Shop & Brands now uses a dropdown with all-products, category and brand entry routes. A category index and category archive join the shared product/brand archive, with search, category/brand filters, min/max price, sort order, removable filter chips and pagination. All 41 supplied inventory codes are preserved in the Site Architecture mapping; 30 proposed public product categories are grouped into four departments. See [SHOP-ARCHITECTURE.md](SHOP-ARCHITECTURE.md) for the exact mapping and decisions awaiting Brown’s. Example catalogue prices and brand assignments are illustrative. Category range approval and physical-product fulfilment remain unconfirmed.

### Navigation fixes — 4 November 2026

The mobile menu height limit excludes the open menu from its header measurement, removing the circular resize calculation shown in Neil’s recording. Its expanded dropdown scrolls within the available preview height. Investor Relations uses its own sticky section navigation on the hub and every investor detail/archive; the normal header scrolls away in this section. Browser checks covered the embedded 376 px menu and nested Shop dropdown, desktop shop filtering and the investor sticky bar.

### Refined shop filters — 4 November 2026

Brands and categories are checkbox multi-selects (OR within a group, AND between groups). Selected options have individually removable chips and survive pagination. A dual-handle price slider updates the visible minimum/maximum labels and supports arrow keys. Search and sort sit above product results; changing sort applies the current selections. Desktop filters stick below the primary navigation with bounded scrolling. At mobile/tablet widths up to 850 px the filter panel starts collapsed, stays in normal page flow and can be opened to adjust selections.

The filter sidebar now uses separate collapsed Categories and Brands disclosures with a single bounded sidebar scroll area on desktop. Search submits through an icon within its input; sorting is aligned to the far right. Product details include up to four related example products, prioritised by category, then brand, then department, excluding the current product.

Quick booking groups the service dropdown into Health services and Beauty services. The floating Book a visit entry appears when the desktop primary navigation sticks (after 120 px of scrolling on mobile), hides at the top and while the menu or booking dialog is open, and stays absent throughout Investor Relations. This applies both to standalone snapshots and the version viewer.
