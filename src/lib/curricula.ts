/**
 * Every syllabus or curriculum a learner can pick, grouped by where they study.
 * The server only checks that the value looks like a short code, so adding a line here is all it takes to add one.
 * Values are stable codes (never rename one that is already in use, add a new line instead).
 */
export interface Curriculum {
  value: string;
  label: string;
}
type Pair = readonly [string, string];
const list = (rows: readonly Pair[]): Curriculum[] => rows.map(([value, label]) => ({ value, label }));

/** Taught in schools around the world, whichever country the learner is in. */
export const INTERNATIONAL: Curriculum[] = list([
  ['ib_pyp', 'IB Primary Years (PYP)'],
  ['ib_myp', 'IB Middle Years (MYP)'],
  ['ib_dp', 'IB Diploma (DP)'],
  ['ib_cp', 'IB Career-related (CP)'],
  ['cambridge_primary', 'Cambridge Primary'],
  ['cambridge_lower', 'Cambridge Lower Secondary'],
  ['igcse', 'Cambridge IGCSE'],
  ['cambridge_alevel', 'Cambridge AS and A Level'],
  ['edexcel_igcse', 'Pearson Edexcel International GCSE'],
  ['edexcel_ial', 'Pearson Edexcel International A Level'],
  ['ap', 'AP (Advanced Placement)'],
  ['us_curriculum_intl', 'American curriculum (international school)'],
  ['british_intl', 'British curriculum (international school)'],
  ['french_lycee', 'French system abroad (AEFE / Lycée)'],
  ['german_school_abroad', 'German school abroad'],
  ['montessori', 'Montessori'],
  ['homeschool', 'Homeschool'],
]);

/** Entrance, language and professional exams that people sit in any country. */
export const EXAMS: Curriculum[] = list([
  ['sat', 'SAT'],
  ['act', 'ACT'],
  ['psat', 'PSAT / NMSQT'],
  ['gre', 'GRE'],
  ['gmat', 'GMAT'],
  ['lsat', 'LSAT'],
  ['mcat', 'MCAT'],
  ['usmle', 'USMLE / medical licensing'],
  ['toefl', 'TOEFL'],
  ['ielts', 'IELTS'],
  ['pte', 'PTE Academic'],
  ['duolingo_test', 'Duolingo English Test'],
  ['cfa', 'CFA'],
  ['acca', 'ACCA'],
  ['cpa', 'CPA'],
  ['pmp', 'PMP / project management'],
  ['aws_cloud', 'Cloud certifications (AWS, Azure, Google)'],
  ['cisco_comptia', 'CompTIA / Cisco / IT certifications'],
  ['bar_exam', 'Bar exam / law'],
  ['nclex', 'NCLEX / nursing'],
]);

/** Not tied to one country. */
export const GENERAL: Curriculum[] = list([
  ['university', 'College / university degree'],
  ['postgraduate', 'Postgraduate / master’s / PhD'],
  ['vocational', 'Vocational / technical training'],
  ['online_course', 'Online course / MOOC'],
  ['language_learning', 'Language learning'],
  ['self_study', 'Self-study / personal interest'],
  ['other', 'Something else'],
]);

interface Country {
  code: string;
  curricula: Curriculum[];
}
const c = (code: string, rows: readonly Pair[]): Country => ({ code, curricula: list(rows) });

