# Flakeless

Pile your cube on the days that work. Friends flake less when the board shows the pile.

## Live

https://flakeless.vercel.app/

Create a board, copy the invite link (`?e=CODE&title=...`), send it to friends.

## Local

```bash
npm install
FLAKELESS_API_PORT=4175 node server.mjs   # API (needs .env.local Neon vars)
npm run dev                               # UI on :5173, proxies /api → :4175
```

## MVP flow

1. Start a board or join with a code
2. Pick name + cube color
3. Tap dates — your cube stacks
4. Towers grow as friends join; hottest days glow
5. Drag to orbit, wheel/pinch zoom, ‹ › change month
