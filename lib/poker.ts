export const rounds = ["Pre-flop", "Flop", "Turn", "River"] as const;
export type Round = (typeof rounds)[number];

export type Player = {
  id: string;
  name: string;
  chips: number;
  paid: number;
  buyins: number;
};

export type Bet = {
  id: string;
  playerId: string;
  round: Round;
  amount: number;
  kind: "bet" | "fold";
};

export type Hand = {
  id: string;
  number: number;
  round: Round;
  board: string[];
  bets: Bet[];
  startingStacks: Record<string, number>;
  privateCards: Record<string, [string, string]>;
  revealed: string[];
  winnerId?: string;
  won?: number;
};

export type Game = {
  started: boolean;
  closed: boolean;
  buyinCash: number;
  chipsPerBuyin: number;
  smallBlind: number;
  bigBlind: number;
  timerSeconds: number;
  players: Player[];
  current: Hand | null;
  history: Hand[];
};

export const emptyGame: Game = {
  started: false,
  closed: false,
  buyinCash: 20,
  chipsPerBuyin: 1000,
  smallBlind: 10,
  bigBlind: 20,
  timerSeconds: 0,
  players: [],
  current: null,
  history: [],
};

export const deck = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"].flatMap((rank) =>
  ["♠", "♥", "♦", "♣"].map((suit) => `${rank}${suit}`),
);

export const uid = () => Math.random().toString(36).slice(2, 10);
export const potOf = (hand: Hand) => hand.bets.reduce((sum, bet) => sum + bet.amount, 0);
export const num = (value: number) => new Intl.NumberFormat("en-US").format(value);
export const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
export const playerName = (game: Game, id: string) => game.players.find((player) => player.id === id)?.name ?? "Player";

export function freshHand(game: Game): Hand {
  return {
    id: uid(),
    number: game.history.length + 1,
    round: "Pre-flop",
    board: ["", "", "", "", ""],
    bets: [],
    startingStacks: Object.fromEntries(game.players.map((player) => [player.id, player.chips])),
    privateCards: {},
    revealed: [],
  };
}

export function foldedIds(hand: Hand): string[] {
  return hand.bets.filter((bet) => bet.kind === "fold").map((bet) => bet.playerId);
}

export function payouts(game: Game): Record<string, number> {
  const issued = game.players.reduce((sum, player) => sum + player.buyins * game.chipsPerBuyin, 0);
  const cents = Math.round(game.players.reduce((sum, player) => sum + player.paid, 0) * 100);
  if (!issued) return {};
  const shares = game.players.map((player) => {
    const exact = (player.chips / issued) * cents;
    return { id: player.id, whole: Math.floor(exact), fraction: exact % 1 };
  });
  const chipsHeld = game.players.reduce((sum, player) => sum + player.chips, 0);
  let remainder = Math.round((chipsHeld / issued) * cents) - shares.reduce((sum, share) => sum + share.whole, 0);
  shares.sort((a, b) => b.fraction - a.fraction);
  for (const share of shares) {
    if (remainder <= 0) break;
    share.whole += 1;
    remainder -= 1;
  }
  return Object.fromEntries(shares.map((share) => [share.id, share.whole / 100]));
}

export function chipsAt(hand: Hand, playerId: string, round: Round): number {
  const through = rounds.indexOf(round);
  return (hand.startingStacks[playerId] ?? 0) - hand.bets
    .filter((bet) => bet.playerId === playerId && rounds.indexOf(bet.round) <= through)
    .reduce((sum, bet) => sum + bet.amount, 0);
}

export function potAt(hand: Hand, round: Round): number {
  const through = rounds.indexOf(round);
  return hand.bets
    .filter((bet) => rounds.indexOf(bet.round) <= through)
    .reduce((sum, bet) => sum + bet.amount, 0);
}
