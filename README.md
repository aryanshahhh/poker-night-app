# Poker Night Table 🃏

A TypeScript app for one host to run a Texas Hold’em night.

## Run locally

```bash
pnpm install
pnpm dev
```

Open the local URL printed by the dev server.

## How to use

1. Add players and set one buy-in price and chip stack.
2. Record bets and folds, move through pre-flop, flop, turn, and river, and enter the board cards.
3. Award each pot to the winner. Record rebuys between hands.
4. Open Night Replay for Pot X-ray, stage-by-stage stacks, and saved hands.
5. Open Results for money totals and payouts. Close the night after the last pot is awarded.

The game saves in this browser’s local storage. It does not sync across devices. Bluff Vault cards are hidden in the app until reveal, but this is not secure storage against someone with access to the browser. The current version awards each pot to one winner and does not split pots or calculate side pots.