/** National and regional curricula and exams, by ISO 3166 country code. */
const NATIONAL: Country[] = [
  c('IN', [
    ['ncert', 'NCERT / CBSE school'],
    ['cbse', 'CBSE (other)'],
    ['icse', 'ICSE / ISC'],
    ['state_board', 'State board'],
    ['nios', 'NIOS (open schooling)'],
    ['jee', 'JEE (Main / Advanced)'],
    ['neet', 'NEET'],
    ['cuet', 'CUET'],
    ['upsc', 'UPSC / civil services'],
    ['gate', 'GATE'],
    ['cat', 'CAT / MBA entrance'],
    ['ca_icai', 'CA (ICAI)'],
    ['clat', 'CLAT / law entrance'],
    ['ssc_banking', 'SSC / banking / railways'],
  ]),
  c('US', [
    ['us_common_core', 'Common Core (K–12)'],
    ['us_state_standards', 'State standards (TEKS, NGSS and others)'],
    ['us_honors', 'Honors / college prep'],
    ['us_ged', 'GED / HiSET'],
    ['us_community_college', 'Community college'],
    ['us_undergrad', 'US college (undergraduate)'],
  ]),
  c('GB', [
    ['gb_national', 'National Curriculum (Key Stages 1–4)'],
    ['gb_gcse', 'GCSE'],
    ['gb_alevel', 'A-levels'],
    ['gb_btec', 'BTEC / T-levels'],
    ['gb_scottish', 'Scottish (National 5 / Higher)'],
    ['gb_welsh', 'Welsh curriculum (WJEC)'],
    ['gb_ni', 'Northern Ireland (CCEA)'],
    ['gb_eleven_plus', '11+ / grammar school'],
  ]),
  c('CA', [
    ['ca_ontario', 'Ontario'],
    ['ca_bc', 'British Columbia'],
    ['ca_alberta', 'Alberta'],
    ['ca_quebec', 'Québec (secondary / CEGEP)'],
    ['ca_other_province', 'Another province or territory'],
  ]),
  c('AU', [
    ['au_ac', 'Australian Curriculum (F–10)'],
    ['au_vce', 'VCE (Victoria)'],
    ['au_hsc', 'HSC (New South Wales)'],
    ['au_qce', 'QCE (Queensland)'],
    ['au_wace', 'WACE (Western Australia)'],
    ['au_sace', 'SACE (South Australia)'],
    ['au_other_senior', 'Other senior certificate'],
    ['au_tafe', 'TAFE / vocational (VET)'],
  ]),
  c('NZ', [
    ['nz_nzc', 'New Zealand Curriculum'],
    ['nz_ncea', 'NCEA'],
    ['nz_scholarship', 'NZ Scholarship'],
  ]),
  c('IE', [
    ['ie_junior_cycle', 'Junior Cycle'],
    ['ie_leaving_cert', 'Leaving Certificate'],
  ]),
  c('SG', [
    ['sg_moe', 'MOE school (PSLE / O-Level / N-Level)'],
    ['sg_alevel', 'GCE A-Level'],
    ['sg_poly', 'Polytechnic / ITE'],
  ]),
  c('MY', [
    ['my_kssr', 'KSSR / KSSM'],
    ['my_spm', 'SPM'],
    ['my_stpm', 'STPM / matriculation'],
    ['my_upsr_pt3', 'UPSR / PT3'],
  ]),
  c('ID', [
    ['id_merdeka', 'Kurikulum Merdeka / K13'],
    ['id_utbk', 'UTBK-SNBT (university entrance)'],
  ]),
  c('PH', [
    ['ph_k12', 'K–12 (DepEd)'],
    ['ph_college', 'College (CHED)'],
    ['ph_board_exams', 'Professional board exams'],
  ]),
  c('TH', [
    ['th_basic', 'Basic Education Core Curriculum'],
    ['th_tcas', 'TCAS / university entrance'],
  ]),
  c('VN', [
    ['vn_gdpt', 'GDPT 2018 (general education)'],
    ['vn_thpt', 'High-school graduation (THPT)'],
  ]),
  c('CN', [
    ['cn_compulsory', 'Compulsory education (primary and junior)'],
    ['cn_zhongkao', 'Zhongkao'],
    ['cn_gaokao', 'Gaokao'],
    ['cn_kaoyan', 'Kaoyan (postgraduate entrance)'],
  ]),
  c('JP', [
    ['jp_mext', 'MEXT course of study'],
    ['jp_common_test', 'Common Test for University Admissions'],
  ]),
  c('KR', [
    ['kr_national', 'National curriculum'],
    ['kr_csat', 'CSAT (Suneung)'],
  ]),
  c('HK', [
    ['hk_dse', 'HKDSE'],
    ['hk_local', 'Hong Kong local curriculum'],
  ]),
  c('TW', [
    ['tw_12year', '12-year Basic Education'],
    ['tw_gsat', 'GSAT / AST'],
  ]),
  c('PK', [
    ['pk_federal', 'Federal Board (FBISE)'],
    ['pk_provincial', 'Provincial boards (Punjab, Sindh, KP…)'],
    ['pk_matric_fsc', 'Matric / FSc / FA'],
    ['pk_mdcat_ecat', 'MDCAT / ECAT'],
    ['pk_css', 'CSS'],
  ]),
  c('BD', [
    ['bd_nctb', 'NCTB curriculum'],
    ['bd_ssc_hsc', 'SSC / HSC'],
    ['bd_madrasa', 'Madrasa board'],
  ]),
  c('LK', [
    ['lk_ol', 'GCE O/L'],
    ['lk_al', 'GCE A/L'],
  ]),
  c('NP', [
    ['np_see', 'SEE (Grade 10)'],
    ['np_neb', 'NEB (Grade 11–12)'],
  ]),
  c('AE', [
    ['ae_moe', 'UAE Ministry of Education'],
    ['ae_emsat', 'EmSAT'],
  ]),
  c('SA', [
    ['sa_moe', 'Saudi national curriculum'],
    ['sa_qiyas', 'Qudurat / Tahsili (Qiyas)'],
  ]),
  c('QA', [['qa_moe', 'Qatar national curriculum']]),
  c('KW', [['kw_moe', 'Kuwait national curriculum']]),
  c('JO', [['jo_tawjihi', 'Tawjihi']]),
  c('EG', [
    ['eg_national', 'Egyptian national curriculum'],
    ['eg_thanaweya', 'Thanaweya Amma'],
  ]),
  c('TR', [
    ['tr_meb', 'MEB curriculum'],
    ['tr_yks', 'YKS (TYT / AYT)'],
  ]),
  c('IL', [['il_bagrut', 'Bagrut']]),
  c('IR', [['ir_konkur', 'Konkur']]),
  c('NG', [
    ['ng_national', 'Nigerian national curriculum'],
    ['ng_waec', 'WAEC (WASSCE)'],
    ['ng_neco', 'NECO'],
    ['ng_jamb', 'JAMB (UTME)'],
  ]),
  c('GH', [
    ['gh_national', 'Ghana national curriculum'],
    ['gh_bece', 'BECE'],
    ['gh_wassce', 'WASSCE'],
  ]),
  c('KE', [
    ['ke_cbc', 'CBC (Competency Based Curriculum)'],
    ['ke_844', '8-4-4 (KCPE / KCSE)'],
  ]),
  c('UG', [
    ['ug_national', 'Uganda national curriculum'],
    ['ug_uce_uace', 'UCE / UACE'],
  ]),
  c('TZ', [
    ['tz_national', 'Tanzania national curriculum'],
    ['tz_necta', 'NECTA (CSEE / ACSEE)'],
  ]),
  c('ET', [['et_national', 'Ethiopian national curriculum and exams']]),
  c('ZA', [
    ['za_caps', 'CAPS (NSC / Matric)'],
    ['za_ieb', 'IEB'],
  ]),
  c('ZW', [['zw_zimsec', 'ZIMSEC']]),
  c('ZM', [['zm_national', 'Zambia national curriculum']]),
  c('RW', [['rw_cbc', 'Rwanda competence-based curriculum']]),
  c('CM', [['cm_gce_bac', 'GCE / Baccalauréat (Cameroon)']]),
  c('SN', [['sn_bac', 'Baccalauréat (Sénégal)']]),
  c('MA', [['ma_bac', 'Baccalauréat (Maroc)']]),
  c('DZ', [['dz_bac', 'Baccalauréat (Algérie)']]),
  c('TN', [['tn_bac', 'Baccalauréat (Tunisie)']]),
  c('FR', [
    ['fr_college', 'Collège (Brevet)'],
    ['fr_bac', 'Baccalauréat (général, techno, pro)'],
    ['fr_prepa', 'Classes préparatoires / grandes écoles'],
  ]),
  c('DE', [
    ['de_gymnasium', 'Gymnasium / Abitur'],
    ['de_realschule', 'Realschule / Hauptschule'],
    ['de_ausbildung', 'Ausbildung (vocational)'],
  ]),
  c('ES', [
    ['es_eso', 'ESO'],
    ['es_bachillerato', 'Bachillerato'],
    ['es_pau', 'PAU / EBAU / EvAU'],
  ]),
  c('IT', [
    ['it_medie', 'Scuola media'],
    ['it_maturita', 'Maturità'],
  ]),
  c('PT', [
    ['pt_basico', 'Ensino básico'],
    ['pt_secundario', 'Ensino secundário / exames nacionais'],
  ]),
  c('NL', [
    ['nl_vmbo', 'VMBO'],
    ['nl_havo', 'HAVO'],
    ['nl_vwo', 'VWO'],
  ]),
  c('BE', [['be_national', 'Belgian (Flemish, French or German-speaking)']]),
  c('CH', [['ch_matura', 'Matura / Maturité']]),
  c('AT', [['at_matura', 'Matura (AHS / BHS)']]),
  c('SE', [['se_gymnasium', 'Grundskola / Gymnasium']]),
  c('NO', [['no_vgs', 'Grunnskole / Videregående']]),
  c('DK', [['dk_gymnasium', 'Folkeskole / Gymnasium']]),
  c('FI', [['fi_ylioppilas', 'Perusopetus / Ylioppilastutkinto']]),
  c('PL', [['pl_matura', 'Matura']]),
  c('CZ', [['cz_maturita', 'Maturita']]),
  c('GR', [['gr_panhellenic', 'Panhellenic exams']]),
  c('RO', [['ro_bac', 'Bacalaureat']]),
  c('HU', [['hu_erettsegi', 'Érettségi']]),
  c('UA', [['ua_nmt', 'NMT / ZNO']]),
  c('RU', [
    ['ru_school', 'Russian school curriculum'],
    ['ru_ege_oge', 'EGE / OGE'],
  ]),
  c('BR', [
    ['br_bncc', 'BNCC'],
    ['br_enem', 'ENEM / vestibular'],
  ]),
  c('AR', [['ar_nacional', 'Currículo nacional']]),
  c('MX', [
    ['mx_sep', 'SEP (primaria, secundaria)'],
    ['mx_bachillerato', 'Bachillerato'],
  ]),
  c('CO', [['co_saber', 'Saber 11 (ICFES)']]),
  c('CL', [['cl_paes', 'PAES']]),
  c('PE', [['pe_cneb', 'Currículo Nacional (CNEB)']]),
  c('JM', [['jm_csec', 'CSEC / CAPE (Caribbean)']]),
  c('TT', [['tt_csec', 'CSEC / CAPE (Caribbean)']]),
];

