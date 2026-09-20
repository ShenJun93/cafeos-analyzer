# XLSX support boundary v0.1

Wave 6 adds a dependency-free, bounded OOXML reader for **validation**, not a claim of full Excel compatibility.

Supported:
- standard `.xlsx` ZIP containers using stored/deflate entries
- workbook/sheet discovery through relationships
- shared strings and inline strings
- numeric, boolean and cached formula results
- common Excel date styles and the 1900/1904 date systems
- multi-sheet inspection and explicit selection when candidates are ambiguous

Rejected or bounded:
- encrypted workbooks
- ZIP64 workbooks
- files larger than 20MB
- more than 50 sheets
- more than 200,000 rows per sheet
- suspicious decompression ratios and oversized decompressed entries

The parser is isolated behind `src/xlsx.ts`. Before public internet launch, replace or independently audit this validation parser against a maintained spreadsheet library/sandbox and a malicious-workbook corpus. Core metrics and the canonical model must remain parser-independent.
