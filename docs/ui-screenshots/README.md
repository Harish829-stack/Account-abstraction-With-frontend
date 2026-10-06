# UI verification captures

These post-change captures use the unauthenticated dashboard shell served from the
local Vite build. Wallet-gated dashboard, chat, history, transaction confirmation,
and session-key states require a funded Arbitrum Sepolia test wallet and remain in
the manual smoke checklist.

The repository did not contain baseline captures, so these are post-change evidence,
not a synthetic before/after comparison.

Capture command:

```sh
cd frontend
node scripts/capture-responsive.mjs http://127.0.0.1:5173/ ../docs/ui-screenshots
```

Measured document widths (viewport / document scroll width):

- 320 / 305 px
- 375 / 360 px
- 768 / 753 px
- 1024 / 1009 px
- 1440 / 1425 px

No capture had horizontal overflow. The post-change production Lighthouse report is
`docs/lighthouse-after.json`: performance 72, accessibility 93, CLS 0. A comparable
pre-change report was not present, so no non-regression claim is made from unlike data.