const BY_COUNTRY = new Map(NATIONAL.map((x) => [x.code, x.curricula]));

/** Every ISO 3166 country a learner can choose. Names come from the browser in the viewer's language. */
const CODES =
  'AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW'.split(
    ' ',
  );

const STABLE_COUNTRY_NAMES: Record<string, string> = {
  HK: 'Hong Kong',
};

export function countryName(code: string): string {
  if (!code) return '';
  if (STABLE_COUNTRY_NAMES[code]) return STABLE_COUNTRY_NAMES[code];
  try {
    return new Intl.DisplayNames(['en-US'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

/** All countries, A to Z. Keep labels deterministic across server and browser ICU data. */
export function countryOptions(): { value: string; label: string }[] {
  return CODES.map((code) => ({ value: code, label: countryName(code) })).sort((a, b) =>
    a.label < b.label ? -1 : a.label > b.label ? 1 : a.value < b.value ? -1 : 1,
  );
}

export interface CurriculumGroup {
  label: string;
  options: Curriculum[];
}

/** The list to show for a country: its own first, then the international ones, then exams and the general options. */
export function curriculumGroups(country: string, keep = ''): CurriculumGroup[] {
  const own = BY_COUNTRY.get(country) ?? [];
  const groups: CurriculumGroup[] = [];
  if (own.length) groups.push({ label: `Studying in ${countryName(country)}`, options: own });
  groups.push(
    { label: 'International schools and boards', options: INTERNATIONAL },
    { label: 'Entrance, language and professional exams', options: EXAMS },
    { label: 'Higher education and other', options: GENERAL },
  );
  // someone who chose a curriculum from another country (or an older one) still sees it selected
  if (keep && !groups.some((g) => g.options.some((o) => o.value === keep)))
    groups.unshift({
      label: 'Your current choice',
      options: [{ value: keep, label: curriculumLabel(keep) }],
    });
  return groups;
}

const ALL = new Map<string, string>();
for (const x of [...INTERNATIONAL, ...EXAMS, ...GENERAL, ...NATIONAL.flatMap((n) => n.curricula)])
  ALL.set(x.value, x.label);

/** The readable name for a stored value; unknown ones are tidied up so nothing shows as a raw code. */
export function curriculumLabel(value: string): string {
  if (!value) return '';
  return ALL.get(value) ?? value.replace(/_/g, ' ').replace(/^\w/, (m) => m.toUpperCase());
}

/** Which country a curriculum belongs to, for sorting and filters. Empty for international, exams and general ones. */
export function curriculumCountry(value: string): string {
  for (const n of NATIONAL) if (n.curricula.some((x) => x.value === value)) return n.code;
  return '';
}

/** Everything, grouped by country, for filters that look across all learners. */
export function allCurriculumGroups(): CurriculumGroup[] {
  return [
    ...NATIONAL.map((n) => ({ label: countryName(n.code), options: n.curricula })).sort((a, b) =>
      a.label.localeCompare(b.label),
    ),
    { label: 'International schools and boards', options: INTERNATIONAL },
    { label: 'Entrance, language and professional exams', options: EXAMS },
    { label: 'Higher education and other', options: GENERAL },
  ];
}

export const CURRICULUM_COUNT = ALL.size;
