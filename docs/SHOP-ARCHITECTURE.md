# Proposed shop architecture

Client inventory list supplied by Neil, 4 November 2026. All 41 source codes and names are preserved below, including original abbreviations/spelling. Customer labels and departments are proposals, not approved catalogue data.

Shop & Brands dropdown → Shop overview / Shop all products / Shop by category / Shop by brand. Services retain their own booking/purchase journeys.

The category and brand archives reuse the product archive with search, category/brand selection, minimum and maximum price, sorting, active filter removal, empty recovery and pagination. Category and brand pages retain their context when resetting filters. Prices, products and brand/category assignments are illustrative; no clinical products or online eligibility have been inferred from the inventory list.

| Code | Inventory name (exact) | Proposed customer label | Department / treatment |
|---|---|---|---|
| 1 | GASTROINTESTINAL SYSTEM | Digestive health | Medicines & treatments — category |
| 2 | CARDIOVASCULAR SYSTEM | Heart & circulation | Medicines & treatments — category |
| 3 | RESPIRATORY SYSTEM | Respiratory care | Medicines & treatments — category |
| 4 | CENTRAL NERVOUS SYSTEM | Nervous system | Medicines & treatments — category |
| 5 | INFECTIONS | Infections | Medicines & treatments — category |
| 6 | ENDOCRINE SYSTEM | Endocrine health | Medicines & treatments — category |
| 7 | OBST, GYNAE & UT DISORDERS | Women’s & urinary health | Medicines & treatments — category |
| 8 | MALIGNANT DISEASE & IMMUNOSUPP | Specialist treatments | Medicines & treatments — category |
| 9 | NUTRITION AND BLOOD | Nutrition & blood health | Medicines & treatments — category |
| 10 | MUSCULOSKELTAL & JOINT DISEASE | Muscles & joints | Medicines & treatments — category |
| 11 | EYE | Eye medicines | Medicines & treatments — category |
| 12 | EAR, NOSE AND OROPHARYNX | Ear, nose & throat | Medicines & treatments — category |
| 13 | SKIN | Skin treatments | Medicines & treatments — category |
| 14 | IMMUNO PRODUCTS & VACCINES | Immunological products & vaccines | Medicines & treatments — category |
| 15 | WOUND MANAGEMENT | Wound care | Medicines & treatments — category |
| 16 | OTHER MEDICINAL PRODUCTS | Other medicines | Medicines & treatments — category |
| 17 | FOOT CARE PRODUCTS | Foot care | Health & wellbeing — category |
| 20 | HAIR CARE | Hair care | Beauty & skincare — category |
| 21 | PERSONAL HYGIENE | Personal hygiene | Everyday essentials — category |
| 22 | SKIN CARE | Skincare | Beauty & skincare — category |
| 23 | COLOUR COSMETICS | Makeup | Beauty & skincare — category |
| 24 | FRAGRANCES | Fragrances | Beauty & skincare — category |
| 25 | NUTRITIONAL PRODUCTS | Vitamins & nutritional products | Health & wellbeing — category |
| 26 | ORAL CARE | Oral care | Health & wellbeing — category |
| 27 | BABY GOODS | Baby care | Everyday essentials — category |
| 28 | APPLIANCES | Health appliances | Health & wellbeing — category |
| 29 | SUNDRIES | Everyday accessories | Everyday essentials — category |
| 30 | EYE CARE | Eye care | Health & wellbeing — category |
| 31 | OPTICAL JOBS | Optical services | Services — service |
| 32 | SALON SERVICES | Salon services | Services — service |
| 33 | COMMISSIONS | Commissions | Internal — internal |
| 34 | MEDICAL SERVICES | Medical services | Services — service |
| 35 | GBY XMAS GIFTS | Gifts & seasonal | Everyday essentials — category |
| 36 | PROMOTIONAL MATERIAL | Promotional material | Internal — internal |
| 37 | ARTDECO | Artdeco | Brands — brand |
| 50 | GENERAL GOODS | General goods | Everyday essentials — category |
| 51 | LASER EXPRESS SERVICES | Laser services | Services — service |
| 52 | DEKA SERVICES | DEKA services | Services — service |
| 60 | WITHDRAWN STOCK CARDS | Withdrawn stock cards | Internal — internal |
| 100 | BEAUTY BRANDS | Beauty brands | Brands — brand |
| 101 | HEALTH CARE BRANDS | Health care brands | Brands — brand |

## Decisions for Brown’s

- Confirm the proposed names and department grouping. Inventory terms are retained as category-search aliases; mapping remains one-to-one for product categories. Codes are metadata, not customer navigation labels.
- Confirm which products are eligible for online sale in every medicinal category, especially specialist treatments (8) and immunological products/vaccines (14). Categories alone do not establish OTC status. Empty clinical category states deliberately await approved inventory.
- Preserve the distinction between Eye medicines (11)/Eye care (30), Skin treatments (13)/Skincare (22), and Nutrition & blood health (9)/Nutritional products (25).
- Brand codes 37, 100 and 101 should populate a separate brand dimension. Artdeco is already a brand. Brand family assignments need confirmation.
- Optical jobs, salon, medical, Laser Express and DEKA codes map to service journeys; exact matching to existing services needs confirmation.
- Commissions, promotional material and withdrawn stock cards are omitted from the public shop as a proposal. Do not publish withdrawn items.
- Confirm what GBY XMAS GIFTS includes and whether General goods / Sundries need narrower public categories.
- Physical-product purchase, stock eligibility, delivery/collection, returns and a mixed product/service basket remain separate scope decisions. The existing working service-purchase flow is retained.

## Example catalogue

18 generic non-medicinal example cards demonstrate brand/category combinations, price filtering, sorting and pagination. These are layout fixtures, not an asserted list of stocked products or actual prices. Category pages without examples show an explicit content-pending empty state.

### Refined shop filters — 4 November 2026

Brands and categories are checkbox multi-selects (OR within a group, AND between groups). Selected options have individually removable chips and survive pagination. A dual-handle price slider updates the visible minimum/maximum labels and supports arrow keys. Search and sort sit above product results; changing sort applies the current selections. Desktop filters stick below the primary navigation with bounded scrolling. At mobile/tablet widths up to 850 px the filter panel starts collapsed, stays in normal page flow and can be opened to adjust selections.
