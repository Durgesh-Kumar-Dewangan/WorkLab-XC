'use client';

import { forwardRef, useEffect, useId, useImperativeHandle, useReducer, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/controls';
import {
  SIM_SPECS,
  drawSim2D,
  makeSim,
  type Readout,
  type Sim,
  type SimKind,
  type SimParamValues,
} from '@/lib/domain/sim';
import { cssVar } from '@/lib/util';

export interface SimPanelHandle {
  sim: Sim;
  /** Reset the simulation, optionally overriding parameters (used when a slide carries a preset). */
  setParams(over?: SimParamValues): void;
}

interface Props {
  kind: SimKind;
  startParams?: SimParamValues;
  onDone?: (s: Sim) => void;
  onParam?: (p: SimParamValues) => void;
}

interface Engine {
  setPlay(on: boolean): void;
  reset(over?: SimParamValues): void;
  draw(): void;
  paintRead(): void;
}

export const simPalette = () => ({
  fg: cssVar('--fg'),
  fg3: cssVar('--fg3'),
  line: cssVar('--line'),
  blue: cssVar('--blue'),
  green: cssVar('--green'),
  amber: cssVar('--amber'),
  red: cssVar('--red'),
  violet: cssVar('--violet'),
  mono: cssVar('--mono'),
});

const SPEEDS = [
  { value: 0.5, label: '0.5×' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
];

/** Interactive 2D physics demo: canvas, play/reset/speed, parameter sliders, live readouts. Runs live in your browser. */
export const SimPanel = forwardRef<SimPanelHandle, Props>(function SimPanel(
  { kind, startParams, onDone, onParam },
  ref,
) {
  const spec = SIM_SPECS[kind];
  const [S] = useState(() => makeSim(kind, startParams));
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const speed = useRef(1);
  const cb = useRef({ onDone, onParam });
  const [playing, setPlaying] = useState(false);
  const [speedUi, setSpeedUi] = useState(1);
  const [reads, setReads] = useState<Readout[]>(() => S.readouts());
  const [summary, setSummary] = useState(() => S.summary());
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const uid = useId();

  useEffect(() => {
    cb.current = { onDone, onParam };
  });

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    let W = 300,
      H = 200,
      raf = 0,
      last = 0,
      since = 0,
      stopped = false;
    const size = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(100, r.width);
      H = Math.max(100, r.height);
      el.width = Math.round(W * dpr);
      el.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = () => {
      try {
        drawSim2D(S, ctx, W, H, simPalette());
      } catch (e) {
        console.error(e);
      }
    };
    const paintRead = () => {
      setReads(S.readouts());
      setSummary(S.summary());
    };
    const loop = (now: number) => {
      raf = 0;
      if (stopped) return;
      if (S.running) {
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
        last = now;
        const total = dt * speed.current;
        const sub = Math.max(1, Math.ceil(total / (1 / 120)));
        for (let i = 0; i < sub; i++) S.step(total / sub);
        draw();
        since += dt;
        if (since > 0.1) {
          since = 0;
          paintRead();
        }
        if (S.done) {
          setPlay(false);
          paintRead();
          cb.current.onDone?.(S);
        }
      }
      if (S.running) raf = requestAnimationFrame(loop);
    };
    const setPlay = (on: boolean) => {
      S.running = on;
      setPlaying(on);
      if (on) {
        last = 0;
        if (!raf) raf = requestAnimationFrame(loop);
      }
    };
    const reset = (over?: SimParamValues) => {
      S.reset(over);
      bump();
      size();
      draw();
      paintRead();
      setPlay(false);
    };
    engine.current = { setPlay, reset, draw, paintRead };

    const ro = new ResizeObserver(() => {
      size();
      draw();
    });
    ro.observe(el);
    const onTheme = () => draw();
    window.addEventListener('themechange', onTheme);
    size();
    draw();
    paintRead();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('themechange', onTheme);
      S.running = false;
      engine.current = null;
    };
  }, [S]);

  useImperativeHandle(ref, () => ({ sim: S, setParams: (over) => engine.current?.reset(over) }), [S]);

  const toggle = () => {
    const e = engine.current;
    if (!e) return;
    if (!S.running && S.done) S.reset();
    e.setPlay(!S.running);
    if (!S.running) e.paintRead();
  };

  return (
    <div className="simpanel">
      <div className="simstage">
        <canvas
          ref={canvas}
          className="simcanvas"
          role="img"
          aria-label={`${spec.title} demonstration. Use the controls below to change it.`}
        />
      </div>
      <div className="simbar">
        <button className="btn sm solid" type="button" aria-pressed={playing} onClick={toggle}>
          <Icon name={playing ? 'pause' : 'play'} size={14} />
          {playing ? 'Pause' : S.done ? 'Replay' : 'Play'}
        </button>
        <button className="btn sm" type="button" onClick={() => engine.current?.reset()}>
          <Icon name="replay" size={14} />
          Reset
        </button>
        <Segmented
          ariaLabel="Speed"
          options={SPEEDS}
          value={speedUi}
          onChange={(v) => {
            speed.current = v;
            setSpeedUi(v);
          }}
        />
      </div>
      <div className="sims">
        {spec.params.map((sp) => {
          const id = `${uid}-${sp.k}`;
          const v = S.p[sp.k];
          const dp = sp.step < 1 ? (sp.step < 0.1 ? 2 : 1) : 0;
          return (
            <div className="sim-sl" key={sp.k}>
              <label htmlFor={id}>{sp.label}</label>
              <input
                type="range"
                id={id}
                min={sp.min}
                max={sp.max}
                step={sp.step}
                value={v}
                style={{ '--pct': `${((v - sp.min) / (sp.max - sp.min)) * 100}%` } as React.CSSProperties}
                onChange={(e) => {
                  S.p[sp.k] = +e.target.value;
                  const was = S.running;
                  S.reset();
                  bump();
                  engine.current?.draw();
                  engine.current?.paintRead();
                  if (was) engine.current?.setPlay(true);
                  cb.current.onParam?.(S.p);
                }}
              />
              <output htmlFor={id}>{`${(+v).toFixed(dp)}${sp.unit ? ` ${sp.unit}` : ''}`}</output>
            </div>
          );
        })}
      </div>
      <dl className="readouts" aria-live="off">
        {reads.map(([k, val, u]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{val + (u ? ` ${u}` : '')}</dd>
          </div>
        ))}
      </dl>
      <div className="sr" aria-live="polite">
        {summary}
      </div>
    </div>
  );
});
