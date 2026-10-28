import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageShell } from '@/components/site/PageShell';

export const SUPPORT = 'support@worklabxc.com';
export const UPDATED = 'Last updated 17 October 2026';
type Row = [title: string, body: ReactNode];
export type LegalKind = 'terms' | 'privacy' | 'refunds' | 'cookies' | 'copyright' | 'ai';

const mail = <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>;

const PAGES: Record<LegalKind, { title: string; lead: string; rows: Row[] }> = {
  terms: {
    title: 'Terms of service',
    lead: 'The rules for using WorkLab XC, in plain language.',
    rows: [
      [
        'Who can use it',
        'You must be 13 or older. If you are under 18, use WorkLab XC with a parent or teacher’s permission. You are responsible for your account and for keeping your password private.',
      ],
      [
        'What the service does',
        'WorkLab XC turns syllabi you upload into topics, lessons, slides, games and practice problems written with the help of AI. Features differ by plan; the Pricing page lists them.',
      ],
      [
        'Your content',
        'You keep ownership of what you upload and what you write. You give us permission to store it, process it with the AI and email providers described in the Privacy policy, and show it back to you. Only upload material you have the right to use.',
      ],
      [
        'Acceptable use',
        'Do not break the law, upload harmful or infringing material, try to get around limits, share one account between many people, probe or attack the service, or use a VPN or proxy to hide who you are when the service asks you not to. We may limit or pause accounts that do. You can write to ' +
          SUPPORT +
          ' to appeal.',
      ],
      [
        'Limits and fair use',
        'Each plan has daily limits, for example the free plan includes one subject at a time and one 3D classroom session a month. Limits are shown in the app. Repeatedly hitting a limit can pause your account for a short time.',
      ],
      [
        'Paid plans and add-ons',
        <>
          Prices, renewal and refunds are described in the{' '}
          <Link href="/refunds">Billing, cancellation and refund terms</Link>.
        </>,
      ],
      [
        'AI content',
        <>
          Lessons are written by AI and can contain mistakes. Please read the{' '}
          <Link href="/ai-use">AI use notice</Link>. Mastery figures are study estimates, not grades.
        </>,
      ],
      [
        'Availability',
        'We work to keep the service running but do not promise it will always be available. We may change or remove features, with notice where we can.',
      ],
      [
        'Ending your account',
        'You can delete your account in Settings at any time. We may suspend or end accounts that break these terms.',
      ],
      [
        'Liability',
        'The service is provided as is. To the extent the law allows, we are not liable for indirect losses, or for decisions made from AI-written study material. Nothing here limits rights you have under law that cannot be limited.',
      ],
      ['Contact', <>Questions about these terms: {mail}.</>],
    ],
  },
  privacy: {
    title: 'Privacy policy',
    lead: 'What we collect, why we collect it, who sees it, and how you can remove it.',
    rows: [
      [
        'What we collect and why',
        <table key="t">
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Name, email, password (stored only as a salted hash)</td>
              <td>To create and secure your account, and to email you about it.</td>
            </tr>
            <tr>
              <td>Syllabi, notes, lessons, games, answers and chat messages you create</td>
              <td>To give you the service and let you reuse your saved work.</td>
            </tr>
            <tr>
              <td>
                Optional: syllabus type, class or year, school or institute, city, state, age group, rank
              </td>
              <td>
                To reuse lessons made for the same syllabus, personalise your lessons, and help us support
                you. You can leave these blank.
              </td>
            </tr>
            <tr>
              <td>Optional: handle, bio and public profile choices</td>
              <td>Only if you turn on your public profile or the leaderboard. Off by default.</td>
            </tr>
            <tr>
              <td>Daily usage, sign-in times, ratings and feedback you send</td>
              <td>To apply plan limits, prevent abuse, and improve the product.</td>
            </tr>
            <tr>
              <td>IP address</td>
              <td>
                For rate limits and to detect abuse. If network checks are on, the address is sent to a
                network-reputation provider to tell whether it is a VPN or proxy.
              </td>
            </tr>
            <tr>
              <td>Payment status and order IDs</td>
              <td>
                To confirm your plan. Card and bank details go to our payment provider; we never see or store
                them.
              </td>
            </tr>
          </tbody>
        </table>,
      ],
      [
        'Who we share it with',
        'Providers that run the service for us: hosting and database, AI model providers that write your lessons (the topic and course text is sent to them; we do not send your name or email), email delivery, payments, and a network-reputation lookup. They may process data only to provide their service to us. Free-tier AI providers can have different data terms from paid ones, and we put providers that do not train on prompts first. We do not sell your data and do not show ads.',
      ],
      [
        'Who can see it',
        'You. A small number of WorkLab XC staff can see account details, usage and your optional study details to run and support the service; every administrator action is logged. Other learners see only what you choose to make public.',
      ],
      [
        'How long we keep it',
        'Your data stays while your account exists. When you delete your account we remove your courses, saved lessons, files, chat, progress and profile. Feedback and support messages are kept without your name or email. Short-lived security logs and backups can take up to 35 days to expire.',
      ],
      [
        'Your choices and rights',
        'In Settings you can export your data, change or remove your optional details, turn off your public profile, and delete your account. You can also write to ' +
          SUPPORT +
          ' to ask for access, correction or deletion. Depending on where you live you may have additional legal rights.',
      ],
      [
        'Security',
        'Connections use HTTPS. Passwords are hashed. Sessions use secure cookies. Every request is checked on the server so you can only reach your own data. Secret keys stay on the server and are never sent to your browser.',
      ],
      [
        'Children',
        'WorkLab XC is for people 13 and older. If you believe a younger child has an account, write to us and we will remove it.',
      ],
      [
        'Cookies',
        <>
          We use only the cookies we need. See the <Link href="/cookies">Cookie notice</Link>.
        </>,
      ],
      [
        'Changes and contact',
        <>We will tell you about important changes by email or in the app. Contact: {mail}.</>,
      ],
    ],
  },
  refunds: {
    title: 'Billing, cancellation and refunds',
    lead: 'How paid plans and add-ons work, and how to get your money back.',
    rows: [
      [
        'How you pay',
        'You pay once for a period, one month or one year, through a secure payment page from our payment provider. Prices are in Indian rupees and shown before you pay. Your plan turns on only after the payment provider confirms it to our server.',
      ],
      [
        'Renewal',
        'Plans do not renew by themselves. We email you before your plan ends, and when it ends your account returns to the free plan with your saved work intact. Buy again whenever you like.',
      ],
      [
        'Cancelling',
        'Because nothing renews automatically, there is nothing to cancel. Your paid features stay until the end of the period you paid for.',
      ],
      [
        'Add-ons',
        'Notes by marks are sold per unit or as a monthly pack (the pack expires after 30 days). The class chat add-on lasts 30 days. Units and days are added to your account when payment is confirmed.',
      ],
      [
        'Refunds',
        'If a plan or add-on does not work for you, write to ' +
          SUPPORT +
          ' within 7 days of paying and we will refund it in full, unless you have used a large share of it. If a payment succeeded but your plan did not turn on, we will fix it or refund you. Refunds go back to the original payment method and can take 5 to 10 working days to show.',
      ],
      [
        'Failed or duplicate payments',
        'If you are charged twice, or a payment is taken but not applied, write to us with the order ID from your receipt email and we will sort it out.',
      ],
      ['Taxes and receipts', 'Receipts are emailed after payment. Taxes are included where they apply.'],
      ['Contact', <>Billing help: {mail}.</>],
    ],
  },
  cookies: {
    title: 'Cookie notice',
    lead: 'The small files WorkLab XC stores in your browser.',
    rows: [
      [
        'What we use',
        <table key="t">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Purpose</th>
              <th scope="col">Kind</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>wlxc_sid</td>
              <td>Keeps you signed in. HttpOnly, expires after 30 days.</td>
              <td>Essential</td>
            </tr>
            <tr>
              <td>Local storage: theme, layout and cookie choice</td>
              <td>Remembers how you like the app to look and that you saw this notice.</td>
              <td>Essential</td>
            </tr>
          </tbody>
        </table>,
      ],
      [
        'What we do not use',
        'Free accounts see ads from Google AdSense, and nobody else does: Beta accounts and visitors who are not signed in see none. By default ads are basic, which means they are not personalised. If you choose personalised ads, Google may set advertising cookies to tailor them. We do not use any other advertising or cross-site tracking. If we add analytics later, it will be off until you agree, and this page will say so.',
      ],
      [
        'Your choice',
        'Essential cookies are needed to sign in, so they cannot be switched off. Your ad choice is stored on your device and you can change it any time in Settings. You can clear cookies in your browser at any time; you will be signed out.',
      ],
    ],
  },
  copyright: {
    title: 'Copyright and intellectual property',
    lead: 'Who owns what, and how to report a problem.',
    rows: [
      [
        'Our material',
        '© 2026 WorkLab XC. The WorkLab XC name, logo, design and software are ours. You may not copy or resell them.',
      ],
      [
        'Your material',
        'You own the syllabi, notes and other content you upload. Lessons, slides, games and problems the AI writes for you are yours to use for your own study and teaching. They are written by AI and may resemble other material, so check anything you plan to publish.',
      ],
      [
        'Third-party material',
        'Do not upload books, papers, exams or other works you do not have the right to use. When we are told that something infringes copyright we will remove it quickly.',
      ],
      [
        'Reporting infringement',
        <>
          Write to {mail} with what the work is, where it appears in WorkLab XC, and how to reach you. We will
          reply and, where the claim is valid, remove the content.
        </>,
      ],
      [
        'Open-source software',
        'WorkLab XC is built with open-source software. Their licences apply to their code.',
      ],
    ],
  },
  ai: {
    title: 'AI use notice',
    lead: 'What the AI does here, what it can get wrong, and what happens to your data.',
    rows: [
      [
        'What is written by AI',
        'Lessons, slides, lesson scripts, quiz questions, games, practice problems, full answers, notes by marks, topic links and chat replies are written by AI models. A label tells you when something is freshly written, saved or reused.',
      ],
      [
        'It can be wrong',
        'AI can state wrong facts, make arithmetic mistakes, or miss what your teacher expects. Check important facts against your textbook, and treat the mastery figure as a study estimate, not a grade or a prediction of your marks. Practice answers are checked by our software against the answer the AI wrote, which can itself be wrong; use “Show solution” and your own judgement.',
      ],
      [
        'Chat',
        'The class chat answers from the lesson you are viewing and marks anything outside it. It is not a tutor, doctor, lawyer or adviser.',
      ],
      [
        'Your data and the AI',
        'The topic and course text needed to write a lesson is sent to AI providers. We do not send your name or email. We use paid providers that do not train on your prompts first; free-tier providers are only a backup and may have different terms. Lessons written for a standard syllabus (for example NCERT) may be reused for other students on that syllabus; your uploaded files and chat messages are never shared.',
      ],
      [
        'Reuse',
        'To save cost and time we reuse saved lessons, games and chat answers when the topic matches. You can ask for a new version where the app offers it.',
      ],
      [
        'Limits',
        'AI generation has daily limits per plan. When you reach one, the app tells you when it resets.',
      ],
      [
        'Report a problem',
        <>If a lesson is wrong or unsuitable, use the Feedback page or write to {mail}.</>,
      ],
    ],
  },
};

