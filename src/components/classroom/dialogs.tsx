'use client';

import { Segmented, Switch } from '@/components/ui/controls';
import { useApp } from '@/lib/store';
import { closeModal, openModal } from '@/lib/ui/modal';
import type { ClassroomController } from '@/lib/classroom/controller';
import type { Quality } from '@/lib/store/types';

function SettingsBody({ ctrl }: { ctrl: ClassroomController }) {
  const quality = useApp((s) => s.settings.quality);
  const captions = useApp((s) => s.settings.captions);
  const update = useApp.getState().updateSettings;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="field">
        <label>3D quality</label>
        <Segmented<Quality>
          ariaLabel="3D quality"
          value={quality}
          onChange={(v) =>
            update((s) => {
              s.quality = v;
            })
          }
          options={[
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
          ]}
        />
        <span className="small">Low turns shadows off and caps resolution. It applies straight away.</span>
      </div>
      <div className="row">
        <Switch
          label="Captions"
          checked={captions}
          onChange={(v) => {
            update((s) => {
              s.captions = v;
            });
            ctrl.setCaptions(v);
          }}
        />
        <span>Captions</span>
      </div>
    </div>
  );
}

export function openClassroomSettings(ctrl: ClassroomController) {
  openModal({
    title: 'Classroom settings',
    body: <SettingsBody ctrl={ctrl} />,
    actions: [{ label: 'Done', kind: 'solid' }],
  });
}

const ROWS: [string, string][] = [
  ['Space', 'Play or pause'],
  ['← →', 'Previous or next slide'],
  ['1 2 3', 'Camera: board, model, overview'],
  ['C', 'Captions'],
  ['M', 'Spoken narration'],
  ['H', 'Halftone view'],
  ['P', 'Side panel'],
  ['F', 'Full screen'],
  ['L', 'Lecture only: hide or show the controls'],
  ['G', 'Revision game'],
  ['Mouse', 'Drag to orbit, right-drag to pan, scroll to zoom'],
  ['Click', 'Select an object to inspect'],
];

export function openClassroomHelp() {
  openModal({
    title: 'Keyboard and mouse',
    body: (
      <dl className="kv" style={{ gap: '10px 22px' }}>
        {ROWS.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>
              <span className="kbd">{k}</span>
            </dt>
            <dd style={{ textAlign: 'left' }}>{v}</dd>
          </div>
        ))}
      </dl>
    ),
    actions: [{ label: 'Close', kind: 'solid' }],
  });
}
export { closeModal };
