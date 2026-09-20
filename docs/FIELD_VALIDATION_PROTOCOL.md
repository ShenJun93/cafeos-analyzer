# Field validation protocol v0.2

Technical feasibility is no longer the main unknown. The next gate is whether real café operators can import their own exports, trust the metrics, discover something useful and want recurring use.

## Dataset intake

Target 10–20 permissioned validation sessions from the target ICP (3–15 café locations), with a mix of POS vendors. Fewer than 10 target-ICP records can never produce an overall PASS.

For each dataset/session record only:
- POS/source name and version if known
- number of stores
- date range and row count
- whether customer identifier and cost data are present
- import outcome and manual mapping steps
- metric reconciliation result against the operator's source report
- useful/new insight outcome
- repeat-use, continuous-sync and WTP outcomes only when actually asked

Do not retain raw files longer than necessary. Prefer `validation:profile` when only schema compatibility is needed. Use a locally generated pseudonymized validation pack when row-level reproducibility is needed without exposing raw customer/store/product/transaction identifiers.

## Session protocol

1. Ask the operator for the most detailed sales/invoice export they already use; do not require a CafeOS-specific template.
2. If a large export must be split by date, accept multiple adjacent or overlapping files and use batch analysis.
3. Observe whether upload/sheet/mapping succeeds without coaching.
4. Reconcile net sales and order count against the source system before showing higher-level insights.
5. Ask which finding is new, actionable, wrong or obvious.
6. Ask whether they would repeat this weekly and whether they would connect the POS for continuous sync.
7. Only after value is demonstrated, ask an open-ended willingness-to-pay question without anchoring to a price tier.
8. Record the outcome using `FIELD_VALIDATION_RECORD.md` and run the deterministic scorecard.

## Locked pass gates

- successful import >=80%
- metric trust >=90%
- useful/new insight >=60%
- repeat usage intent >=40%
- continuous-sync intent >=25%
- clear willingness to pay >=20% of value-demonstrated sessions where WTP was asked

Denominators are evidence-specific and reported explicitly by the scorecard. Missing/unasked evidence cannot be silently counted as positive.

If metric trust fails, stop product validation and fix correctness. If trust passes but useful insight/repeat intent fails, kill or pivot the intelligence thesis rather than adding more features.
