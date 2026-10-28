'use client';

import type { ClassroomController, InspectInfo } from '@/lib/classroom/controller';
import { Box } from './primitives';
import { usePick } from './pick';
import { Demo } from './Demos';
import { STAGE_Y } from './layout';

const INFO: InspectInfo = {
  title: 'Demonstration stage',
  body: 'Physical models for the lesson run here. Open the Model tab to change their parameters.',
};

export function Stage({ ctrl }: { ctrl: ClassroomController }) {
  const pick = usePick(ctrl, INFO);
  // a topic without a physical model has nothing to put on the model stage, so it stays empty
  if (ctrl.topic.demo === 'concept') return null;
  return (
    <group position={[3.6, STAGE_Y, -2.0]}>
      <Box size={[3.6, 0.18, 2.6]} pos={[0, 0.09, 0]} color="#1b2036" rough={0.4} metal={0.3} {...pick} />
      <Box
        size={[3.64, 0.02, 2.64]}
        pos={[0, 0.185, 0]}
        color="#2f7bff"
        emissive="#2f7bff"
        ei={0.9}
        cast={false}
      />
      <group position={[0, 0.19, 0]}>
        <Demo ctrl={ctrl} />
      </group>
    </group>
  );
}
