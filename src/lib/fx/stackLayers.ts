/* Illustrated layers for the exploded "What you get" stack. Drawn once onto a 480×480 canvas each. */
const S = 480;
const MONO = '"JetBrains Mono Variable","JetBrains Mono",ui-monospace,monospace';
const SANS = '"DM Sans Variable","DM Sans",system-ui,sans-serif';

type Dash = number[] | undefined;

export function paintStackLayer(canvas: HTMLCanvasElement, i: number): void {
  canvas.width = S;
  canvas.height = S;
  const c = canvas.getContext('2d');
  if (!c) return;

  const rr = (x: number, y: number, w: number, hh: number, r: number) => {
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, hh, r);
    else c.rect(x, y, w, hh);
  };
  const fillRR = (
    x: number,
    y: number,
    w: number,
    hh: number,
    r: number,
    fill?: string | CanvasGradient | null,
    stroke?: string | null,
    lw?: number,
  ) => {
    rr(x, y, w, hh, r);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = lw || 2;
      c.stroke();
    }
  };
  const txt = (
    s: string,
    x: number,
    y: number,
    size: number,
    col: string,
    weight?: number,
    font?: string | null,
    align?: CanvasTextAlign,
  ) => {
    c.font = `${weight || 500} ${size}px ${font || SANS}`;
    c.fillStyle = col;
    c.textAlign = align || 'left';
    c.textBaseline = 'middle';
    c.fillText(s, x, y);
  };
  const arrow = (x1: number, y1: number, x2: number, y2: number, col: string, dash?: Dash) => {
    c.strokeStyle = col;
    c.fillStyle = col;
    c.lineWidth = 3;
    c.setLineDash(dash || []);
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
    c.setLineDash([]);
    const a = Math.atan2(y2 - y1, x2 - x1);
    c.beginPath();
    c.moveTo(x2, y2);
    c.lineTo(x2 - 12 * Math.cos(a - 0.4), y2 - 12 * Math.sin(a - 0.4));
    c.lineTo(x2 - 12 * Math.cos(a + 0.4), y2 - 12 * Math.sin(a + 0.4));
    c.closePath();
    c.fill();
  };

  if (i === 0) {
    // source: a paper page with the selected line marked
    const g = c.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#f8f9fd');
    g.addColorStop(1, '#dde0ee');
    fillRR(0, 0, S, S, 26, g);
    fillRR(36, 34, 230, 20, 5, '#1b1b2a');
    fillRR(36, 64, 140, 10, 4, '#9094ac');
    txt('physics-101.pdf', S - 36, 44, 14, '#6f7390', 500, MONO, 'right');
    const rows: [string, string, number, string?, number?][] = [
      ['2', 'h', 0.6, 'p.3'],
      ['2.1', 't', 0.48, 'p.3'],
      ['', 'b', 0.84],
      ['', 'b', 0.7],
      ['2.2', 't', 0.58, 'p.4'],
      ['', 'b', 0.8],
      ['2.3', 't', 0.66, 'p.4', 1],
      ['', 'b', 0.78],
      ['', 'b', 0.5],
      ['2.4', 't', 0.46, 'p.5'],
      ['', 'b', 0.8],
      ['2.5', 't', 0.3, 'p.5'],
      ['', 'b', 0.72],
      ['', 'b', 0.42],
    ];
    rows.forEach((r, k) => {
      const y = 106 + k * 25;
      if (r[4]) {
        fillRR(26, y - 10, S - 52, 26, 6, 'rgba(255,170,60,.38)');
        fillRR(26, y - 10, 5, 26, 2, '#ff9a1f');
      }
      if (r[0]) txt(r[0], 44, y + 3, 14, '#e0692a', 700, MONO);
      const bw = (S - 190) * r[2];
      fillRR(
        92,
        y - (r[1] === 'h' ? 5 : 3),
        bw,
        r[1] === 'h' ? 14 : r[1] === 't' ? 10 : 7,
        4,
        r[1] === 'h' ? '#1b1b2a' : r[1] === 't' ? '#3b3e57' : '#b8bcd0',
      );
      if (r[3]) txt(r[3], S - 40, y + 3, 14, '#5b4bd1', 700, MONO, 'right');
    });
  } else if (i === 1) {
    // structure: course tree
    fillRR(0, 0, S, S, 26, '#150b36');
    fillRR(2, 2, S - 4, S - 4, 25, null, 'rgba(182,144,255,.5)', 2);
    const unitX = [92, 240, 388];
    c.strokeStyle = '#8c6bd8';
    c.lineWidth = 3;
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(240, 76);
    c.lineTo(240, 98);
    c.moveTo(92, 98);
    c.lineTo(388, 98);
    unitX.forEach((x) => {
      c.moveTo(x, 98);
      c.lineTo(x, 124);
    });
    c.stroke();
    unitX.forEach((x) => {
      c.beginPath();
      c.moveTo(x, 158);
      c.lineTo(x, 262);
      c.stroke();
    });
    fillRR(168, 36, 144, 40, 12, '#3b2390', '#d6c2ff', 2);
    txt('Course', 240, 56, 18, '#fff', 700, null, 'center');
    const topics = [
      ['Vectors', 'Velocity'],
      ['Force', 'Newton’s 2nd'],
      ['Energy', 'Work'],
    ];
    unitX.forEach((x, k) => {
      fillRR(x - 62, 124, 124, 36, 11, '#2a1a62', '#b690ff', 2);
      txt(`Unit ${k + 1}`, x, 142, 16, '#efe8ff', 700, null, 'center');
      topics[k].forEach((tp, j) => {
        const hot = k === 1 && j === 1;
        fillRR(
          x - 58,
          190 + j * 70 - 18,
          116,
          36,
          10,
          hot ? '#7c4dff' : '#1f1348',
          hot ? '#e7dcff' : '#6d52b8',
          2,
        );
        txt(tp, x, 190 + j * 70, 15, '#fff', hot ? 700 : 500, null, 'center');
      });
    });
    ['Edit', 'Merge', 'Split'].forEach((t2, k) => {
      fillRR(120 + k * 90, 372, 76, 30, 15, null, 'rgba(214,194,255,.55)', 1.5);
      txt(t2, 158 + k * 90, 387, 14, '#d6c2ff', 600, null, 'center');
    });
    txt(
      'You review the tree before anything is built on it',
      240,
      436,
      14,
      'rgba(214,194,255,.8)',
      500,
      null,
      'center',
    );
  } else if (i === 2) {
    // graph: typed links between named topics
    fillRR(0, 0, S, S, 26, '#06142e');
    fillRR(2, 2, S - 4, S - 4, 25, null, 'rgba(111,176,255,.5)', 2);
    c.fillStyle = 'rgba(111,176,255,.16)';
    for (let x = 24; x < S; x += 24) for (let y = 24; y < S; y += 24) c.fillRect(x, y, 2, 2);
    const P: Record<string, [number, number, string, string]> = {
      vel: [14, 70, 'Velocity', 'ok'],
      acc: [178, 70, 'Acceleration', 'ok'],
      frc: [14, 214, 'Force', 'weak'],
      n2: [178, 214, 'Newton’s 2nd', 'now'],
      fri: [346, 120, 'Friction', ''],
      wrk: [346, 314, 'Work', 'inf'],
    };
    const pw = 118,
      ph = 40;
    const ctr = (k: string): [number, number] => [P[k][0] + pw / 2, P[k][1] + ph / 2];
    const edge = (a: string, b: string, col: string, dash?: Dash) => {
      const [x1, y1] = ctr(a);
      const [x2, y2] = ctr(b);
      const dx = x2 - x1,
        dy = y2 - y1;
      const d = Math.hypot(dx, dy),
        ux = dx / d,
        uy = dy / d;
      const s = Math.min(
        Math.abs(ux) > 1e-3 ? (pw / 2 + 4) / Math.abs(ux) : 1e9,
        Math.abs(uy) > 1e-3 ? (ph / 2 + 4) / Math.abs(uy) : 1e9,
      );
      arrow(x1 + ux * s, y1 + uy * s, x2 - ux * s, y2 - uy * s, col, dash);
    };
    edge('vel', 'acc', '#9cc4ff');
    edge('acc', 'n2', '#9cc4ff');
    edge('frc', 'n2', '#9cc4ff');
    edge('n2', 'fri', '#9cc4ff');
    edge('n2', 'wrk', '#ffb84d', [8, 7]);
    Object.values(P).forEach(([x, y, l, st]) => {
      const fill = st === 'now' ? '#1c6bff' : '#0e2347';
      const stroke =
        st === 'ok'
          ? '#59f286'
          : st === 'weak'
            ? '#ffb84d'
            : st === 'now'
              ? '#cfe3ff'
              : st === 'inf'
                ? '#ffb84d'
                : '#5f87c9';
      fillRR(x, y, pw, ph, 20, fill, stroke, 2.5);
      txt(l, x + pw / 2, y + ph / 2 + 1, 15, '#fff', 600, null, 'center');
    });
    txt('requires', 70, 420, 14, '#9cc4ff', 500, MONO);
    arrow(30, 420, 58, 420, '#9cc4ff');
    txt('inferred, to review', 290, 420, 14, '#ffb84d', 500, MONO);
    arrow(236, 420, 274, 420, '#ffb84d', [6, 5]);
    c.fillStyle = '#59f286';
    c.beginPath();
    c.arc(30, 450, 6, 0, 6.3);
    c.fill();
    txt('strong', 44, 450, 14, '#b6c8e8', 500, MONO);
    c.fillStyle = '#ffb84d';
    c.beginPath();
    c.arc(140, 450, 6, 0, 6.3);
    c.fill();
    txt('weak, revise first', 154, 450, 14, '#b6c8e8', 500, MONO);
  } else {
    // lessons: board, timeline, question
    const g = c.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#fbfbfe');
    g.addColorStop(1, '#c3c6d8');
    fillRR(0, 0, S, S, 26, g);
    fillRR(2, 2, S - 4, S - 4, 25, null, 'rgba(255,255,255,.85)', 3);
    fillRR(28, 28, 424, 236, 18, '#0f0f1a');
    ['#ff6b7a', '#ffb84d', '#59f286'].forEach((col, k) => {
      c.fillStyle = col;
      c.beginPath();
      c.arc(52 + k * 18, 50, 5, 0, 6.3);
      c.fill();
    });
    txt('Newton’s second law', 452 - 24, 50, 14, '#8a8aa0', 500, MONO, 'right');
    txt('F = m·a', 56, 112, 56, '#fff', 700);
    fillRR(56, 170, 118, 38, 8, '#7c4dff');
    c.fillStyle = '#e8e0ff';
    [86, 146].forEach((x) => {
      c.beginPath();
      c.arc(x, 214, 11, 0, 6.3);
      c.fill();
    });
    txt('2 kg', 115, 189, 16, '#fff', 700, null, 'center');
    arrow(184, 189, 312, 189, '#59f286');
    txt('a = 3 m/s²', 326, 189, 19, '#59f286', 700);
    c.fillStyle = 'rgba(255,255,255,.85)';
    c.beginPath();
    c.arc(400, 128, 15, 0, 6.3);
    c.fill();
    fillRR(380, 148, 40, 56, 14, 'rgba(255,255,255,.85)');
    fillRR(28, 288, 424, 10, 5, '#b9bdd1');
    fillRR(28, 288, 424 * 0.55, 10, 5, '#7c4dff');
    c.fillStyle = '#fff';
    c.strokeStyle = '#7c4dff';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(28 + 424 * 0.55, 293, 11, 0, 6.3);
    c.fill();
    c.stroke();
    txt('00:24', 28, 322, 13, '#55587a', 500, MONO);
    txt('01:20', 452, 322, 13, '#55587a', 500, MONO, 'right');
    [
      ['A', '3 N'],
      ['B', '6 N'],
      ['C', '9 N'],
    ].forEach((o, k) => {
      const x = 28 + k * 144;
      const sel = k === 1;
      fillRR(x, 346, 136, 44, 22, sel ? '#7c4dff' : '#f3f4fa', sel ? null : '#9a9db6', 2);
      txt(`${o[0]}   ${o[1]}`, x + 68, 369, 17, sel ? '#fff' : '#2b2d44', 700, null, 'center');
    });
    txt('Check in · question 2 of 3', 28, 424, 14, '#55587a', 500, MONO);
    fillRR(28, 442, 424, 12, 6, '#e1e3ee');
  }
}
