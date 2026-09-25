"use client";

import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowRight, Check, ChevronRight, Clock3, Coins, Eye, History, LockKeyhole, Plus, RotateCcw, ShieldCheck, Spade, Trophy, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bet, deck, emptyGame, foldedIds, freshHand, Game, Hand, money, num, payouts, playerName, potAt, potOf, Round, rounds, uid, chipsAt } from "@/lib/poker";

const KEY = "poker-night-table-v1";
type View = "table" | "replay" | "results";
type BrowserTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type ToolDocument = Document & {
  modelContext?: { registerTool: (tool: BrowserTool, options: { signal: AbortSignal }) => void | Promise<void> };
};
const fmt = (n: number) => num(n);

function Card({ value, small = false }: { value: string; small?: boolean }) {
  return <span className={"playing-card " + (small ? "small " : "") + (/[♥♦]/.test(value) ? "red " : "") + (value ? "filled" : "")}>{value || "·"}</span>;
}
function CardSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="card-select">{label}<select aria-label={label} value={value} onChange={e => onChange(e.target.value)}><option value="">—</option>{deck.map(card => <option key={card}>{card}</option>)}</select></label>;
}

export default function Home() {
  const [game, setGame] = useState<Game>(emptyGame);
  const [loaded, setLoaded] = useState(false);
  const [names, setNames] = useState(["Alex", "Sam", "Jordan", "Taylor"]);
  const [view, setView] = useState<View>("table");
  const [message, setMessage] = useState("");
  const [betPlayer, setBetPlayer] = useState("");
  const [betAmount, setBetAmount] = useState("");
  const [selectedHand, setSelectedHand] = useState("");
  const [replayRound, setReplayRound] = useState<Round>("River");
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultPlayer, setVaultPlayer] = useState("");
  const [holeCards, setHoleCards] = useState<[string, string]>(["", ""]);
  const [timerLeft, setTimerLeft] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => { try { const saved = localStorage.getItem(KEY); if (saved) setGame(JSON.parse(saved) as Game); } catch {} setLoaded(true); }, []);
  useEffect(() => { if (loaded) localStorage.setItem(KEY, JSON.stringify(game)); }, [game, loaded]);
  useEffect(() => { if (!timerRunning || timerLeft <= 0) return; const tick = window.setInterval(() => setTimerLeft(s => Math.max(0, s - 1)), 1000); return () => window.clearInterval(tick); }, [timerRunning, timerLeft]);
  useEffect(() => { if (timerLeft === 0) setTimerRunning(false); }, [timerLeft]);
  useEffect(() => { if (game.started && !betPlayer && game.players[0]) setBetPlayer(game.players[0].id); }, [game.started, game.players, betPlayer]);

  const current = game.current;
  const pot = current ? potOf(current) : 0;
  const folded = current ? foldedIds(current) : [];
  const cashIn = game.players.reduce((sum, p) => sum + p.paid, 0);
  const issued = game.players.reduce((sum, p) => sum + p.buyins * game.chipsPerBuyin, 0);
  const liveChips = game.players.reduce((sum, p) => sum + p.chips, 0) + pot;
  const payoutMap = payouts(game);
  const cashOut = game.players.reduce((sum, p) => sum + (payoutMap[p.id] ?? 0), 0);
  const balanced = issued === liveChips && Math.abs(cashIn - cashOut) < 0.001;
  const shownHand = game.history.find(h => h.id === selectedHand) ?? game.history.at(-1);
  const biggestPot = Math.max(0, ...game.history.map(potOf));
  const betTotal = game.history.reduce((sum, h) => sum + potOf(h), 0);
  const story = useMemo(() => {
    const last = game.history.at(-1);
    if (!last) return "Your table story starts with the first hand.";
    let streak = 0;
    for (const h of [...game.history].reverse()) { if (h.winnerId !== last.winnerId) break; streak++; }
    if (streak >= 3) return playerName(game, last.winnerId ?? "") + " has won " + streak + " hands in a row.";
    if (potOf(last) === biggestPot) return "Hand " + last.number + " was tonight’s biggest pot: " + fmt(biggestPot) + " chips.";
    return playerName(game, last.winnerId ?? "") + " took hand " + last.number + " with " + fmt(potOf(last)) + " chips.";
  }, [game, biggestPot]);
  function notice(s: string) { setMessage(s); window.setTimeout(() => setMessage(""), 4500); }

  function startGame() {
    const clean = names.map(n => n.trim()).filter(Boolean);
    if (clean.length < 2) return notice("Add at least two players.");
    if (new Set(clean.map(n => n.toLowerCase())).size !== clean.length) return notice("Each player needs a different name.");
    if (game.buyinCash <= 0 || !Number.isInteger(game.buyinCash * 100) || game.chipsPerBuyin <= 0 || !Number.isInteger(game.chipsPerBuyin)) return notice("Enter a buy-in in cents and a whole-chip stack.");
    if (![game.smallBlind, game.bigBlind].every(n => Number.isInteger(n) && n >= 0) || game.smallBlind > game.bigBlind) return notice("Use valid blinds, with the big blind at least as large.");
    const players = clean.map(name => ({ id: uid(), name, chips: game.chipsPerBuyin, paid: game.buyinCash, buyins: 1 }));
    const base = { ...game, started: true, closed: false, players, history: [] };
    setGame({ ...base, current: freshHand(base) });
    setBetPlayer(players[0].id);
    setTimerLeft(game.timerSeconds);
  }
  function addBet(amount: number, id = betPlayer) {
    if (!current) return;
    const p = game.players.find(x => x.id === id);
    if (!p) return notice("Pick a player.");
    if (folded.includes(id)) return notice(p.name + " has folded.");
    if (!Number.isInteger(amount) || amount <= 0) return notice("Enter a whole-chip bet above zero.");
    if (amount > p.chips) return notice(p.name + " has only " + fmt(p.chips) + " chips left.");
    const bet: Bet = { id: uid(), playerId: id, round: current.round, amount, kind: "bet" };
    setGame(old => ({ ...old, players: old.players.map(x => x.id === id ? { ...x, chips: x.chips - amount } : x), current: old.current ? { ...old.current, bets: [...old.current.bets, bet] } : null }));
    setBetAmount("");
    if (game.timerSeconds) { setTimerLeft(game.timerSeconds); setTimerRunning(true); }
  }
  function fold(id: string) {
    if (!current || folded.includes(id)) return;
    setGame(old => ({ ...old, current: old.current ? { ...old.current, bets: [...old.current.bets, { id: uid(), playerId: id, round: old.current.round, amount: 0, kind: "fold" }] } : null }));
  }
  function setBoard(index: number, card: string) {
    if (!current) return;
    const used = [...current.board.filter((_, i) => i !== index), ...Object.values(current.privateCards).flat()];
    if (card && used.includes(card)) return notice("That card is already in this hand.");
    setGame(old => ({ ...old, current: old.current ? { ...old.current, board: old.current.board.map((c, i) => i === index ? card : c) } : null }));
  }
  function advance() {
    if (!current) return;
    const index = rounds.indexOf(current.round);
    if (index >= 3) return;
    if (index === 1 && current.board.slice(0, 3).some(c => !c)) return notice("Enter all three flop cards first.");
    if (index === 2 && !current.board[3]) return notice("Enter the turn card first.");
    setGame(old => ({ ...old, current: old.current ? { ...old.current, round: rounds[index + 1] } : null }));
  }
  function award(id: string) {
    if (!current) return;
    if (folded.includes(id)) return notice("A folded player cannot win.");
    if (pot <= 0) return notice("Record a bet before awarding the pot.");
    const complete: Hand = { ...current, winnerId: id, won: pot };
    setGame(old => ({ ...old, players: old.players.map(p => p.id === id ? { ...p, chips: p.chips + pot } : p), current: null, history: [...old.history, complete] }));
    setSelectedHand(current.id);
    setReplayRound(current.round);
    setTimerRunning(false);
    notice(playerName(game, id) + " wins " + fmt(pot) + " chips. Hand saved.");
  }
  function nextHand() { if (game.current || game.closed) return; setGame(old => ({ ...old, current: freshHand(old) })); setView("table"); setTimerLeft(game.timerSeconds); }
  function rebuy(id: string) {
    if (current?.bets.length) return notice("Record rebuys between hands, before the next bet.");
    setGame(old => ({ ...old, players: old.players.map(p => p.id === id ? { ...p, chips: p.chips + old.chipsPerBuyin, paid: p.paid + old.buyinCash, buyins: p.buyins + 1 } : p), current: old.current ? { ...old.current, startingStacks: { ...old.current.startingStacks, [id]: (old.current.startingStacks[id] ?? 0) + old.chipsPerBuyin } } : null }));
    notice(playerName(game, id) + " rebought " + fmt(game.chipsPerBuyin) + " chips.");
  }
  function sealCards() {
    if (!current || !vaultPlayer || !holeCards[0] || !holeCards[1]) return notice("Choose a player and both cards.");
    const used = [...current.board, ...Object.entries(current.privateCards).filter(([id]) => id !== vaultPlayer).flatMap(([, cards]) => cards)];
    if (holeCards[0] === holeCards[1] || holeCards.some(c => used.includes(c))) return notice("A card is already used in this hand.");
    setGame(old => ({ ...old, current: old.current ? { ...old.current, privateCards: { ...old.current.privateCards, [vaultPlayer]: holeCards } } : null }));
    setHoleCards(["", ""]); setVaultOpen(false); notice("Cards sealed until the player reveals them.");
  }
  function reveal(handId: string, id: string) { setGame(old => ({ ...old, history: old.history.map(h => h.id === handId ? { ...h, revealed: [...new Set([...h.revealed, id])] } : h) })); }
  function closeNight() {
    if (pot) return notice("Award the current pot before closing.");
    if (!balanced) return notice("Money Trail found a mismatch. Check the chip count.");
    setGame(old => ({ ...old, closed: true, current: null })); setView("results");
  }
  function newNight() {
    if (!window.confirm("Start a new night? This clears the saved game on this device.")) return;
    setNames(game.players.map(p => p.name)); setGame(emptyGame); setView("table"); setTimerRunning(false);
  }
  useEffect(() => {
    const context = (document as ToolDocument).modelContext;
    if (!context?.registerTool || !loaded) return;
    const lifecycle = new AbortController();
    const tools: BrowserTool[] = [
      {
        name: "read_poker_table", title: "Read poker table",
        description: "Read the current hand, betting round, pot, and player chip stacks.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: () => ({ started: game.started, closed: game.closed, hand: current?.number ?? null, round: current?.round ?? null, pot, players: game.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, folded: folded.includes(p.id) })) }),
      },
      {
        name: "record_poker_bet", title: "Record poker bet",
        description: "Move a whole-chip bet from one player’s stack into the current pot.",
        inputSchema: { type: "object", properties: { playerId: { type: "string" }, amount: { type: "integer", minimum: 1 } }, required: ["playerId", "amount"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: input => {
          const data = input as { playerId?: unknown; amount?: unknown };
          const player = game.players.find(p => p.id === data?.playerId);
          if (!current || !player) throw new Error("Choose a player in an active hand.");
          if (typeof data.amount !== "number" || !Number.isInteger(data.amount) || data.amount <= 0 || data.amount > player.chips || folded.includes(player.id)) throw new Error("Invalid bet or player cannot bet.");
          flushSync(() => addBet(data.amount as number, player.id));
          return { recorded: true, playerId: player.id, amount: data.amount, pot: pot + (data.amount as number) };
        },
      },
    ];
    for (const tool of tools) {
      try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {}
    }
    return () => lifecycle.abort();
  });

  if (!loaded) return <main className="loading">Loading your table…</main>;
  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Spade size={19} fill="currentColor" /></span><span>POKER <strong>NIGHT</strong></span></div><div className="header-right"><span className="saved-pill"><Check size={14} /> Saved on this device</span>{game.started && <span className="night-pill">{game.closed ? "Night closed" : "Hand " + (current?.number ?? game.history.length) + " · Live"}</span>}</div></header>
    {message && <div className="toast" role="status">{message}<button aria-label="Dismiss" onClick={() => setMessage("")}><X size={16} /></button></div>}
    {!game.started ? <section className="setup-wrap"><div className="setup-heading"><span className="eyebrow">GAME SETUP</span><h1>Get your table ready.</h1><p>Add your players, check the buy-in, and start dealing.</p></div><div className="setup-grid"><div className="panel setup-players"><div className="panel-title-row"><div><h2>Players</h2><p>Everyone starts with one buy-in.</p></div><span className="count-pill">{names.filter(n => n.trim()).length} seated</span></div><div className="name-list">{names.map((name, i) => <div className="name-row" key={i}><span className="seat-num">{String(i + 1).padStart(2, "0")}</span><input aria-label={"Player " + (i + 1) + " name"} value={name} placeholder="Player name" maxLength={24} onChange={e => setNames(old => old.map((x, j) => j === i ? e.target.value : x))} /><button className="icon-button" aria-label={"Remove player " + (i + 1)} onClick={() => setNames(old => old.filter((_, j) => j !== i))}><X size={17} /></button></div>)}</div><button className="link-button" onClick={() => setNames(old => [...old, ""])}><Plus size={17} /> Add player</button></div><div className="setup-side"><div className="panel"><h2>Buy-in & chips</h2><div className="field-pair"><label>Buy-in per player <input type="number" min="0.01" step="0.01" value={game.buyinCash} onChange={e => setGame(old => ({ ...old, buyinCash: Number(e.target.value) }))} /></label><label>Starting chips<input type="number" min="1" step="1" value={game.chipsPerBuyin} onChange={e => setGame(old => ({ ...old, chipsPerBuyin: Number(e.target.value) }))} /></label></div><p className="setup-note">A rebuy adds the same chips for the same price.</p></div><div className="panel"><h2>Table rules</h2><div className="field-pair"><label>Small blind<input type="number" min="0" step="1" value={game.smallBlind} onChange={e => setGame(old => ({ ...old, smallBlind: Number(e.target.value) }))} /></label><label>Big blind<input type="number" min="0" step="1" value={game.bigBlind} onChange={e => setGame(old => ({ ...old, bigBlind: Number(e.target.value) }))} /></label></div><label className="timer-field">Player timer<select value={game.timerSeconds} onChange={e => setGame(old => ({ ...old, timerSeconds: Number(e.target.value) }))}><option value="0">Off</option><option value="30">30 seconds</option><option value="60">60 seconds</option><option value="90">90 seconds</option></select></label></div><button className="primary start-button" onClick={startGame}>Start poker night <ArrowRight size={19} /></button></div></div></section> :
    <div className="content-wrap"><div className="page-head"><div><span className="eyebrow">{game.closed ? "GOOD GAME" : "LIVE TABLE"}</span><h1>{game.closed ? "That’s a wrap." : "Poker night"} <span className="head-suit">♠</span></h1></div><div className="head-stats"><div><span>Cash in</span><strong>{money(cashIn)}</strong></div><div><span>Hands played</span><strong>{game.history.length}</strong></div></div></div>
    <Tabs value={view} onValueChange={v => setView(v as View)} className="main-tabs"><TabsList className="main-tab-list"><TabsTrigger value="table"><Spade size={17} /> Table</TabsTrigger><TabsTrigger value="replay"><History size={17} /> Night replay</TabsTrigger><TabsTrigger value="results"><Coins size={17} /> Results</TabsTrigger></TabsList>
    <TabsContent value="table"><div className="table-grid"><div className="table-main">{current ? <><div className="round-bar"><div><span className="eyebrow">HAND {String(current.number).padStart(2, "0")}</span><h2>{current.round}</h2></div><div className="round-steps">{rounds.map((r, i) => <span key={r} className={i <= rounds.indexOf(current.round) ? "active" : ""}>{r}</span>)}</div></div><div className="felt"><div className="felt-inner"><span className="felt-label">CURRENT POT</span><div className="pot-value"><Coins size={29} /> {fmt(pot)}</div><div className="board-cards">{current.board.map((c, i) => <Card key={i} value={c} />)}</div><div className="felt-caption">Blinds {fmt(game.smallBlind)} / {fmt(game.bigBlind)}</div></div></div><div className="player-grid">{game.players.map((p, i) => <button key={p.id} className={"player-tile " + (betPlayer === p.id ? "selected " : "") + (folded.includes(p.id) ? "folded" : "")} onClick={() => setBetPlayer(p.id)}><span className="avatar" style={{ background: ["#b7d4c0", "#e4c184", "#b6b9dd", "#d7a6a4", "#b5d3da", "#c8b6d4"][i % 6] }}>{p.name[0].toUpperCase()}</span><span className="player-info"><strong>{p.name}</strong><span>{folded.includes(p.id) ? "Folded" : fmt(p.chips) + " chips"}</span></span>{betPlayer === p.id && <Check size={16} />}</button>)}</div></> : <div className="between-hands panel"><span className="between-icon"><Trophy size={28} /></span><span className="eyebrow">HAND {game.history.length} COMPLETE</span><h2>{game.closed ? "Night closed" : playerName(game, game.history.at(-1)?.winnerId ?? "") + " takes the pot."}</h2><p>All bets and cards were saved to Night Replay.</p>{!game.closed && <button className="primary" onClick={nextHand}>Deal next hand <ArrowRight size={18} /></button>}</div>}<div className="story-strip"><span>✦</span>{story}</div></div>
    <aside className="control-column">{current ? <><div className="panel control-panel"><span className="eyebrow">TABLE ACTIONS</span><h2>Record a bet</h2><label className="input-label">Player<select value={betPlayer} onChange={e => setBetPlayer(e.target.value)}>{game.players.map(p => <option key={p.id} value={p.id}>{p.name} · {fmt(p.chips)} chips</option>)}</select></label><label className="input-label">Chips bet<input type="number" min="1" step="1" placeholder="Enter amount" value={betAmount} onChange={e => setBetAmount(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addBet(Number(betAmount)); }} /></label><div className="quick-bets">{[25, 50, 100].map(n => <button key={n} onClick={() => setBetAmount(String(n))}>+{n}</button>)}<button onClick={() => setBetAmount(String(game.players.find(p => p.id === betPlayer)?.chips ?? 0))}>All in</button></div><button className="primary full" onClick={() => addBet(Number(betAmount))}>Add bet <Plus size={18} /></button><button className="ghost full" onClick={() => fold(betPlayer)}>Mark {playerName(game, betPlayer)} folded</button></div><div className="panel"><span className="eyebrow">BOARD CARDS</span><h2>{current.round}</h2>{current.round === "Pre-flop" ? <p className="quiet">No community cards yet.</p> : <div className="card-inputs">{[0, 1, 2].map(i => <CardSelect key={i} label={"Flop " + (i + 1)} value={current.board[i]} onChange={c => setBoard(i, c)} />)}{rounds.indexOf(current.round) >= 2 && <CardSelect label="Turn" value={current.board[3]} onChange={c => setBoard(3, c)} />}{current.round === "River" && <CardSelect label="River" value={current.board[4]} onChange={c => setBoard(4, c)} />}</div>}<button className="secondary full" disabled={current.round === "River"} onClick={advance}>{current.round === "River" ? "River is final round" : "Move to " + rounds[rounds.indexOf(current.round) + 1]} <ChevronRight size={17} /></button></div><div className="panel"><span className="eyebrow">SHOWDOWN</span><h2>Award the pot</h2><p className="quiet">Choose the winner after the hand.</p><div className="winner-list">{game.players.filter(p => !folded.includes(p.id)).map(p => <button key={p.id} disabled={!pot} onClick={() => award(p.id)}><Trophy size={16} /> {p.name}<span>{fmt(pot)} <ArrowRight size={14} /></span></button>)}</div></div></> : <div className="panel"><span className="eyebrow">NEXT UP</span><h2>{game.closed ? "Final results are ready" : "Ready for another hand?"}</h2><p className="quiet">{game.closed ? "Check Results for final payouts." : "Record rebuys now, then deal the next hand."}</p>{!game.closed && <button className="primary full" onClick={nextHand}>Deal next hand <ArrowRight size={17} /></button>}</div>}
    <div className="panel extra-panel"><span className="eyebrow">NIGHT TOOLS</span><button onClick={() => { setVaultPlayer(betPlayer || game.players[0]?.id || ""); setVaultOpen(true); }} disabled={!current}><LockKeyhole size={18} /> Bluff Vault <ChevronRight size={16} /></button><div className="rebuy-label">Rebuy · {money(game.buyinCash)} for {fmt(game.chipsPerBuyin)} chips</div><div className="rebuy-buttons">{game.players.map(p => <button key={p.id} disabled={game.closed || !!current?.bets.length} onClick={() => rebuy(p.id)}>+ {p.name}</button>)}</div>{game.timerSeconds > 0 && <div className="timer-control"><Clock3 size={17} /><span>{Math.floor(timerLeft / 60)}:{String(timerLeft % 60).padStart(2, "0")}</span><button onClick={() => setTimerRunning(x => !x)}>{timerRunning ? "Pause" : "Start"}</button><button aria-label="Reset timer" onClick={() => { setTimerLeft(game.timerSeconds); setTimerRunning(false); }}><RotateCcw size={15} /></button></div>}</div></aside></div></TabsContent>
    <TabsContent value="replay"><div className="replay-grid"><div className="panel hand-list"><div className="panel-title-row"><div><span className="eyebrow">THE NIGHT SO FAR</span><h2>Every hand</h2></div><span className="count-pill">{game.history.length}</span></div>{game.history.length ? [...game.history].reverse().map(h => <button key={h.id} className={"hand-list-item " + (shownHand?.id === h.id ? "active" : "")} onClick={() => { setSelectedHand(h.id); setReplayRound(h.round); }}><span className="hand-index">{String(h.number).padStart(2, "0")}</span><span><strong>Hand {h.number}</strong><small>{playerName(game, h.winnerId ?? "")} won</small></span><b>{fmt(potOf(h))}</b><ChevronRight size={16} /></button>) : <p className="quiet empty-copy">Finish a hand to see its replay.</p>}</div><div className="panel replay-detail">{shownHand ? <><div className="panel-title-row"><div><span className="eyebrow">NIGHT REPLAY</span><h2>Hand {shownHand.number}</h2></div>{potOf(shownHand) === biggestPot && <span className="gold-badge">Biggest pot</span>}</div><div className="replay-winner"><Trophy size={20} /><span><strong>{playerName(game, shownHand.winnerId ?? "")} won</strong><small>{fmt(potOf(shownHand))} chips awarded</small></span></div><div className="replay-rounds">{rounds.map(r => <button key={r} className={replayRound === r ? "active" : ""} onClick={() => setReplayRound(r)}>{r}</button>)}</div><div className="replay-board"><span className="eyebrow">CARDS ON TABLE</span><div className="board-cards">{shownHand.board.map((c, i) => <Card key={i} value={i < (replayRound === "Pre-flop" ? 0 : replayRound === "Flop" ? 3 : replayRound === "Turn" ? 4 : 5) ? c : ""} small />)}</div></div><div className="replay-stats"><div><span>Pot at {replayRound}</span><strong>{fmt(potAt(shownHand, replayRound))}</strong></div><div><span>Bets this round</span><strong>{shownHand.bets.filter(b => b.round === replayRound && b.kind === "bet").length}</strong></div></div><h3>Pot X-ray</h3><div className="xray-list">{rounds.slice(0, rounds.indexOf(replayRound) + 1).map(r => <div className="xray-round" key={r}><span>{r}</span><div>{shownHand.bets.filter(b => b.round === r).length ? shownHand.bets.filter(b => b.round === r).map(b => <p key={b.id}>{playerName(game, b.playerId)} {b.kind === "fold" ? "folded" : <strong>+{fmt(b.amount)}</strong>}</p>) : <p className="quiet">No bets</p>}</div></div>)}</div><h3>Stacks after {replayRound}</h3><div className="stack-grid">{game.players.map(p => <div key={p.id}><span>{p.name}</span><strong>{fmt(chipsAt(shownHand, p.id, replayRound))}</strong></div>)}</div><h3>Bluff Vault <LockKeyhole size={16} /></h3><div className="vault-list">{Object.entries(shownHand.privateCards).length ? Object.entries(shownHand.privateCards).map(([id, cards]) => <div key={id}><span>{playerName(game, id)}</span>{shownHand.revealed.includes(id) ? <span className="revealed-cards">{cards.map((c, i) => <Card key={i} value={c} small />)}</span> : <button onClick={() => reveal(shownHand.id, id)}><Eye size={15} /> Player reveal</button>}</div>) : <p className="quiet">No private cards saved for this hand.</p>}</div></> : <div className="empty-replay"><History size={36} /><h2>No hands yet</h2><p>Play a hand to start your night replay.</p></div>}</div></div></TabsContent>
    <TabsContent value="results"><div className="results-grid"><div className="panel results-main"><div className="panel-title-row"><div><span className="eyebrow">FINAL LEDGER</span><h2>Player results</h2></div><span className="count-pill">{game.players.length} players</span></div><div className="results-table-wrap"><table className="results-table"><thead><tr><th>Player</th><th>Paid in</th><th>Chips held</th><th>Chip change</th><th>Receive now</th></tr></thead><tbody>{game.players.map(p => { const change = p.chips - p.buyins * game.chipsPerBuyin; return <tr key={p.id}><td><strong>{p.name}</strong><small>{p.buyins} buy-in{p.buyins === 1 ? "" : "s"}</small></td><td>{money(p.paid)}</td><td>{fmt(p.chips)}</td><td className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "+" : ""}{fmt(change)}</td><td className="receive">{money(payoutMap[p.id] ?? 0)}</td></tr>; })}</tbody></table></div><div className="results-foot"><span>Average paid per player <strong>{money(cashIn / game.players.length)}</strong></span><span>Average bet per hand <strong>{game.history.length ? fmt(Math.round(betTotal / game.history.length)) : "0"} chips</strong></span></div></div><div className="results-side"><div className={"panel trail-panel " + (balanced || pot ? "balanced" : "unbalanced")}><div className="trail-icon"><ShieldCheck size={22} /></div><span className="eyebrow">MONEY TRAIL</span><h2>{pot ? "Pot still in play." : balanced ? "Everything balances." : "Check the chip count."}</h2><div className="trail-line"><span>Cash collected</span><strong>{money(cashIn)}</strong></div><div className="trail-line"><span>Cash owed back now</span><strong>{money(cashOut)}</strong></div><div className="trail-line"><span>{pot ? "Value in current pot" : "Cash difference"}</span><strong>{money(cashIn - cashOut)}</strong></div><div className="trail-line"><span>Chips accounted for</span><strong>{fmt(liveChips)} / {fmt(issued)}</strong></div></div><div className="panel"><span className="eyebrow">GROUP RESULT</span><h2>{game.history.length} hands played</h2><p className="quiet">Total bets recorded: {fmt(betTotal)} chips. Player gains and losses add up to zero.</p>{!game.closed ? <button className="primary full" onClick={closeNight}>Close poker night <Check size={17} /></button> : <button className="secondary full" onClick={newNight}>Start a new night <ArrowRight size={17} /></button>}</div></div></div></TabsContent>
    </Tabs></div>}
    <Dialog open={vaultOpen} onOpenChange={setVaultOpen}><DialogContent className="vault-dialog"><DialogHeader><DialogTitle>Bluff Vault</DialogTitle><DialogDescription>Pass this device to the player to enter their cards. The cards stay hidden on the table and are saved on this device.</DialogDescription></DialogHeader><label className="input-label">Player<select value={vaultPlayer} onChange={e => { setVaultPlayer(e.target.value); setHoleCards(["", ""]); }}>{game.players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><div className="private-card-inputs"><CardSelect label="First card" value={holeCards[0]} onChange={c => setHoleCards([c, holeCards[1]])} /><CardSelect label="Second card" value={holeCards[1]} onChange={c => setHoleCards([holeCards[0], c])} /></div><button className="primary full" onClick={sealCards}><LockKeyhole size={17} /> Seal cards</button></DialogContent></Dialog>
  </main>;
}
