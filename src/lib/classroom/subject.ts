/** What a topic is about, so the classroom screen can look like it. Worked out for free from the words in the titles, or taken from the lesson's own tag. */
export type SubjectId =
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'math'
  | 'cs'
  | 'history'
  | 'language'
  | 'business'
  | 'arts'
  | 'health'
  | 'general';

export interface SubjectLook {
  id: SubjectId;
  label: string;
  glyph: string;
  /** background gradient, the main accent, a second accent and the quiet text colour */
  bg: [string, string];
  accent: string;
  accent2: string;
  dim: string;
}

export const SUBJECTS: Record<SubjectId, SubjectLook> = {
  physics: {
    id: 'physics',
    label: 'Physics',
    glyph: '⚛',
    bg: ['#07122b', '#10224f'],
    accent: '#4cc2ff',
    accent2: '#8b7bff',
    dim: '#86a9d6',
  },
  chemistry: {
    id: 'chemistry',
    label: 'Chemistry',
    glyph: '⬡',
    bg: ['#0b1d1a', '#12342d'],
    accent: '#3ddc97',
    accent2: '#c6f05b',
    dim: '#8cc7b4',
  },
  biology: {
    id: 'biology',
    label: 'Biology',
    glyph: '✿',
    bg: ['#0c1c14', '#17321f'],
    accent: '#6fe08a',
    accent2: '#ffd166',
    dim: '#9cc9a8',
  },
  math: {
    id: 'math',
    label: 'Mathematics',
    glyph: '∑',
    bg: ['#10142b', '#1d2352'],
    accent: '#ffb84d',
    accent2: '#6aa2ff',
    dim: '#9aa3d6',
  },
  cs: {
    id: 'cs',
    label: 'Computer science',
    glyph: '{ }',
    bg: ['#07110f', '#0d211e'],
    accent: '#43f0b2',
    accent2: '#4fa8ff',
    dim: '#7fbfae',
  },
  history: {
    id: 'history',
    label: 'History',
    glyph: '❖',
    bg: ['#241a12', '#3a2a1b'],
    accent: '#e8b86a',
    accent2: '#d9694c',
    dim: '#c4a98a',
  },
  language: {
    id: 'language',
    label: 'Language',
    glyph: '“',
    bg: ['#1c1230', '#2e1c4f'],
    accent: '#ff8fb8',
    accent2: '#ffd36a',
    dim: '#b9a3d6',
  },
  business: {
    id: 'business',
    label: 'Business',
    glyph: '↗',
    bg: ['#0b1a2b', '#12304d'],
    accent: '#3fd0c9',
    accent2: '#ffb347',
    dim: '#8fb5c9',
  },
  arts: {
    id: 'arts',
    label: 'Arts',
    glyph: '✦',
    bg: ['#2a1022', '#451a3a'],
    accent: '#ff7eb6',
    accent2: '#ffc857',
    dim: '#d6a3c4',
  },
  health: {
    id: 'health',
    label: 'Health',
    glyph: '✚',
    bg: ['#1b1020', '#2f1a38'],
    accent: '#ff6b81',
    accent2: '#5fd0ff',
    dim: '#cba0b5',
  },
  general: {
    id: 'general',
    label: 'Lesson',
    glyph: '◆',
    bg: ['#0a1124', '#10183a'],
    accent: '#2f7bff',
    accent2: '#7c4dff',
    dim: '#7f9bc0',
  },
};

const WORDS: [SubjectId, RegExp][] = [
  [
    'physics',
    /\b(physic|force|motion|newton|velocity|accelerat|energy|momentum|wave|optic|electric|magnet|circuit|thermo|quantum|relativ|gravity|kinemat|mechanic|pressure|current|voltage)/i,
  ],
  [
    'chemistry',
    /\b(chemi|molecul|atom|element|periodic|reaction|acid|base\b|bond|organic|compound|solution|mole\b|oxid|titrat|electrolys|polymer)/i,
  ],
  [
    'biology',
    /\b(biolog|cell|genetic|dna|rna|evolution|ecosystem|photosynth|organism|protein|enzyme|anatomy|botany|zoology|species|mitosis|meiosis|metabolism|neuron)/i,
  ],
  [
    'math',
    /\b(math|algebra|calculus|geometry|trigonometr|statistic|probabilit|equation|integral|derivative|matrix|vector|function|theorem|number theory|linear|arithmetic|logarithm)/i,
  ],
  [
    'cs',
    /\b(comput|program|algorithm|data structure|software|python|java|code|coding|database|network|machine learning|artificial|operating system|web develop|cyber|binary|compiler|cloud)/i,
  ],
  [
    'history',
    /\b(histor|war\b|empire|revolution|ancient|medieval|civilization|dynasty|colonial|independence|renaissance|century|treaty|politic|geograph|civics|constitution)/i,
  ],
  [
    'language',
    /\b(english|grammar|literature|poetry|poem|novel|essay|writing|vocabular|language|hindi|spanish|french|german|linguistic|phonetic|shakespeare|story|narrative)/i,
  ],
  [
    'business',
    /\b(econom|business|market|finance|account|management|invest|supply|demand|budget|profit|entrepreneur|startup|commerce|banking|trade)/i,
  ],
  [
    'arts',
    /\b(art\b|arts\b|music|painting|design|drama|theatre|dance|sculpt|film|photograph|architect|craft)/i,
  ],
  [
    'health',
    /\b(health|medic|nurs|anatomy|physiolog|disease|nutrition|patholog|pharmac|psycholog|clinical|first aid|fitness)/i,
  ],
];

const IDS = new Set<string>(Object.keys(SUBJECTS));

/** The subject of a topic. A tag the lesson carries wins; otherwise the words in the course and topic titles decide; otherwise it is a general lesson. */
export function subjectOf(titles: string[], tag?: string | null): SubjectLook {
  if (tag && IDS.has(tag)) return SUBJECTS[tag as SubjectId];
  const text = titles.join(' · ');
  for (const [id, re] of WORDS) if (re.test(text)) return SUBJECTS[id];
  return SUBJECTS.general;
}
