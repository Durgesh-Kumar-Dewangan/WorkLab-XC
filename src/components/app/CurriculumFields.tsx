'use client';

import { useEffect, useRef } from 'react';
import { Field } from '@/components/ui/controls';
import { allCurriculumGroups, countryOptions, curriculumGroups } from '@/lib/curricula';
import { fetchPlans, region } from '@/lib/plans';

const COUNTRIES = countryOptions();

/**
 * Where you study, then the syllabus or curriculum used there. The second list changes with the country:
 * that country's own boards and exams first, then international schools, worldwide exams and general options.
 */
export function CurriculumFields({
  country,
  category,
  onChange,
  prefix,
  named = false,
  error,
  hint,
}: {
  country: string;
  category: string;
  onChange: (next: { country: string; category: string }) => void;
  prefix: string;
  /** give the selects names so a plain form submit can read them */
  named?: boolean;
  error?: string;
  hint?: string;
}) {
  const touched = useRef(false);
  const latest = useRef({ country, category, onChange });
  latest.current = { country, category, onChange };

  // a new visitor starts on the country their connection says they are in; they can change it
  useEffect(() => {
    if (country) return;
    let live = true;
    const apply = () => {
      const x = latest.current;
      if (live && !touched.current && !x.country && region.country)
        x.onChange({ country: region.country.toUpperCase(), category: x.category });
    };
    if (region.country) apply();
    else void fetchPlans().then(apply);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = curriculumGroups(country, category);
  return (
    <>
      <Field
        kind="select"
        id={`${prefix}-country`}
        {...(named ? { name: 'country' } : {})}
        label="Country you study in"
        options={[{ value: '', label: 'Choose your country' }, ...COUNTRIES]}
        value={country}
        onChange={(e) => {
          touched.current = true;
          const v = e.target.value;
          // keep the choice only if it is still on offer for the new country
          const still = curriculumGroups(v).some((g) => g.options.some((o) => o.value === category));
          onChange({ country: v, category: still ? category : '' });
        }}
      />
      <Field
        kind="select"
        id={`${prefix}-cat`}
        {...(named ? { name: 'category' } : {})}
        label="Syllabus or curriculum"
        options={[
          { value: '', label: country ? 'Choose one' : 'Choose a country first, or pick one here' },
          ...groups.map((g) => ({ group: g.label, options: g.options })),
        ]}
        value={category}
        onChange={(e) => onChange({ country, category: e.target.value })}
        error={error}
        hint={hint}
      />
    </>
  );
}

/** The options for a "which syllabus" filter: everything, grouped by country. */
export function SyllabusFilterOptions() {
  return (
    <>
      <option value="">All syllabi</option>
      {allCurriculumGroups().map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
