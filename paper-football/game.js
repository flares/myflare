// Paper Football — state machine, legal-move generation, win detection, screens.
// Talks only to window.PFCards and window.PFBoard (see CONTRACT.md). Never
// touches #pitch's SVG contents directly — that is PFBoard's job.
(function () {
  'use strict';

  var STORAGE_KEY = 'paper-football';

  // ---------------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------------
  var sizeSelect = document.getElementById('size-select');
  var kickoffBtn = document.getElementById('btn-kickoff');
  var tallyP1El = document.getElementById('tally-p1');
  var tallyP2El = document.getElementById('tally-p2');

  var draftTitleEl = document.getElementById('draft-title');
  var draftSubEl = document.getElementById('draft-sub');
  var draftCardsEl = document.getElementById('draft-cards');
  var confirmBtn = document.getElementById('btn-draft-confirm');

  var turnPillEl = document.getElementById('turn-pill');
  var turnLabelEl = document.getElementById('turn-label');
  var moveCountEl = document.getElementById('move-count');
  var restartBtn = document.getElementById('btn-restart');
  var pitchEl = document.getElementById('pitch');
  var handEl = document.getElementById('hand');

  var resultEl = document.getElementById('result');
  var resultTitleEl = document.getElementById('result-title');
  var resultReasonEl = document.getElementById('result-reason');
  var rematchBtn = document.getElementById('btn-rematch');
  var newGameBtn = document.getElementById('btn-newgame');

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  var state = {
    size: '7x15',
    wins: { p1: 0, p2: 0 },

    cols: 15,
    rows: 7,
    goalRow: 3,

    dead: new Set(),
    ball: { col: 7, row: 3 },

    hands: { 1: [], 2: [] },
    turn: 1,
    moveCount: 1,
    activeCardId: null,
    locked: false,
    turnLegal: { union: [], perCard: new Map() },

    // bumped every time a fresh game/rematch starts, so a move Promise that
    // resolves after the player has bailed out (Restart / New Game) can
    // recognise it is stale and no-op instead of mutating a dead screen.
    session: 0,

    draft: { cards: [], player: 1, selected: new Set() }
  };

  // ---------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------
  function loadPrefs() {
    var fallback = { size: '7x15', wins: { p1: 0, p2: 0 } };
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return fallback;
      var size = obj.size === '9x15' ? '9x15' : '7x15';
      var wins = obj.wins || {};
      return {
        size: size,
        wins: {
          p1: Number.isFinite(Number(wins.p1)) ? Math.max(0, Math.floor(Number(wins.p1))) : 0,
          p2: Number.isFinite(Number(wins.p2)) ? Math.max(0, Math.floor(Number(wins.p2))) : 0
        }
      };
    } catch (e) {
      return fallback;
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ size: state.size, wins: state.wins }));
    } catch (e) {
      // localStorage unavailable (private mode, quota, etc) — persistence is
      // a nice-to-have, never block play on it.
    }
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  function key(node) {
    return node.col + ',' + node.row;
  }

  function isGoalNode(node) {
    return node.row === state.goalRow && (node.col === 0 || node.col === state.cols - 1);
  }

  // Every legal destination reachable by `card` for the player currently on
  // the move, from the ball's current node. See README §1.4.
  function cardDestinations(card, player) {
    var offs = PFCards.offsets(card, player);
    var out = [];
    var seen = new Set();
    for (var i = 0; i < offs.length; i++) {
      var dx = offs[i][0];
      var dy = offs[i][1];
      var col = state.ball.col + dx;
      var row = state.ball.row + dy;

      if (col < 0 || col >= state.cols || row < 0 || row >= state.rows) continue; // in bounds
      if (col === state.ball.col && row === state.ball.row) continue; // not current node

      var k = col + ',' + row;
      if (seen.has(k)) continue;

      var goal = row === state.goalRow && (col === 0 || col === state.cols - 1);
      if (!goal && state.dead.has(k)) continue; // not a dead node (goals are exempt & never die)

      seen.add(k);
      out.push({ col: col, row: row });
    }
    return out;
  }

  function computeLegal() {
    var hand = state.hands[state.turn];
    var perCard = new Map();
    var unionMap = new Map();
    for (var i = 0; i < hand.length; i++) {
      var card = hand[i];
      var dest = cardDestinations(card, state.turn);
      perCard.set(card.id, dest);
      for (var j = 0; j < dest.length; j++) {
        unionMap.set(key(dest[j]), dest[j]);
      }
    }
    return { perCard: perCard, union: Array.from(unionMap.values()) };
  }

  // ---------------------------------------------------------------------
  // Start screen
  // ---------------------------------------------------------------------
  function updateTallyDisplay() {
    tallyP1El.textContent = String(state.wins.p1);
    tallyP2El.textContent = String(state.wins.p2);
    sizeSelect.value = state.size;
  }

  function goToStart() {
    state.session++; // invalidate any in-flight move
    document.body.dataset.screen = 'start';
    resultEl.hidden = true;
    updateTallyDisplay();
  }

  // ---------------------------------------------------------------------
  // Draft screen
  // ---------------------------------------------------------------------
  function updateDraftSub() {
    draftSubEl.textContent = (3 - state.draft.selected.size) + ' left';
  }

  function renderDraft() {
    var letter = state.draft.player === 1 ? 'M' : 'S';
    draftTitleEl.textContent = 'Player ' + state.draft.player + ' (' + letter + ') — pick 3';
    updateDraftSub();

    draftCardsEl.innerHTML = '';
    state.draft.cards.forEach(function (card) {
      var el = PFCards.el(card, { player: state.draft.player, size: 'lg' });
      if (state.draft.selected.has(card.id)) el.classList.add('selected');
      draftCardsEl.appendChild(el);
    });

    confirmBtn.disabled = state.draft.selected.size !== 3;
  }

  function beginDraft() {
    state.draft.cards = PFCards.drawSix();
    state.draft.player = 1;
    state.draft.selected = new Set();
    document.body.dataset.screen = 'draft';
    renderDraft();
  }

  draftCardsEl.addEventListener('click', function (e) {
    var cardEl = e.target.closest('.pf-card');
    if (!cardEl) return;
    var id = cardEl.dataset.cardId;
    var sel = state.draft.selected;
    if (sel.has(id)) {
      sel.delete(id);
      cardEl.classList.remove('selected');
    } else {
      if (sel.size >= 3) return; // already at the cap — ignore
      sel.add(id);
      cardEl.classList.add('selected');
    }
    updateDraftSub();
    confirmBtn.disabled = sel.size !== 3;
  });

  confirmBtn.addEventListener('click', function () {
    if (state.draft.selected.size !== 3) return;
    var chosen = state.draft.cards.filter(function (c) {
      return state.draft.selected.has(c.id);
    });

    if (state.draft.player === 1) {
      state.hands[1] = chosen;
      state.draft.player = 2;
      state.draft.selected = new Set();
      renderDraft();
    } else {
      state.hands[2] = chosen;
      startGame();
    }
  });

  // ---------------------------------------------------------------------
  // Game screen — HUD
  // ---------------------------------------------------------------------
  function updateHud() {
    turnPillEl.classList.remove('p1', 'p2');
    turnPillEl.classList.add('p' + state.turn);
    handEl.classList.remove('p1', 'p2');
    handEl.classList.add('p' + state.turn);
    turnLabelEl.textContent = state.turn === 1 ? 'Blue Player' : 'Red Player';
    moveCountEl.textContent = 'Move ' + state.moveCount;
  }

  function renderHand() {
    handEl.innerHTML = '';
    var hand = state.hands[state.turn];
    hand.forEach(function (card) {
      var el = PFCards.el(card, { player: state.turn, size: 'sm' });
      var dest = state.turnLegal.perCard.get(card.id);
      if (!dest || dest.length === 0) el.classList.add('disabled');
      if (state.activeCardId === card.id) el.classList.add('active');
      handEl.appendChild(el);
    });
  }

  // Tapping a card narrows the highlight to that card's destinations;
  // tapping the *active* card again (there being no exposed "ball tapped"
  // hook in PFBoard — see report) drops the filter and returns to the
  // turn-start union, matching README §1.3 step 2's ball-tap behaviour.
  handEl.addEventListener('click', function (e) {
    if (state.locked) return;
    var cardEl = e.target.closest('.pf-card');
    if (!cardEl || cardEl.classList.contains('disabled')) return;
    var id = cardEl.dataset.cardId;

    state.activeCardId = state.activeCardId === id ? null : id;
    renderHand();

    var nodes = state.activeCardId ? state.turnLegal.perCard.get(state.activeCardId) : state.turnLegal.union;
    PFBoard.clearHighlight();
    PFBoard.highlight(nodes, state.turn, onPick);
  });

  // ---------------------------------------------------------------------
  // Game screen — turn loop
  // ---------------------------------------------------------------------
  function startTurn() {
    state.activeCardId = null;
    state.locked = false;
    updateHud();

    state.turnLegal = computeLegal();

    if (state.turnLegal.union.length === 0) {
      endGame({ type: 'stalemate', loser: state.turn, mover: state.turn });
      return;
    }

    renderHand();
    PFBoard.highlight(state.turnLegal.union, state.turn, onPick);
  }

  function onPick(node) {
    if (state.locked) return;
    state.locked = true;

    var session = state.session;
    var from = state.ball;
    var mover = state.turn;

    Promise.resolve(PFBoard.move(from, node, mover)).then(function () {
      if (session !== state.session) return; // game left mid-flight (Restart/New Game)

      state.dead.add(key(from));
      state.ball = node;

      if (isGoalNode(node)) {
        var side = node.col === 0 ? 'left' : 'right';
        var loser = node.col === 0 ? 1 : 2; // M(left)=p1's goal, S(right)=p2's goal
        PFBoard.goalCelebrate(side);
        endGame({ type: 'goal', loser: loser, mover: mover });
        return;
      }

      state.moveCount++;
      state.turn = mover === 1 ? 2 : 1;
      startTurn();
    });
  }

  function startGame() {
    state.session++;
    var parts = state.size.split('x');
    var rows = Number(parts[0]);
    var cols = Number(parts[1]);

    state.cols = cols;
    state.rows = rows;
    var centre = { col: Math.floor(cols / 2), row: Math.floor(rows / 2) };
    state.goalRow = centre.row;

    state.dead = new Set();
    state.ball = { col: centre.col, row: centre.row };
    state.turn = 1;
    state.moveCount = 1;
    state.activeCardId = null;
    state.locked = false;

    document.body.dataset.screen = 'game';
    PFBoard.init(pitchEl, cols, rows);
    PFBoard.place(state.ball);

    startTurn();
  }

  restartBtn.addEventListener('click', goToStart);

  // ---------------------------------------------------------------------
  // Result overlay
  // ---------------------------------------------------------------------
  function endGame(info) {
    state.locked = true;
    PFBoard.clearHighlight();

    var winner = info.loser === 1 ? 2 : 1;
    var winnerName = winner === 1 ? 'Blue Player' : 'Red Player';
    var loserName = info.loser === 1 ? 'Blue Player' : 'Red Player';

    state.wins['p' + winner]++;
    savePrefs();

    resultTitleEl.textContent = winnerName + ' wins';
    resultTitleEl.classList.remove('p1', 'p2');
    resultTitleEl.classList.add('p' + winner);

    if (info.type === 'goal') {
      var moverName = info.mover === 1 ? 'Blue Player' : 'Red Player';
      resultReasonEl.textContent = info.mover === info.loser
        ? loserName + ' put the ball into their own goal.'
        : moverName + ' scored on ' + loserName + "'s goal.";
    } else {
      resultReasonEl.textContent = loserName + ' has no legal moves.';
    }

    resultEl.hidden = false;
  }

  rematchBtn.addEventListener('click', function () {
    resultEl.hidden = true;
    startGame(); // same board, same two drafted hands, fresh pitch
  });

  newGameBtn.addEventListener('click', goToStart);

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  kickoffBtn.addEventListener('click', function () {
    state.size = sizeSelect.value;
    savePrefs();
    beginDraft();
  });

  sizeSelect.addEventListener('change', function () {
    state.size = sizeSelect.value;
    savePrefs();
  });

  (function init() {
    var prefs = loadPrefs();
    state.size = prefs.size;
    state.wins = prefs.wins;
    updateTallyDisplay();
  })();
})();