export const LEGAL_META: Record<LegalKind, { title: string; description: string }> = {
  terms: { title: 'Terms of service', description: 'The rules for using WorkLab XC, in plain language.' },
  privacy: {
    title: 'Privacy policy',
    description: 'What WorkLab XC collects, why, who sees it and how to delete it.',
  },
  refunds: {
    title: 'Billing, cancellation and refunds',
    description:
      'How WorkLab XC plans and add-ons are billed, what happens when they end, and how to get a refund.',
  },
  cookies: { title: 'Cookie notice', description: 'The few essential cookies WorkLab XC uses and why.' },
  copyright: {
    title: 'Copyright and IP',
    description: 'Who owns what on WorkLab XC and how to report infringement.',
  },
  ai: { title: 'AI use notice', description: 'What the AI writes, its limits, and how your data is used.' },
};

export function Legal({ kind }: { kind: LegalKind }) {
  const p = PAGES[kind];
  return (
    <PageShell label={UPDATED} title={p.title} lead={p.lead}>
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href="/">Home</Link>
          </li>
          <li aria-current="page">{p.title}</li>
        </ol>
      </nav>
      <div className="legal">
        {p.rows.map(([t, body]) => (
          <section key={t}>
            <h2 className="h2">{t}</h2>
            {typeof body === 'string' ? <p>{body}</p> : body}
          </section>
        ))}
      </div>
    </PageShell>
  );
}
