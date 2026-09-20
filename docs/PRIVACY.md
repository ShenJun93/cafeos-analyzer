# Privacy model v0.1

Customer existence and marketing consent are separate concepts. PII should be encrypted at rest; matching should use a tenant-scoped deterministic HMAC or equivalent keyed representation; analytics should operate on surrogate customer IDs.

Consent is purpose- and channel-specific and requires evidence, timestamps and revocation state. Cross-tenant identity matching is prohibited.

Production must support retention limits, deletion, audit trails and tenant isolation. The analyzer does not automatically activate marketing campaigns in v0.1.
