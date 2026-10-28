'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_COMPARE,
  DEFAULT_PLANS,
  fetchPlans,
  region,
  type AddonInfo,
  type CompareRow,
  type Plan,
} from '@/lib/plans';

export function usePlans() {
  const [data, setData] = useState<{
    plans: Plan[];
    compare: CompareRow[];
    addons: AddonInfo[];
    region: typeof region;
  }>({
    plans: DEFAULT_PLANS,
    compare: DEFAULT_COMPARE,
    addons: [],
    region: { ...region },
  });
  useEffect(() => {
    let alive = true;
    void fetchPlans().then((r) => {
      if (alive && r)
        setData({
          plans: r.plans,
          compare: r.compare ?? DEFAULT_COMPARE,
          addons: r.addons ?? [],
          region: { ...region },
        });
    });
    return () => {
      alive = false;
    };
  }, []);
  return data;
}
