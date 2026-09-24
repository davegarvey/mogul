# Mogul

A board game for 2–4 players about the Hollywood studio system of the 1920s–1950s. It is built on the economic skeleton of *Power Grid*: you bid for film properties, contract talent to make pictures, build a network of theatres, and earn box office for every theatre you can light on opening night. Money is the only resource.

It runs in the browser. Friends join a room by code, and any empty seat can be filled by a computer player.

## Running it locally

You need [Node.js](https://nodejs.org/) 20 or newer and Git.

```bash
git clone https://github.com/davegarvey/mogul.git
cd mogul
npm install
npm run dev
```

Then open <http://localhost:8137>.

`npm run dev` bundles the browser client and starts the game server on port 8137. To use a different port, set `PORT`, for example `PORT=9000 npm run dev`.

## Setting up a game

1. Enter a nickname and click **Create room**. You become the host, and the room shows a short code (for example `SCJZ8`).
2. Other people join by entering their nickname and that code, then clicking **Join room**.
3. The host can click **Add bot** to fill empty seats.
4. When there are 2–4 seats, the host clicks **Start game**.

**Do you need bots?** A game needs at least two seats. On your own, add one to three bots. With two or more people, bots are optional: they fill out the table, and the game suits three or four players best.

There is no turn timer, so take as long as you like. If someone disconnects, they have 30 seconds to rejoin before a bot takes over their seat.

### Playing with a friend on another computer

Everyone connects to one running server, so only one of you needs to run `npm run dev`.

- **Same network:** the other player opens `http://<host's local IP>:8137` (for example `http://192.168.1.20:8137`). On a Mac, you can find the IP with `ipconfig getifaddr en0`. Your firewall may ask whether to allow incoming connections to Node.
- **Different networks:** expose port 8137 through a tunnelling service such as [ngrok](https://ngrok.com/) or Cloudflare Tunnel, and share the URL it gives you. The client picks up the address automatically and uses `wss://` over HTTPS.

## How to play

A game lasts about 12–15 rounds. Each round has five phases, and the screen shows the current phase, era, round and whose turn it is. When it is your turn, your legal moves appear as buttons at the bottom of the screen. Scroll down to see every studio's money and holdings, the two markets, and a log of what has happened.

1. **Turn order.** The player with the most theatres goes first in the auction. In the talent and building phases the order reverses, so players who are behind buy and build first.
2. **Rights auction.** In turn order, each player may put a property from the current market up for auction or pass. The others then bid or drop out. Each property has an *output* (the most theatres it can supply per round) and a *talent type* it needs. You can win at most one property per round, and in the first round every player must buy one.
3. **Talent market.** Contract talent for your properties: extras, character actors, stars or A-listers. Each theatre you light uses one unit of the matching talent. Prices rise as the supply shrinks and fall back as the market restocks, so buying first matters. A property can hold up to twice the talent it needs for one opening night.
4. **Exhibition.** Build theatres in cities: $10 for the first slot, $15 for the second and $20 for the third, plus the distribution cost of each route between your network and the new city. Your first theatre can go anywhere. You may have only one theatre in each city. The map highlights the cities you can build in now.
5. **Opening night.** Each studio lights as many theatres as its properties and talent can supply, and is paid according to that number (0 → $10, 1 → $22, 2 → $33, … up to 20 → $150). Talent is used up.

### The three eras

- **Silent.** Only one studio can build in each city.
- **Talkies.** Starts once any studio has built its 7th theatre. A second slot opens in each city from the next round, and the cheapest property in the market is shelved.
- **Golden age.** Starts when the era card is drawn from the property deck. A third slot opens in each city, and the market shrinks to six properties, all open for bidding.

### Winning

The game ends straight after the exhibition phase of the round in which any studio reaches the target number of theatres (14 with two players, 16 with three, 17 with four). That round has no final opening night. The winner is the studio that could light the most theatres. Ties go to the studio with the most money, then to the one with the most theatres built.

### Tips

- A big property is useless without the talent to run it and the theatres to show it in. Keep enough cash to build.
- Talent is cheapest when you buy early in the phase, and trailing players buy first.
- Building your 7th theatre starts the talkies era for everyone, so time it.

## Other ways to play

### LLM agent player

An AI player powered by a language model can join a room from the command line. It works with any OpenAI-compatible API endpoint:

```bash
MOGUL_LLM_API_KEY=sk-... npx tsx packages/agent-cli/src/index.ts <ROOM_CODE> [NICKNAME]
```

Optional environment variables: `MOGUL_LLM_MODEL` (default `gpt-4o-mini`), `MOGUL_LLM_BASE_URL`, `MOGUL_SERVER_URL` (default `ws://localhost:8137`) and `MOGUL_MAX_RETRIES`.

### Bot-versus-bot tournament

```bash
npm run harness
```

This plays 20 games between scripted bots and reports win rates, game length and final cash. It is useful for testing changes to the rules.

## For developers

```bash
npm test            # run all tests
npm run typecheck   # type-check every package
```

| Package | Purpose |
|---|---|
| `packages/engine` | Pure, deterministic rules engine. Rules data lives in `src/data/*.json`. |
| `packages/protocol` | Wire types shared by the server and clients |
| `packages/server` | HTTP and WebSocket server, lobby and rooms |
| `packages/client` | Browser client |
| `packages/bot` | Scripted and naive bots, tournament harness |
| `packages/agent-cli` | LLM agent client |

Rules are stored as data. To change prices, the income table, the property deck, the map or the endgame targets, edit the JSON files in `packages/engine/src/data/` and run the harness. Design documents and specs are in `openspec/`.

## Known limitations

- The scripted bots tend to overspend in the first round, so they are weak early on.
- In small windows, the map fills the screen and the market and player panels sit below it, so you have to scroll.
