(() => {
  const ROW_SIZES = [1, 2, 3, 4];
  const START_SECONDS = 60;
  const TIME_BONUS = 3;
  const TIME_PENALTY = 5;
  const TOP_MAX = 100;
  const BOTTOM_MIN = 0;
  const WIN_CELLS = 10;
  const POINTS_PER_SECOND = 5;
  const POINTS_PER_CARD_LEFT = 1;

  const pyramidEl = document.getElementById("pyramid");
  const timerEl = document.getElementById("timer");
  const timerValueEl = document.getElementById("timer-value");
  const currentCardEl = document.getElementById("current-card");
  const cardValueEl = document.getElementById("card-value");
  const stackCountEl = document.getElementById("stack-count");
  const startBtn = document.getElementById("start-btn");
  const passBtn = document.getElementById("pass-btn");
  const newGameBtn = document.getElementById("new-game-btn");
  const statusEl = document.getElementById("status");
  const finalScoreEl = document.getElementById("final-score");
  const overlayEl = document.getElementById("overlay");
  const overlayTitleEl = document.getElementById("overlay-title");
  const overlayScoreEl = document.getElementById("overlay-score");
  const scoreBreakdownEl = document.getElementById("score-breakdown");
  const closeBtn = document.getElementById("close-btn");
  const helpBtn = document.getElementById("help-btn");
  const helpOverlayEl = document.getElementById("help-overlay");
  const helpCloseBtn = document.getElementById("help-close-btn");

  /** @type {{ value: number | null, row: number, index: number, el: HTMLButtonElement }[]} */
  let cells = [];
  /** @type {number[]} */
  let deck = [];
  let currentCard = null;
  let secondsLeft = START_SECONDS;
  let placedCount = 0;
  let playing = false;
  let timerId = null;
  let lastScore = null;

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function createDeck() {
    // Exactly one of each number from 1–99 — no repeats.
    return shuffle(Array.from({ length: 99 }, (_, i) => i + 1));
  }

  function buildPyramid() {
    pyramidEl.innerHTML = "";
    cells = [];
    let flatIndex = 0;

    ROW_SIZES.forEach((size, row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "pyramid-row";
      rowEl.dataset.row = String(row);

      for (let i = 0; i < size; i += 1) {
        const index = flatIndex;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cell cell--empty";
        btn.dataset.row = String(row);
        btn.dataset.index = String(index);
        btn.setAttribute("aria-label", `Empty space, row ${row + 1}`);
        btn.disabled = true;
        btn.addEventListener("click", () => onCellClick(index));

        rowEl.appendChild(btn);
        cells.push({ value: null, row, index, el: btn });
        flatIndex += 1;
      }

      pyramidEl.appendChild(rowEl);
    });
  }

  function rowSum(row) {
    return cells
      .filter((c) => c.row === row && c.value !== null)
      .reduce((sum, c) => sum + c.value, 0);
  }

  function rowHasCards(row) {
    return cells.some((c) => c.row === row && c.value !== null);
  }

  function wouldBeValid(row, number, replacingValue = null) {
    const newSum = rowSum(row) - (replacingValue ?? 0) + number;

    // No cards in adjacent rows → always fits (edge caps still apply).
    if (row === 0) {
      if (newSum > TOP_MAX) return false;
    } else if (rowHasCards(row - 1) && newSum > rowSum(row - 1)) {
      return false;
    }

    if (row === ROW_SIZES.length - 1) {
      if (newSum < BOTTOM_MIN) return false;
    } else if (rowHasCards(row + 1) && newSum < rowSum(row + 1)) {
      return false;
    }

    return true;
  }

  function formatTime(totalSeconds) {
    const tenths = Math.floor(Math.max(0, totalSeconds) * 10) / 10;
    return tenths.toFixed(1);
  }

  function updateTimerDisplay() {
    timerValueEl.textContent = formatTime(secondsLeft);
    timerEl.classList.toggle("timer--low", secondsLeft <= 10 && playing);
  }

  function flashTimer(kind) {
    timerEl.classList.remove("timer--flash-good", "timer--flash-bad");
    // Force reflow so repeated flashes retrigger
    void timerEl.offsetWidth;
    timerEl.classList.add(kind === "good" ? "timer--flash-good" : "timer--flash-bad");
  }

  function setStatus(message, kind = "") {
    statusEl.textContent = message;
    statusEl.className = "status" + (kind ? ` status--${kind}` : "");
  }

  function updateStackUI() {
    const remaining = deck.length + (currentCard !== null ? 1 : 0);
    stackCountEl.textContent =
      remaining === 1 ? "1 card" : `${remaining} cards`;

    if (currentCard === null) {
      currentCardEl.classList.add("card--face-down");
      currentCardEl.classList.remove("card--face-up");
      cardValueEl.textContent = "?";
      currentCardEl.setAttribute("aria-label", "Card face down");
      return;
    }

    currentCardEl.classList.remove("card--face-down");
    currentCardEl.classList.add("card--face-up");
    cardValueEl.textContent = String(currentCard);
    currentCardEl.setAttribute("aria-label", `Current card ${currentCard}`);
  }

  function setCellsInteractive(interactive) {
    cells.forEach((cell) => {
      const canUse = interactive && playing;
      cell.el.disabled = !canUse;
      cell.el.classList.toggle("cell--interactive", canUse);
    });
  }

  function emptySlots() {
    return cells.filter((c) => c.value === null).length;
  }

  function cardsLeft() {
    return deck.length + (currentCard !== null ? 1 : 0);
  }

  function hasEnoughCardsToFill() {
    return cardsLeft() >= emptySlots();
  }

  function drawNextCard() {
    if (deck.length === 0) {
      currentCard = null;
      updateStackUI();
      endGame(false, "out-of-cards");
      return;
    }

    currentCard = deck.pop();
    // Retrigger flip animation
    currentCardEl.classList.remove("card--face-up");
    void currentCardEl.offsetWidth;
    updateStackUI();

    if (!hasEnoughCardsToFill()) {
      setCellsInteractive(false);
      endGame(false, "insufficient-cards");
      return;
    }

    setCellsInteractive(true);
    setStatus("Place or replace a number in the pyramid, or pass.");
  }

  function adjustTime(delta) {
    secondsLeft = Math.max(0, secondsLeft + delta);
    updateTimerDisplay();
    if (secondsLeft <= 0) {
      endGame(false, "timeout");
    }
  }

  function flashCell(el, kind) {
    const cls = kind === "good" ? "cell--valid" : "cell--invalid";
    el.classList.remove("cell--valid", "cell--invalid");
    void el.offsetWidth;
    el.classList.add(cls);

    window.setTimeout(() => {
      el.classList.remove(cls);
    }, 450);
  }

  function onCellClick(flatIndex) {
    if (!playing || currentCard === null) return;

    const cell = cells[flatIndex];
    if (!cell) return;

    const number = currentCard;
    const replacing = cell.value !== null;
    const previous = cell.value;

    if (!wouldBeValid(cell.row, number, previous)) {
      flashCell(cell.el, "bad");
      flashTimer("bad");
      adjustTime(-TIME_PENALTY);
      if (!playing) return;
      setStatus(`Can't place ${number} there (−${TIME_PENALTY}s)`, "bad");
      return;
    }

    cell.value = number;
    cell.el.textContent = String(number);
    cell.el.classList.remove("cell--empty", "cell--invalid");
    cell.el.classList.add("cell--filled");
    flashCell(cell.el, "good");
    cell.el.setAttribute(
      "aria-label",
      `Row ${cell.row + 1}, value ${number}`
    );

    if (!replacing) {
      placedCount += 1;
    }

    currentCard = null;
    flashTimer("good");
    adjustTime(TIME_BONUS);

    if (!playing) return;

    if (placedCount >= WIN_CELLS) {
      updateStackUI();
      setCellsInteractive(false);
      endGame(true);
      return;
    }

    drawNextCard();
    setStatus(
      replacing
        ? `Replaced ${previous} with ${number} (+${TIME_BONUS}s)`
        : `Placed ${number} (+${TIME_BONUS}s)`,
      "good"
    );
  }

  function onPass() {
    if (!playing || currentCard === null) return;
    setStatus(`Passed on ${currentCard}.`);
    // Passing discards the card; check remaining supply after the next draw.
    drawNextCard();
  }

  function pyramidPoints() {
    return cells.reduce((sum, c) => sum + (c.value ?? 0), 0);
  }

  function renderBreakdown(lines) {
    scoreBreakdownEl.innerHTML = "";
    lines.forEach((line) => {
      const li = document.createElement("li");
      if (line.total) li.className = "score-breakdown__total";

      const label = document.createElement("span");
      label.textContent = line.label;

      const value = document.createElement("span");
      value.className = "score-breakdown__value";
      value.textContent = String(line.value);

      li.append(label, value);
      scoreBreakdownEl.appendChild(li);
    });
  }

  function stopTimer() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer() {
    stopTimer();
    const startedAt = performance.now();
    let elapsed = 0;

    timerId = window.setInterval(() => {
      const now = performance.now();
      const delta = (now - startedAt) / 1000 - elapsed;
      elapsed += delta;
      secondsLeft -= delta;
      updateTimerDisplay();
      if (secondsLeft <= 0) {
        secondsLeft = 0;
        updateTimerDisplay();
        endGame(false, "timeout");
      }
    }, 100);
  }

  function endGame(won, reason = "") {
    if (!playing && overlayEl.hidden === false) return;
    playing = false;
    stopTimer();
    setCellsInteractive(false);
    passBtn.hidden = true;
    startBtn.hidden = true;
    newGameBtn.hidden = true;

    const pyramid = pyramidPoints();
    const remainingCards = cardsLeft();
    /** @type {{ label: string, value: number, total?: boolean }[]} */
    const lines = [];
    let score;
    let title;

    if (won) {
      const wholeSeconds = Math.floor(secondsLeft);
      const timeBonus = wholeSeconds * POINTS_PER_SECOND;
      const stackBonus = remainingCards * POINTS_PER_CARD_LEFT;
      score = pyramid + timeBonus + stackBonus;
      title = "You Win!";
      lines.push({ label: "Pyramid", value: pyramid });
      lines.push({
        label: `Time left (${wholeSeconds}s × ${POINTS_PER_SECOND})`,
        value: timeBonus,
      });
      lines.push({
        label: `Cards left (${remainingCards})`,
        value: stackBonus,
      });
      setStatus("Pyramid complete!", "good");
    } else {
      score = Math.floor(pyramid / 2);
      if (reason === "timeout") {
        title = "Time's Up";
        setStatus("Out of time.", "bad");
      } else if (reason === "insufficient-cards") {
        title = "Not Enough Cards";
        setStatus("Not enough cards left to fill the pyramid.", "bad");
      } else {
        title = "No Cards Left";
        setStatus("The stack is empty.", "bad");
      }
      lines.push({ label: "Pyramid (half)", value: score });
    }

    lines.push({ label: "Total", value: score, total: true });
    lastScore = score;

    overlayTitleEl.textContent = title;
    overlayScoreEl.textContent = `${score} pts`;
    renderBreakdown(lines);
    finalScoreEl.hidden = true;
    overlayEl.hidden = false;
  }

  function closeOverlay() {
    overlayEl.hidden = true;
    startBtn.hidden = true;
    passBtn.hidden = true;
    newGameBtn.hidden = false;
    if (lastScore !== null) {
      finalScoreEl.hidden = false;
      finalScoreEl.textContent = `Final score: ${lastScore} pts`;
    }
    setStatus("Review your pyramid, or start a new game.");
  }

  function resetBoard() {
    stopTimer();
    playing = false;
    placedCount = 0;
    currentCard = null;
    secondsLeft = START_SECONDS;
    lastScore = null;
    deck = createDeck();

    buildPyramid();
    updateTimerDisplay();
    updateStackUI();
    setCellsInteractive(false);

    startBtn.hidden = false;
    startBtn.disabled = false;
    startBtn.textContent = "Start Game";
    passBtn.hidden = true;
    newGameBtn.hidden = true;
    overlayEl.hidden = true;
    helpOverlayEl.hidden = true;
    finalScoreEl.hidden = true;
    finalScoreEl.textContent = "";
    timerEl.classList.remove("timer--low", "timer--flash-good", "timer--flash-bad");
    setStatus("Press Start to shuffle and flip the first card.");
  }

  function startGame() {
    resetBoard();
    playing = true;
    startBtn.hidden = true;
    newGameBtn.hidden = true;
    passBtn.hidden = false;
    startTimer();
    drawNextCard();
  }

  startBtn.addEventListener("click", startGame);
  newGameBtn.addEventListener("click", startGame);
  passBtn.addEventListener("click", onPass);
  closeBtn.addEventListener("click", closeOverlay);
  helpBtn.addEventListener("click", openHelp);
  helpCloseBtn.addEventListener("click", closeHelp);

  function openHelp() {
    if (playing) stopTimer();
    helpOverlayEl.hidden = false;
  }

  function closeHelp() {
    helpOverlayEl.hidden = true;
    if (playing) startTimer();
  }

  resetBoard();
})();
