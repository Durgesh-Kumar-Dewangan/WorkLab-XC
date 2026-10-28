export const BUILTIN_ENVS = [
  { id: 'classroom', name: 'Lecture hall', note: 'A stage with a wide screen, two boards and warm wood panelling.' },
  { id: 'lab', name: 'Lab', note: 'Cooler lights, a bench and a dark grid floor.' },
  { id: 'void', name: 'Open stage', note: 'Just the screen and a soft floor. Fast on weak GPUs.' },
] as const;

export type BuiltinEnvId = (typeof BUILTIN_ENVS)[number]['id'];
