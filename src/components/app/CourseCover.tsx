'use client';

import { useMemo } from 'react';
import { Halftone } from '@/components/fx/Halftone';
import { subjectPainter } from '@/lib/fx/subject-painters';
import type { SubjectLook } from '@/lib/classroom/subject';

const OPTS = { pitch: 5, animate: false, srcW: 360, srcH: 160, fadeBottom: 0.1 } as const;

/** The dot-matrix picture on a course card, drawn for the course's subject. It follows the subject, so renaming a course redraws it. */
export function CourseCover({ look, seed }: { look: SubjectLook; seed: string }) {
  const paint = useMemo(() => subjectPainter(look.id, seed), [look.id, seed]);
  return (
    <Halftone paint={paint} options={OPTS} redrawKey={`${look.id}:${seed}`} label={`${look.label} cover`} />
  );
}
