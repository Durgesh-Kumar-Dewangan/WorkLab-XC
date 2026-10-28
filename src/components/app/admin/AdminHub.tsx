'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { AdminPage } from '@/components/app/pages/AdminPage';
import { Icon } from '@/components/ui/Icon';
import { useServerMe } from '@/hooks/useServerMe';
import { AdminAudit } from './AdminAudit';
import { AdminContent } from './AdminContent';
import { AdminDatabase } from './AdminDatabase';
import { AdminFeedback } from './AdminFeedback';
import { AdminUsersReport } from './AdminUsersReport';

const TABS = [
  ['overview', 'Overview'],
  ['users', 'Learners'],
  ['feedback', 'Feedback'],
  ['content', 'Content and syllabus'],
  ['database', 'Database'],
  ['audit', 'Audit trail'],
] as const;
type Tab = (typeof TABS)[number][0];

/** The owner's console: one place for the business numbers, every learner, what is reused, the database and the trail. Admin accounts only. */
export function AdminHub() {
  const { me } = useServerMe();
  const [tab, setTab] = useState<Tab>('overview');
  const [learner, setLearner] = useState('');
  const [doc, setDoc] = useState<{ col: string; id: string } | null>(null);
  if (me && !me.user.admin)
    return (
      <div className="page">
        <div className="callout warn">
          <Icon name="lock" size={18} />
          <span>This area is for WorkLab XC administrators.</span>
        </div>
      </div>
    );
  return (
    <div className="ad-wide">
      <div className="ad-tabs" role="tablist" aria-label="Admin sections">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={clsx(tab === id && 'on')}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'overview' ? <AdminPage /> : null}
      {tab === 'users' ? (
        <div className="page">
          <AdminUsersReport
            key={learner}
            initialOpen={learner}
            onOpenDoc={(col, id) => {
              setDoc({ col, id });
              setTab('database');
            }}
          />
        </div>
      ) : null}
      {tab === 'feedback' ? (
        <div className="page">
          <AdminFeedback
            onOpenLearner={(uid) => {
              setLearner(uid);
              setTab('users');
            }}
          />
        </div>
      ) : null}
      {tab === 'content' ? (
        <div className="page">
          <AdminContent />
        </div>
      ) : null}
      {tab === 'database' ? (
        <div className="page">
          <AdminDatabase start={doc} />
        </div>
      ) : null}
      {tab === 'audit' ? (
        <div className="page">
          <AdminAudit />
        </div>
      ) : null}
    </div>
  );
}
