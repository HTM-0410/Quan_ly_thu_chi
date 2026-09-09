# Evidence 05 — OCR bundle scan

Input environment:

- web/.env.local contains a non-empty VITE_GEMINI_API_KEY.
- Sanitized key length: 39 characters.

Command behavior:

- Run npm run build.
- Enumerate dist/**/*.js and dist/**/*.map.
- Compare file contents against the exact env value without printing that value.

Result:

- JS/map files scanned: 8.
- Exact secret value present in dist: TRUE.
- Exact-match file count: 1.
- Literal AIza count in scanned output: 2.

Additional source evidence:

- config.ts exports GEMINI_API_KEY from import.meta.env.
- ocr.ts and billOcr.ts construct direct generativelanguage.googleapis.com URLs when the key is non-empty.
- config.ts logs key.length and key.prefix in non-production.

Conclusion: F14/REQ-014 is FAIL on the revision tested.

