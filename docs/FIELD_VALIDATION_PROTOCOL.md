# Field validation protocol v0.3

Technical feasibility is no longer the main unknown. The next gate is whether real café owner/operators can import their own exports, trust the metrics, discover something useful and want recurring use.

## Dataset intake

Target 10–20 **permissioned** validation sessions from the target ICP:
- participant role class = `owner_operator`;
- 3–15 café locations;
- explicit permission to include the anonymous validation evidence.

Fewer than 10 permissioned target-ICP records can never produce an overall PASS. Session count is the current sampling unit; do not add participant identity/deduplication fields that would increase the PII surface without a separate approved protocol change.

Before a local field session processes a merchant export, ask participant role and explicit permission to process the file for that session. If permission is declined, do not invoke the Analyzer on the export and do not create a scoreable session draft.

Canonical evidence stores only bounded, non-identifying fields:
- normalized POS/source class: `kiotviet | cukcuk | sapo_fnb | ipos | pos365 | generic_excel_csv | other_pos | unknown`;
- participant role class and store count;
- derived target-ICP classification;
- permission flag;
- import/reconciliation/trust/insight/value/repeat/sync/WTP evidence;
- bounded acquisition attribution when present.

Unknown vendor detail may remain in local/private notes, but merchant names, contact details, URLs, raw query strings and free-form campaign labels must not enter the canonical registry.

Do not retain raw files longer than necessary. Prefer `validation:profile` when only schema compatibility is needed. Use a locally generated pseudonymized validation pack when row-level reproducibility is needed without exposing raw customer/store/product/transaction identifiers.

## Session protocol

1. Ask role and explicit processing permission **before** reading/analyzing a local merchant export.
2. Ask for the most detailed sales/invoice export the operator already uses; do not require a CafeOS-specific template.
3. If a large export must be split by date, accept multiple adjacent or overlapping files and use batch analysis.
4. Observe whether upload/sheet/mapping succeeds without coaching.
5. Reconcile net sales and order count against the source system before recording metric trust.
6. Record whether at least one insight was actually reviewed before asking whether it was new/useful.
7. Ask whether they would repeat this weekly and whether they would connect the POS for continuous sync.
8. Record concrete value separately from useful/new insight.
9. Only after value is demonstrated, ask an open-ended willingness-to-pay question **without showing a price tier first**. A price band is optional supplementary metadata after the initial answer and never changes the scorecard numerator/denominator.
10. Finalize the local `validation-record.draft.json` into the canonical record and add it through `field:registry:add`; the registry rejects impossible dependencies, unbounded values, and conflicting duplicate IDs.

## Locked pass gates

- successful import >=80%
- metric trust >=90%
- useful/new insight >=60%
- repeat usage intent >=40%
- continuous-sync intent >=25%
- clear willingness to pay >=20% of value-demonstrated sessions where WTP was asked

Denominators are evidence-specific and reported explicitly by the scorecard. Missing/unasked applicable evidence cannot be silently counted as negative or positive.

If metric trust fails, stop product validation and fix correctness. If trust passes but useful insight/repeat intent fails, kill or pivot the intelligence thesis rather than adding more features.
