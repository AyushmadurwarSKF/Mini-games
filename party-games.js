(function () {
  const settings = {
    rps: { title: "Rock, Paper, Scissors", category: "Quick · Best of five", subtitle: "Choose your throw. Reveal together.", labels: ["Player 1", "Player 2"] },
    nim: { title: "Last One", category: "Tactics · Take 1, 2, or 3", subtitle: "Take the last stone to win.", labels: ["Player 1", "Player 2"] },
    memory: { title: "Match Up", category: "Memory · Find the pairs", subtitle: "Find a pair to keep your turn.", labels: ["Player 1", "Player 2"] },
    dots: { title: "Dots & Boxes", category: "Territory · Claim the most", subtitle: "Close a box to score and go again.", labels: ["Player 1", "Player 2"] }
  };
  const game = new URLSearchParams(location.search).get("game");
  const config = settings[game];

  if (!config) {
    location.replace("index.html");
    return;
  }

  document.title = `${config.title} - Playside Arcade`;
  document.querySelector("#game-title").textContent = config.title;
  document.querySelector("#game-category").textContent = config.category;
  document.querySelector("#game-subtitle").textContent = config.subtitle;

  const stage = document.querySelector("#game-stage");
  const status = document.querySelector("#status");
  const scoreboard = document.querySelector("#scoreboard");
  const connectionStatus = document.querySelector("#connection-status");
  const inviteButton = document.querySelector("#invite-friend");
  const copyButton = document.querySelector("#copy-invite");
  const inviteUrl = document.querySelector("#invite-url");
  let hideTimer = null;
  let movePending = false;

  function shuffledDeck() {
    const deck = ["🍋", "🍋", "🍓", "🍓", "🐸", "🐸", "🌙", "🌙", "🎈", "🎈", "🍄", "🍄", "🦋", "🦋", "⭐", "⭐"];
    for (let index = deck.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [deck[index], deck[swap]] = [deck[swap], deck[index]];
    }
    return deck;
  }

  function freshState(keepScores = false) {
    const wins = keepScores && state ? { ...state.wins } : { X: 0, O: 0 };
    if (game === "rps") return { wins, round: 1, choices: {}, resolved: null, winner: "" };
    if (game === "nim") return { wins, stones: 21, turn: keepScores && state ? other(state.turn) : "X", winner: "" };
    if (game === "memory") return { wins, deck: shuffledDeck(), turn: keepScores && state ? other(state.turn) : "X", revealed: [], matched: [], waiting: false, winner: "" };
    return { wins, horizontal: Array(20).fill(""), vertical: Array(20).fill(""), boxes: Array(16).fill(""), turn: keepScores && state ? other(state.turn) : "X", winner: "" };
  }

  function other(player) { return player === "X" ? "O" : "X"; }
  let state = freshState();

  function playerLabel(player) { return player === "X" ? config.labels[0] : config.labels[1]; }

  function renderScores() {
    scoreboard.innerHTML = ["X", "O"].map((player) => `
      <div class="score score-${player.toLowerCase()}">
        <span class="score-name">${config.labels[player === "X" ? 0 : 1]}</span>
        <span class="score-value">${state.wins[player]}</span>
      </div>`).join("");
  }

  function setStatus(message, player = "") {
    const mark = player ? `<span class="turn-mark ${player.toLowerCase()}">●</span>` : "";
    status.innerHTML = `${mark}<span>${message}</span>`;
  }

  function isMyTurn() {
    return !online.online || online.role === state.turn;
  }

  function renderRps() {
    const choices = [
      ["rock", "✊"],
      ["paper", "✋"],
      ["scissors", "✌️"]
    ];
    const currentChoicePlayer = online.online ? online.role : (state.choices.X ? "O" : "X");
    const hasChosen = Boolean(state.choices[currentChoicePlayer]) || movePending;
    const reveal = state.resolved
      ? `<p class="game-note">${playerLabel("X")} ${choices.find(([name]) => name === state.resolved.X)[1]} &nbsp;·&nbsp; ${playerLabel("O")} ${choices.find(([name]) => name === state.resolved.O)[1]}</p>`
      : "";
    const cards = choices.map(([name, symbol]) => `
      <button class="choice-button" type="button" data-choice="${name}" ${state.winner || state.resolved || hasChosen ? "disabled" : ""}>
        <span class="choice-symbol" aria-hidden="true">${symbol}</span><span>${name}</span>
      </button>`).join("");
    const replay = state.resolved
      ? `<div class="actions"><button class="action" type="button" data-rps-next>${state.winner ? "New match" : "Next round"}</button></div>`
      : "";
    stage.innerHTML = `<div class="choice-row">${cards}</div>${reveal}${replay}`;

    if (state.winner) setStatus(`${playerLabel(state.winner)} wins the match!`, state.winner);
    else if (state.resolved?.winner === "tie") setStatus("Tie round. Throw again.");
    else if (state.resolved) setStatus(`${playerLabel(state.resolved.winner)} takes the round!`, state.resolved.winner);
    else if (online.online && state.choices[online.role]) setStatus("Choice locked · waiting for your friend", online.role);
    else if (online.online) setStatus("Your turn to choose", online.role);
    else setStatus(`Choose a throw · ${playerLabel(currentChoicePlayer)}`, currentChoicePlayer);

    stage.querySelectorAll("[data-choice]").forEach((button) => {
      button.addEventListener("click", () => chooseRps(button.dataset.choice));
    });
    stage.querySelector("[data-rps-next]")?.addEventListener("click", () => requestAction("next-rps"));
  }

  function chooseRps(choice) {
    if (state.winner || state.resolved || movePending) return;
    const player = online.online ? online.role : (state.choices.X ? "O" : "X");
    if (online.online && player === "O") {
      movePending = true;
      online.send({ type: "move", value: choice });
      render();
      return;
    }
    applyMove(choice, player);
  }

  function applyRpsChoice(choice, player) {
    if (!["rock", "paper", "scissors"].includes(choice) || state.choices[player] || state.resolved || state.winner) return;
    state.choices[player] = choice;
    if (state.choices.X && state.choices.O) {
      const x = state.choices.X;
      const o = state.choices.O;
      let winner = "tie";
      if (x !== o) {
        const xWins = (x === "rock" && o === "scissors") || (x === "paper" && o === "rock") || (x === "scissors" && o === "paper");
        winner = xWins ? "X" : "O";
        state.wins[winner] += 1;
        if (state.wins[winner] === 3) state.winner = winner;
      }
      state.resolved = { X: x, O: o, winner };
    }
    publish();
  }

  function renderNim() {
    stage.innerHTML = `
      <p class="game-note">${state.stones} ${state.stones === 1 ? "stone" : "stones"} remain</p>
      <div class="pile" aria-label="${state.stones} stones">${Array.from({ length: state.stones }, () => '<span class="stone" aria-hidden="true"></span>').join("")}</div>
      <div class="take-row">${[1, 2, 3].map((count) => `<button class="action ${count === 2 ? "secondary" : ""}" data-take="${count}" type="button" ${state.winner || !isMyTurn() || count > state.stones || movePending ? "disabled" : ""}>Take ${count}</button>`).join("")}</div>`;
    setStatus(state.winner ? `${playerLabel(state.winner)} takes the last stone!` : `${playerLabel(state.turn)} to play`, state.winner || state.turn);
    stage.querySelectorAll("[data-take]").forEach((button) => button.addEventListener("click", () => requestMove(Number(button.dataset.take))));
  }

  function applyNimMove(count, player) {
    if (!Number.isInteger(count) || count < 1 || count > 3 || count > state.stones || state.winner || state.turn !== player) return;
    state.stones -= count;
    if (state.stones === 0) {
      state.winner = player;
      state.wins[player] += 1;
    } else {
      state.turn = other(player);
    }
    publish();
  }

  function renderMemory() {
    const canFlip = !state.winner && !state.waiting && isMyTurn() && !movePending;
    stage.innerHTML = `
      <div class="memory-grid" aria-label="Memory cards">
        ${state.deck.map((symbol, index) => {
          const visible = state.revealed.includes(index) || state.matched.includes(index);
          const matched = state.matched.includes(index);
          return `<button class="memory-card${visible ? " revealed" : ""}${matched ? " matched" : ""}" type="button" data-card="${index}" aria-label="Card ${index + 1}${visible ? `, ${symbol}` : ", face down"}" ${!canFlip || visible ? "disabled" : ""}>${visible ? symbol : "?"}</button>`;
        }).join("")}
      </div>
      <p class="game-note">Pairs found: ${state.matched.length / 2} of 8</p>`;
    setStatus(state.winner ? `${playerLabel(state.winner)} wins the memory match!` : state.waiting ? "Remember these two..." : `${playerLabel(state.turn)} flips`, state.winner || state.turn);
    stage.querySelectorAll("[data-card]").forEach((button) => button.addEventListener("click", () => requestMove(Number(button.dataset.card))));
  }

  function applyMemoryFlip(index, player) {
    if (!Number.isInteger(index) || index < 0 || index >= state.deck.length || state.winner || state.waiting || state.turn !== player || state.revealed.includes(index) || state.matched.includes(index)) return;
    state.revealed.push(index);
    if (state.revealed.length === 2) {
      const [first, second] = state.revealed;
      if (state.deck[first] === state.deck[second]) {
        state.matched.push(first, second);
        state.revealed = [];
        state.wins[player] += 1;
        if (state.matched.length === state.deck.length) {
          state.winner = state.wins.X === state.wins.O ? "draw" : state.wins.X > state.wins.O ? "X" : "O";
        }
      } else {
        state.waiting = true;
        publish();
        hideTimer = setTimeout(() => {
          state.revealed = [];
          state.waiting = false;
          state.turn = other(player);
          hideTimer = null;
          publish();
        }, 1050);
        return;
      }
    }
    publish();
  }

  function edgeOwner(edge) {
    return edge < 20 ? state.horizontal[edge] : state.vertical[edge - 20];
  }

  function setEdge(edge, player) {
    if (edge < 20) state.horizontal[edge] = player;
    else state.vertical[edge - 20] = player;
  }

  function completedBoxEdges(row, column) {
    return [row * 4 + column, (row + 1) * 4 + column, 20 + row * 5 + column, 20 + row * 5 + column + 1];
  }

  function renderDots() {
    const cells = [];
    for (let row = 0; row < 9; row += 1) {
      for (let column = 0; column < 9; column += 1) {
        if (row % 2 === 0 && column % 2 === 0) {
          cells.push('<span class="dot" aria-hidden="true"></span>');
        } else if (row % 2 === 1 && column % 2 === 1) {
          const owner = state.boxes[(Math.floor(row / 2) * 4) + Math.floor(column / 2)];
          cells.push(`<span class="box${owner ? ` ${owner.toLowerCase()}` : ""}"></span>`);
        } else {
          const horizontal = row % 2 === 0;
          const edge = horizontal
            ? (row / 2) * 4 + Math.floor(column / 2)
            : 20 + Math.floor(row / 2) * 5 + column / 2;
          const owner = edgeOwner(edge);
          const vertical = !horizontal;
          const ownTurn = isMyTurn();
          cells.push(`<button class="edge ${horizontal ? "h" : "v"}${owner ? ` ${owner.toLowerCase()}` : ""}" type="button" aria-label="${horizontal ? "Horizontal" : "Vertical"} line, ${owner ? "taken" : "open"}" data-edge="${edge}" ${owner || state.winner || !ownTurn || movePending ? "disabled" : ""}></button>`);
        }
      }
    }
    stage.innerHTML = `<div class="dots-board" aria-label="Dots and boxes board">${cells.join("")}</div>`;
    const filled = state.boxes.filter(Boolean).length;
    const message = state.winner === "draw" ? "The board is even!" : state.winner ? `${playerLabel(state.winner)} wins the board!` : `${playerLabel(state.turn)} to draw`;
    setStatus(message, state.winner === "draw" ? "" : state.winner || state.turn);
    stage.querySelectorAll("[data-edge]").forEach((button) => button.addEventListener("click", () => requestMove(Number(button.dataset.edge))));
    stage.setAttribute("aria-label", `${filled} of 16 boxes claimed`);
  }

  function applyDotsMove(edge, player) {
    if (!Number.isInteger(edge) || edge < 0 || edge >= 40 || edgeOwner(edge) || state.winner || state.turn !== player) return;
    setEdge(edge, player);
    let boxesClaimed = 0;
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        const boxIndex = row * 4 + column;
        if (!state.boxes[boxIndex] && completedBoxEdges(row, column).every((boxEdge) => edgeOwner(boxEdge))) {
          state.boxes[boxIndex] = player;
          boxesClaimed += 1;
        }
      }
    }
    state.wins[player] += boxesClaimed;
    if (state.boxes.every(Boolean)) {
      state.winner = state.wins.X === state.wins.O ? "draw" : state.wins.X > state.wins.O ? "X" : "O";
    } else if (boxesClaimed === 0) {
      state.turn = other(player);
    }
    publish();
  }

  function applyMove(value, player) {
    if (game === "rps") applyRpsChoice(value, player);
    if (game === "nim") applyNimMove(value, player);
    if (game === "memory") applyMemoryFlip(value, player);
    if (game === "dots") applyDotsMove(value, player);
  }

  function requestMove(value) {
    if (movePending) return;
    if (online.online && online.role === "O") {
      movePending = true;
      online.send({ type: "move", value });
      render();
      return;
    }
    if (game === "rps") {
      const player = online.online ? "X" : (state.choices.X ? "O" : "X");
      applyMove(value, player);
    } else {
      applyMove(value, state.turn);
    }
  }

  function beginRound(resetScores) {
    clearTimeout(hideTimer);
    hideTimer = null;
    movePending = false;
    if (game === "rps") {
      state = freshState(!resetScores);
    } else if (game === "nim") {
      state = freshState(!resetScores);
    } else if (game === "memory") {
      state = freshState(!resetScores);
    } else {
      state = freshState(!resetScores);
    }
    publish();
  }

  function nextRpsRound() {
    movePending = false;
    if (state.winner) {
      state = freshState(true);
      state.wins = { X: 0, O: 0 };
    } else {
      state.round += 1;
      state.choices = {};
      state.resolved = null;
    }
    publish();
  }

  function executeAction(action) {
    if (action === "next-rps" && game === "rps") nextRpsRound();
    else if (action === "new-round") beginRound(false);
    else if (action === "reset-score") beginRound(true);
  }

  function requestAction(action) {
    if (online.online && online.role === "O") {
      online.send({ type: "action", action });
      return;
    }
    executeAction(action);
  }

  function publish() {
    render();
    if (online && online.online && online.role === "X") {
      online.send({ type: "state", game, state });
    }
  }

  function receive(message) {
    if (!message || typeof message !== "object") return;
    if (online.role === "X") {
      if (message.type === "join") {
        online.send({ type: "state", game, state });
      } else if (message.type === "move") {
        movePending = false;
        applyMove(message.value, "O");
      } else if (message.type === "action") {
        executeAction(message.action);
      }
      return;
    }
    if (message.type === "state" && message.game === game && message.state) {
      state = message.state;
      movePending = false;
      render();
    }
  }

  function render() {
    renderScores();
    if (game === "rps") renderRps();
    if (game === "nim") renderNim();
    if (game === "memory") renderMemory();
    if (game === "dots") renderDots();
    connectionStatus.textContent = online ? online.status : "Playing on this device";
    inviteButton.disabled = Boolean(online?.online);
    if (online?.inviteUrl) {
      inviteUrl.value = online.inviteUrl;
      inviteUrl.hidden = false;
      copyButton.hidden = false;
    }
  }

  const online = new OnlineMatch({
    onMessage: receive,
    onChange: render
  });

  inviteButton.addEventListener("click", () => {
    beginRound(true);
    online.startHost();
    render();
  });
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl.value);
      copyButton.textContent = "Copied!";
    } catch {
      inviteUrl.focus();
      inviteUrl.select();
      connectionStatus.textContent = "Copy the invite link above and send it to your friend.";
    }
  });
  document.querySelector("#new-round").addEventListener("click", () => requestAction("new-round"));
  document.querySelector("#reset-score").addEventListener("click", () => requestAction("reset-score"));
  online.startFromUrl();
  render();
})();