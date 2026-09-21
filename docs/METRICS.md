# Metric specification v0.1

- **Net sales**: sum of canonical completed line-item `net_amount`, after represented refunds.
- **Orders**: distinct completed `(source_namespace, transaction_id)` identities. A transaction ID reused by two source namespaces counts as two orders.
- **AOV**: net sales / source-scoped completed orders.
- **Identified customer coverage**: completed orders with a deterministic customer identifier / completed orders.
- **Repeat customer**: identified customer with at least two completed transactions in the analysis horizon.
- **Repeat rate**: repeat customers / identified customers. Never divide by all transactions.

All numeric business metrics are computed deterministically. An LLM may format or explain supplied values, but may not calculate authoritative values.
