# Synthetic data policy

Every dataset committed to this public repository is synthetic and exists only for tests, demos, or compatibility development.

- Customer identifiers use visibly synthetic values such as `000...` or generated test IDs.
- Store, transaction, and product values are fabricated examples.
- Vendor-named fixtures model field vocabulary only; they are not merchant exports.
- No fixture should be copied from a real café's sales file, even after manually deleting obvious PII.

If a real dataset is used during field validation, generate only a privacy-reviewed derived artifact outside this repository. Do not commit the raw file, pseudonymization key, operator identity, commercial notes, or validation registry.
