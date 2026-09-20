# Canonical data contract v0.1

## Required line-item fields
- `transaction_id`
- `occurred_at`
- `store`
- `product`
- `quantity`
- `net_amount`

## Optional fields
- `customer_phone` or source customer id
- `gross_amount`
- `discount_amount`
- `cost`
- `category`
- `channel`
- `payment_method`
- `refund`
- `variant`

Missing optional fields degrade capabilities instead of rejecting an import. Customer analytics require deterministic identity coverage. Margin analytics require cost coverage.

## POS adapters
Adapters may transform vendor-specific fields into the canonical contract. Core analytics must never depend on KiotViet, CUKCUK, Sapo, iPOS or POS365 field names.
