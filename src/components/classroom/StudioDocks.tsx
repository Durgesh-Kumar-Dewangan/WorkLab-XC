'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Segmented, Switch } from '@/components/ui/controls';
import { api } from '@/lib/api/client';
import type { ClassroomController, ClassroomSnapshot } from '@/lib/classroom/controller';
import { CAM_KEYS, CAM_PRESETS } from '@/lib/classroom/timeline';
import { useApp } from '@/lib/store';
import type { Quality, Settings } from '@/lib/store/types';

type Build = 'built' | 'model' | 'pavilion' | 'forest' | 'collab' | 'three';

/** The things in the scene that can be switched on and off from the Layers tab. */
export const LAYERS: { id: string; label: string; icon: 'monitor' | 'grid' | 'target' | 'image' | 'mountain' }[] = [
  { id: 'screen', label: 'Slide screen', icon: 'monitor' },
  { id: 'boardLeft', label: 'Left board (the words)', icon: 'grid' },
  { id: 'boardRight', label: 'Right board (question or formula)', icon: 'grid' },
  { id: 'demo', label: 'Physics model', icon: 'target' },
  { id: 'scenery', label: 'Scenery picture', icon: 'mountain' },
];

/** Tells the 3D scene to show or hide a layer. The Babylon.js classroom listens for this. */
export function emitLayer(id: string, visible: boolean) {
  window.dispatchEvent(new CustomEvent('wlxc-layer', { detail: { id, visible } }));
}

const buildOf = (s: Settings): Build => (s.engine === 'three' ? 'three' : s.hall === 'model' ? 'model' : s.hall === 'pavilion' ? 'pavilion' : s.hall === 'forest' ? 'forest' : s.hall === 'collab' ? 'collab' : 'built');

