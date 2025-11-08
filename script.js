// 简易五子棋（15x15）实现：棋盘绘制、落子交互、胜负判定、悔棋与重开

(() => {
  let GRID = 15; // 可变路数：13/15/19
  const PADDING = 28; // 棋盘边距（增大以容纳坐标标注）
  const LINE_COLOR = '#6b5b3e';
  const STAR_RADIUS = 3; // 天元和星位大小

  const canvas = document.getElementById('board');
  const statusEl = document.getElementById('status');
  const undoBtn = document.getElementById('undoBtn');
  const resetBtn = document.getElementById('resetBtn');
  const showNumbersChk = document.getElementById('showNumbers');
  const exportJsonBtn = document.getElementById('exportJsonBtn');
  const exportTxtBtn = document.getElementById('exportTxtBtn');
  const copyTxtBtn = document.getElementById('copyTxtBtn');
  const importTextEl = document.getElementById('importText');
  const importBtn = document.getElementById('importBtn');
  const themeToggle = document.getElementById('themeToggle');
  const gridSelect = document.getElementById('gridSelect');
  const soundToggle = document.getElementById('soundToggle');
  const arrowToggle = document.getElementById('arrowToggle');

  // 数据模型：0 空，1 黑，2 白
  let board = createBoard(GRID);
  let currentPlayer = 1; // 黑棋先手
  let moves = []; // 记录落子历史 [{r,c,player}]
  let gameOver = false;
  let showMoveNumbers = false;
  let soundEnabled = true;
  let arrowEnabled = true;
  // 简易音效：使用 Web Audio API 生成短促提示音
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      try { audioCtx = new AC(); } catch (_) { audioCtx = null; }
    }
    return !!audioCtx;
  }
  function playPlaceSound() {
    try {
      if (!soundEnabled) return;
      if (!ensureAudio()) return;
      const t0 = audioCtx.currentTime;
      const dur = 0.07;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      // 不同阵营略有音高差异
      osc.frequency.setValueAtTime(currentPlayer === 1 ? 520 : 640, t0);
      gain.gain.setValueAtTime(0.0, t0);
      gain.gain.linearRampToValueAtTime(0.22, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
    } catch (_) {}
  }

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
    statusEl.classList.remove('error');
  }

  function setStatus(text, type = 'info') {
    statusEl.textContent = text;
    statusEl.classList.remove('error');
    if (type === 'error') statusEl.classList.add('error');
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
    const stars = getStarPoints(GRID);
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

  function getStarPoints(n) {
    // 返回（r,c）星位坐标，支持 13/15/19
    if (n === 19) return [[3,3],[3,15],[15,3],[15,15],[9,9]];
    if (n === 13) return [[3,3],[3,9],[9,3],[9,9],[6,6]];
    return [[3,3],[3,11],[11,3],[11,11],[7,7]]; // 15 默认
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

  function drawNumber(r, c, player, num) {
    if (!showMoveNumbers || !num) return;
    const cx = PADDING + (c + 0.5) * cell;
    const cy = PADDING + (r + 0.5) * cell;
    ctx.save();
    ctx.fillStyle = player === 1 ? '#fff' : '#333';
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), cx, cy);
    ctx.restore();
  }

  function drawStones() {
    // 最后一手位置
    const last = moves[moves.length - 1];
    // 着手序号映射
    const numMap = new Map();
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      numMap.set(`${m.r},${m.c}`, i + 1);
    }
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const v = board[r][c];
        if (v !== 0) {
          const isLast = !!(last && last.r === r && last.c === c);
          drawStone(r, c, v, isLast);
          const num = numMap.get(`${r},${c}`);
          drawNumber(r, c, v, num);
        }
      }
    }
    // 为最后一手绘制箭头提示（在环形高亮之外，避免遮挡）
    drawLastMoveArrow(last);
  }

  function drawLastMoveArrow(last) {
    if (!last || !arrowEnabled) return;
    const r = last.r, c = last.c;
    const cx = PADDING + (c + 0.5) * cell;
    const cy = PADDING + (r + 0.5) * cell;
    const radius = Math.min(cell * 0.45, 16);
    const shaft = Math.min(10, cell * 0.4);
    const head = Math.min(6, cell * 0.3);
    // 默认向上箭头，若靠近上边界则改向下
    const upSpace = cy - (PADDING + radius + 4);
    const downSpace = (PADDING + GRID * cell) - (cy + radius + 4);
    const dir = upSpace >= shaft + head ? 'up' : (downSpace >= shaft + head ? 'down' : 'up');
    ctx.save();
    ctx.strokeStyle = '#e83e8c';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (dir === 'up') {
      const x = cx;
      const y0 = cy - radius - 4;
      const y1 = y0 - shaft;
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      // 箭头三角
      ctx.moveTo(x, y1);
      ctx.lineTo(x - head, y1 + head);
      ctx.moveTo(x, y1);
      ctx.lineTo(x + head, y1 + head);
    } else {
      const x = cx;
      const y0 = cy + radius + 4;
      const y1 = y0 + shaft;
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      // 箭头三角
      ctx.moveTo(x, y1);
      ctx.lineTo(x - head, y1 - head);
      ctx.moveTo(x, y1);
      ctx.lineTo(x + head, y1 - head);
    }
    ctx.stroke();
    ctx.restore();
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
    // 落子音效
    playPlaceSound();

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

  function toLabelRC(r, c) {
    const col = String.fromCharCode('A'.charCodeAt(0) + c);
    const row = (r + 1).toString();
    return col + row;
  }

  function fromLabel(label) {
    const s = label.trim().toUpperCase();
    if (!/^[A-O](?:1[0-5]|[1-9])$/.test(s)) return null;
    const c = s.charCodeAt(0) - 'A'.charCodeAt(0);
    const r = parseInt(s.slice(1), 10) - 1;
    return { r, c };
  }

  function serializeMovesJSON() {
    return JSON.stringify({ grid: GRID, moves }, null, 2);
  }

  function serializeMovesTXT() {
    return moves.map((m) => `${m.player === 1 ? '黑' : '白'} ${toLabelRC(m.r, m.c)}`).join('\n');
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function buildFilename(ext) {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const HH = pad(d.getHours());
    const MM = pad(d.getMinutes());
    const SS = pad(d.getSeconds());
    return `gomoku-${GRID}-${yyyy}${mm}${dd}-${HH}${MM}${SS}.${ext}`;
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  }

  async function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        updateStatus('棋谱已复制到剪贴板');
        return;
      }
    } catch (_) {}
    // 兼容回退
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    updateStatus('棋谱已复制（兼容模式）');
  }

  function importFromText(text) {
    text = (text || '').trim();
    if (!text) { setStatus('导入内容为空', 'error'); return; }
    // 优先尝试 JSON
    try {
      const obj = JSON.parse(text);
      if (obj && Array.isArray(obj.moves) && typeof obj.grid === 'number') {
        const g = obj.grid;
        if (![13, 15, 19].includes(g)) {
          setStatus('导入失败：不支持的路数（仅支持 13/15/19）', 'error');
          return;
        }
        const errors = validateMoves(obj.moves, g);
        if (errors.length) {
          setStatus(`导入失败：${errors[0]}（共 ${errors.length} 处错误）`, 'error');
          return;
        }
        GRID = g;
        applyImportedMoves(obj.moves);
        return;
      }
    } catch (_) {}
    // TXT 行解析：支持“黑/白 A1”或“B/W A1”
    const lines = text.split(/\r?\n/);
    const parsed = [];
    const errors = [];
    const seen = new Set();
    for (let idx = 0; idx < lines.length; idx++) {
      const raw = lines[idx];
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length === 0) continue;
      let playerToken = parts[0];
      let coordToken = parts[parts.length - 1];
      const rc = fromLabel(coordToken);
      if (!rc) { errors.push(`第 ${idx + 1} 行坐标格式错误：${coordToken}`); continue; }
      if (!inBounds(rc.r, rc.c)) { errors.push(`第 ${idx + 1} 行坐标越界：${coordToken}`); continue; }
      const key = `${rc.r},${rc.c}`;
      if (seen.has(key)) { errors.push(`第 ${idx + 1} 行重复坐标：${coordToken}`); continue; }
      seen.add(key);
      let player = 0;
      const pt = playerToken.toUpperCase();
      if (pt === '黑' || pt === 'B' || pt === 'BLACK') player = 1;
      else if (pt === '白' || pt === 'W' || pt === 'WHITE') player = 2;
      if (player === 0) {
        // 未给出玩家则按顺序推断
        player = (parsed.length % 2 === 0) ? 1 : 2;
      }
      parsed.push({ r: rc.r, c: rc.c, player });
    }
    if (errors.length) {
      setStatus(`导入失败：${errors[0]}（共 ${errors.length} 处错误）`, 'error');
      return;
    }
    applyImportedMoves(parsed);
  }

  function validateMoves(list, grid) {
    const errors = [];
    const seen = new Set();
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!inBoundsFor(m.r, m.c, grid)) {
        errors.push(`第 ${i + 1} 手越界：${toLabelRC(m.r, m.c)}`);
        continue;
      }
      const key = `${m.r},${m.c}`;
      if (seen.has(key)) {
        errors.push(`第 ${i + 1} 手重复坐标：${toLabelRC(m.r, m.c)}`);
        continue;
      }
      seen.add(key);
    }
    return errors;
  }

  function inBoundsFor(r, c, grid) {
    return r >= 0 && r < grid && c >= 0 && c < grid;
  }

  function applyImportedMoves(list) {
    reset();
    // 逐手应用，忽略非法重复点
    for (const m of list) {
      if (!inBounds(m.r, m.c)) continue;
      if (board[m.r][m.c] !== 0) continue;
      board[m.r][m.c] = m.player === 2 ? 2 : 1;
      moves.push({ r: m.r, c: m.c, player: board[m.r][m.c] });
    }
    // 根据最后一手判断状态
    const last = moves[moves.length - 1];
    if (last && checkWin(last.r, last.c, last.player)) {
      gameOver = true;
      updateStatus((last.player === 1 ? '黑棋' : '白棋') + '胜！');
    } else if (moves.length >= GRID * GRID) {
      gameOver = true;
      updateStatus('平局');
    } else {
      currentPlayer = moves.length % 2 === 0 ? 1 : 2;
      updateStatus((currentPlayer === 1 ? '黑棋' : '白棋') + '走');
    }
    drawAll();
    updateMovesUI();
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
    // 落子音效
    playPlaceSound();
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
  showNumbersChk && showNumbersChk.addEventListener('change', (e) => {
    showMoveNumbers = !!e.target.checked;
    drawAll();
  });
  exportJsonBtn && exportJsonBtn.addEventListener('click', () => {
    const txt = serializeMovesJSON();
    downloadText(buildFilename('json'), txt);
  });
  exportTxtBtn && exportTxtBtn.addEventListener('click', () => {
    const txt = serializeMovesTXT();
    downloadText(buildFilename('txt'), txt);
  });
  copyTxtBtn && copyTxtBtn.addEventListener('click', async () => {
    const txt = serializeMovesTXT();
    await copyTextToClipboard(txt);
  });
  importBtn && importBtn.addEventListener('click', () => {
    importFromText(importTextEl.value);
  });
  soundToggle && soundToggle.addEventListener('change', (e) => {
    soundEnabled = !!e.target.checked;
  });
  arrowToggle && arrowToggle.addEventListener('change', (e) => {
    arrowEnabled = !!e.target.checked;
    drawAll();
  });
  themeToggle && themeToggle.addEventListener('change', (e) => {
    const checked = !!e.target.checked;
    document.documentElement.classList.toggle('theme-light', !checked);
  });
  gridSelect && gridSelect.addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    if ([13,15,19].includes(val)) {
      GRID = val;
      reset();
      setupCanvas();
    }
  });
  window.addEventListener('resize', setupCanvas);

  // 初始渲染
  setupCanvas();
})();