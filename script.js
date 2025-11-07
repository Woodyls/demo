// 简易五子棋（15x15）实现：棋盘绘制、落子交互、胜负判定、悔棋与重开

(() => {
  const GRID = 15; // 15x15
  const PADDING = 28; // 棋盘边距（增大以容纳坐标标注）
  const LINE_COLOR = '#6b5b3e';
  const STAR_RADIUS = 3; // 天元和星位大小

  const canvas = document.getElementById('board');
  const statusEl = document.getElementById('status');
  const undoBtn = document.getElementById('undoBtn');
  const resetBtn = document.getElementById('resetBtn');

  // 数据模型：0 空，1 黑，2 白
  let board = createBoard(GRID);
  let currentPlayer = 1; // 黑棋先手
  let moves = []; // 记录落子历史 [{r,c,player}]
  let gameOver = false;

  const ctx = canvas.getContext('2d');
  let dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  let displaySize = 0; // CSS显示尺寸（像素）
  let cell = 0;        // 每格像素大小（绘制用，考虑dpr前）
  let hoverCell = null; // {r,c} 鼠标悬停的格子
  const movesEl = document.getElementById('moves');

  function createBoard(n) {
    return Array.from({ length: n }, () => Array(n).fill(0));
  }

  function updateStatus(text) {
    statusEl.textContent = text;
  }

  function setupCanvas() {
    dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const container = canvas.parentElement;
    const maxW = Math.min(720, container.clientWidth - 2); // 适配移动端
    displaySize = Math.max(300, Math.floor(maxW));

    // 逻辑尺寸（真实像素，乘以dpr）
    canvas.width = displaySize * dpr;
    canvas.height = displaySize * dpr;

    // CSS 尺寸（显示用）
    canvas.style.width = displaySize + 'px';
    canvas.style.height = displaySize + 'px';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 计算棋盘格子大小：棋盘可用区域 = displaySize - 2*PADDING
    cell = (displaySize - PADDING * 2) / GRID;
    drawAll();
  }

  function clear() {
    ctx.clearRect(0, 0, displaySize, displaySize);
  }

  function drawBoard() {
    // 背景由CSS提供，这里仅画网格线
    ctx.save();
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1;

    // 画网格线（GRID+1条线，形成GRID个格子）
    for (let i = 0; i <= GRID; i++) {
      const y = PADDING + i * cell;
      ctx.beginPath();
      ctx.moveTo(PADDING, y);
      ctx.lineTo(PADDING + GRID * cell, y);
      ctx.stroke();
    }
    for (let j = 0; j <= GRID; j++) {
      const x = PADDING + j * cell;
      ctx.beginPath();
      ctx.moveTo(x, PADDING);
      ctx.lineTo(x, PADDING + GRID * cell);
      ctx.stroke();
    }

    // 天元与星位（按15路棋盘惯例）
    const stars = [
      [3, 3], [3, 11], [11, 3], [11, 11], // 四角星
      [7, 7], // 天元
    ];
    ctx.fillStyle = '#4b3b1e';
    stars.forEach(([r, c]) => {
      const cx = PADDING + (c + 0.5) * cell;
      const cy = PADDING + (r + 0.5) * cell;
      ctx.beginPath();
      ctx.arc(cx, cy, STAR_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // 坐标标注（列 A–O，行 1–15）
    ctx.save();
    ctx.fillStyle = '#3a321f';
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 列标注顶部
    for (let c = 0; c < GRID; c++) {
      const x = PADDING + (c + 0.5) * cell;
      const label = String.fromCharCode('A'.charCodeAt(0) + c);
      ctx.fillText(label, x, PADDING - 12);
      // 底部
      ctx.fillText(label, x, PADDING + GRID * cell + 12);
    }
    // 行标注左右
    for (let r = 0; r < GRID; r++) {
      const y = PADDING + (r + 0.5) * cell;
      const label = (r + 1).toString();
      ctx.fillText(label, PADDING - 12, y);
      ctx.fillText(label, PADDING + GRID * cell + 12, y);
    }
    ctx.restore();
  }

  function drawStone(r, c, player, isLast) {
    const cx = PADDING + (c + 0.5) * cell;
    const cy = PADDING + (r + 0.5) * cell;
    const radius = Math.min(cell * 0.45, 16);

    ctx.save();
    // 阴影与立体感
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;

    // 渐变以增强质感
    const grad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.2, cx, cy, radius);
    if (player === 1) {
      grad.addColorStop(0, '#222');
      grad.addColorStop(1, '#000');
    } else {
      grad.addColorStop(0, '#fafafa');
      grad.addColorStop(1, '#dcdcdc');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // 高亮最后一手
    if (isLast) {
      ctx.beginPath();
      ctx.strokeStyle = '#e83e8c';
      ctx.lineWidth = 2;
      ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStones() {
    // 最后一手位置
    const last = moves[moves.length - 1];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const v = board[r][c];
        if (v !== 0) {
          const isLast = !!(last && last.r === r && last.c === c);
          drawStone(r, c, v, isLast);
        }
      }
    }
  }

  function drawGhost() {
    if (gameOver) return;
    if (!hoverCell) return;
    const { r, c } = hoverCell;
    if (!inBounds(r, c)) return;
    if (board[r][c] !== 0) return;
    const cx = PADDING + (c + 0.5) * cell;
    const cy = PADDING + (r + 0.5) * cell;
    const radius = Math.min(cell * 0.45, 16);
    const color = currentPlayer === 1 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.5)';
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawAll() {
    clear();
    drawBoard();
    drawStones();
    drawGhost();
  }

  function insideBoard(x, y) {
    return (
      x >= PADDING && x <= PADDING + GRID * cell &&
      y >= PADDING && y <= PADDING + GRID * cell
    );
  }

  // 点击事件：将点击映射到格子坐标
  function handleClick(evt) {
    if (gameOver) return;
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left);
    const y = (evt.clientY - rect.top);

    if (!insideBoard(x, y)) return;

    const c = Math.floor((x - PADDING) / cell);
    const r = Math.floor((y - PADDING) / cell);
    if (r < 0 || r >= GRID || c < 0 || c >= GRID) return;

    if (board[r][c] !== 0) return; // 已有棋子

    board[r][c] = currentPlayer;
    moves.push({ r, c, player: currentPlayer });

    // 胜负判定
    if (checkWin(r, c, currentPlayer)) {
      gameOver = true;
      updateStatus((currentPlayer === 1 ? '黑棋' : '白棋') + '胜！');
      drawAll();
      updateMovesUI();
      return;
    }

    // 平局判定（棋盘已满）
    if (moves.length >= GRID * GRID) {
      gameOver = true;
      updateStatus('平局');
      drawAll();
      updateMovesUI();
      return;
    }

    // 切换选手
    currentPlayer = 3 - currentPlayer; // 1->2, 2->1
    updateStatus((currentPlayer === 1 ? '黑棋' : '白棋') + '走');
    drawAll();
    updateMovesUI();
  }

  function inBounds(r, c) {
    return r >= 0 && r < GRID && c >= 0 && c < GRID;
  }

  function countDirection(r, c, dr, dc, player) {
    let cnt = 0;
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc) && board[nr][nc] === player) {
      cnt++;
      nr += dr;
      nc += dc;
    }
    return cnt;
  }

  function checkWin(r, c, player) {
    // 四个方向：水平、垂直、主对角、反对角
    const dirs = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    for (const [dr, dc] of dirs) {
      const forward = countDirection(r, c, dr, dc, player);
      const backward = countDirection(r, c, -dr, -dc, player);
      if (forward + backward + 1 >= 5) return true;
    }
    return false;
  }

  function undo() {
    if (gameOver && moves.length === 0) return;
    const last = moves.pop();
    if (!last) return;
    board[last.r][last.c] = 0;
    gameOver = false;
    currentPlayer = last.player; // 回到上一手的玩家
    updateStatus((currentPlayer === 1 ? '黑棋' : '白棋') + '走');
    drawAll();
    updateMovesUI();
  }

  function reset() {
    board = createBoard(GRID);
    moves = [];
    currentPlayer = 1;
    gameOver = false;
    updateStatus('黑棋先手');
    drawAll();
    updateMovesUI();
  }

  function updateMovesUI() {
    if (!movesEl) return;
    const max = 20;
    const start = Math.max(0, moves.length - max);
    const slice = moves.slice(start);
    // 生成坐标标识（列 A–O, 行 1–15）
    const toLabel = ({ r, c }) => {
      const col = String.fromCharCode('A'.charCodeAt(0) + c);
      const row = (r + 1).toString();
      return col + row;
    };
    movesEl.innerHTML = slice
      .map((m) => `<li>${m.player === 1 ? '黑' : '白'} ${toLabel(m)}</li>`) 
      .join('');
  }

  function handleMouseMove(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left);
    const y = (evt.clientY - rect.top);
    if (!insideBoard(x, y)) {
      if (hoverCell) {
        hoverCell = null;
        drawAll();
      }
      return;
    }
    const c = Math.floor((x - PADDING) / cell);
    const r = Math.floor((y - PADDING) / cell);
    const next = { r, c };
    if (!hoverCell || hoverCell.r !== next.r || hoverCell.c !== next.c) {
      hoverCell = next;
      drawAll();
    }
  }

  function handleMouseLeave() {
    if (hoverCell) {
      hoverCell = null;
      drawAll();
    }
  }

  function handleTouchStart(evt) {
    if (gameOver) return;
    const t = evt.touches[0];
    if (!t) return;
    const rect = canvas.getBoundingClientRect();
    const x = (t.clientX - rect.left);
    const y = (t.clientY - rect.top);
    if (!insideBoard(x, y)) return;
    const c = Math.floor((x - PADDING) / cell);
    const r = Math.floor((y - PADDING) / cell);
    if (board[r][c] !== 0) return;
    // 复用点击逻辑
    board[r][c] = currentPlayer;
    moves.push({ r, c, player: currentPlayer });
    if (checkWin(r, c, currentPlayer)) {
      gameOver = true;
      updateStatus((currentPlayer === 1 ? '黑棋' : '白棋') + '胜！');
      drawAll();
      updateMovesUI();
      return;
    }
    if (moves.length >= GRID * GRID) {
      gameOver = true;
      updateStatus('平局');
      drawAll();
      updateMovesUI();
      return;
    }
    currentPlayer = 3 - currentPlayer;
    updateStatus((currentPlayer === 1 ? '黑棋' : '白棋') + '走');
    drawAll();
    updateMovesUI();
  }

  // 事件绑定
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseleave', handleMouseLeave);
  canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
  undoBtn.addEventListener('click', undo);
  resetBtn.addEventListener('click', reset);
  window.addEventListener('resize', setupCanvas);

  // 初始渲染
  setupCanvas();
})();