/** The design-tool layout for the classroom: slides and layers on the left, style controls on the right. */
export function StudioDocks({ ctrl, snap, ready }: { ctrl: ClassroomController; snap: ClassroomSnapshot; ready: boolean }) {
  const [left, setLeft] = useState<'slides' | 'layers'>('slides');
  const [right, setRight] = useState<'style' | 'slide'>('style');
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [scenes, setScenes] = useState<{ id: string; title: string }[]>([]);
  const S = useApp((s) => s.settings);
  const upd = useApp((s) => s.updateSettings);
  const set = (fn: (s: Settings) => void) => upd(fn);
  const slides = ctrl.topic.slides;
  const slide = slides[snap.idx];

  useEffect(() => {
    api<{ items: { id: string; title: string }[] }>('/backdrops')
      .then((r) => setScenes(r.items))
      .catch(() => setScenes([]));
  }, []);
  // the scene is rebuilt when the hall changes, so the hidden layers are sent again
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => Object.entries(off).forEach(([id, hidden]) => hidden && emitLayer(id, false)), 600);
    return () => window.clearTimeout(t);
  }, [ready, off, S.hall, S.engine, S.backdrop]);

  const toggle = (id: string) => {
    const hidden = !off[id];
    setOff({ ...off, [id]: hidden });
    emitLayer(id, !hidden);
  };

  return (
    <>
      <aside className="st-dock st-left" aria-label="Slides and layers">
        <div className="st-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={left === 'slides'} onClick={() => setLeft('slides')}>
            Slides
          </button>
          <button type="button" role="tab" aria-selected={left === 'layers'} onClick={() => setLeft('layers')}>
            Layers
          </button>
        </div>
        {left === 'slides' ? (
          <ol className="st-list">
            {slides.map((s, i) => (
              <li key={i}>
                <button type="button" className={i === snap.idx ? 'on' : ''} aria-current={i === snap.idx ? 'true' : undefined} onClick={() => ctrl.goSlide(i)}>
                  <span className="st-n">{i + 1}</span>
                  <span className="st-t">{s.t}</span>
                  <span className="st-k">{s.cam}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <ul className="st-list">
            {LAYERS.map((l) => (
              <li key={l.id}>
                <button type="button" className={off[l.id] ? 'dim' : ''} onClick={() => toggle(l.id)} aria-pressed={!off[l.id]}>
                  <Icon name={l.icon} size={15} />
                  <span className="st-t">{l.label}</span>
                  <span className="st-k">{off[l.id] ? 'Hidden' : 'Visible'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <aside className="st-dock st-right" aria-label="Style">
        <div className="st-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={right === 'style'} onClick={() => setRight('style')}>
            Style
          </button>
          <button type="button" role="tab" aria-selected={right === 'slide'} onClick={() => setRight('slide')}>
            Slide
          </button>
        </div>
        {right === 'style' ? (
          <div className="st-body">
            <h3>Camera</h3>
            <Segmented
              ariaLabel="Camera"
              value={snap.cam ?? 'board'}
              onChange={(v) => ctrl.setCam(v, true)}
              options={CAM_KEYS.map((k) => ({ value: k, label: CAM_PRESETS[k].label }))}
            />
            <div className="st-row">
              <span>Zoom</span>
              <span className="st-btns">
                <button type="button" className="btn xs" aria-label="Zoom out" onClick={() => ctrl.zoom(1.2)}>
                  −
                </button>
                <button type="button" className="btn xs" aria-label="Zoom in" onClick={() => ctrl.zoom(0.83)}>
                  +
                </button>
              </span>
            </div>
            <div className="st-row">
              <span>Follow the lesson</span>
              <Switch checked={snap.autoCam} onChange={() => ctrl.toggleAutoCam()} label="Follow the lesson with the camera" />
            </div>

            <h3>Room</h3>
            <label className="st-field">
              <span>Build</span>
              <select
                className="select"
                value={buildOf(S)}
                onChange={(e) => {
                  const v = e.target.value as Build;
                  set((s) => {
                    s.engine = v === 'three' ? 'three' : 'babylon';
                    if (v !== 'three') s.hall = v;
                  });
                }}
              >
                <option value="built">New hall</option>
                <option value="pavilion">Open-air</option>
                <option value="forest">Forest deck</option>
                <option value="collab">Collab hall</option>
                <option value="model">Stage model</option>
                <option value="three">three.js</option>
              </select>
            </label>
            <label className="st-field">
              <span>Scenery</span>
              <select className="select" value={S.backdrop ?? 'queue'} onChange={(e) => set((s) => void (s.backdrop = e.target.value))}>
                <option value="queue">Queue (changes by itself)</option>
                {scenes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="st-field">
              <span>Brightness {Math.round((S.exposure ?? 1) * 100)}%</span>
              <input type="range" min={60} max={160} step={5} value={Math.round((S.exposure ?? 1) * 100)} onChange={(e) => set((s) => void (s.exposure = Number(e.target.value) / 100))} />
            </label>
            <div className="st-field">
              <span>Quality</span>
              <Segmented<Quality>
                ariaLabel="Quality"
                value={S.quality}
                onChange={(v) => set((s) => void (s.quality = v))}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                ]}
              />
            </div>
            <div className="st-row">
              <span>Halftone dots</span>
              <Switch checked={snap.halftone} onChange={() => ctrl.toggleHalftone()} label="Halftone view" />
            </div>
            <div className="st-row">
              <span>Captions</span>
              <Switch checked={snap.captions} onChange={() => ctrl.toggleCaptions()} label="Captions" />
            </div>
          </div>
        ) : (
          <div className="st-body">
            <h3>Slide {snap.idx + 1} of {slides.length}</h3>
            <p className="st-title">{slide?.t}</p>
            <ul className="st-bullets">{slide?.b.map((b, i) => <li key={i}>{b}</li>)}</ul>
            <h3>Said aloud</h3>
            <p className="st-say">{slide?.say}</p>
            <div className="st-row">
              <button type="button" className="btn xs" disabled={snap.idx === 0} onClick={() => ctrl.goSlide(snap.idx - 1)}>
                Previous
              </button>
              <button type="button" className="btn xs" disabled={snap.idx >= slides.length - 1} onClick={() => ctrl.goSlide(snap.idx + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
