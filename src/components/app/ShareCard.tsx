'use client';

import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';

interface Referral {
  code: string;
  link: string;
  percent: number;
  joined: number;
  paid: number;
  vouchers: number;
  next: { percent: number; kind: string };
}

function qrUrl(text: string, cell = 6) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createDataURL(cell, 2);
}

/** A shareable poster: the invite line, the QR and the code, drawn to a canvas so it can be saved or sent as a picture. */
async function posterBlob(r: Referral): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1350;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#f4f7ff';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#1d4ed8';
  g.fillRect(0, 0, c.width, 14);
  g.fillStyle = '#0f172a';
  g.font = '700 64px system-ui, sans-serif';
  g.fillText('WorkLab XC', 80, 150);
  g.font = '800 120px system-ui, sans-serif';
  g.fillText('Learn with me.', 80, 360);
  g.fillStyle = '#1d4ed8';
  g.fillText(`${r.percent}% off`, 80, 500);
  g.fillStyle = '#334155';
  g.font = '500 44px system-ui, sans-serif';
  g.fillText('Turn any syllabus into AI lessons,', 80, 590);
  g.fillText('practice rounds and a 3D classroom.', 80, 650);
  const img = new Image();
  img.src = qrUrl(r.link, 10);
  await new Promise((ok) => {
    img.onload = ok;
    img.onerror = ok;
  });
  g.fillStyle = '#ffffff';
  g.fillRect(300, 720, 480, 480);
  g.drawImage(img, 320, 740, 440, 440);
  g.fillStyle = '#0f172a';
  g.textAlign = 'center';
  g.font = '700 48px ui-monospace, monospace';
  g.fillText(`Code ${r.code}`, 540, 1270);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

export function ShareCard() {
  const [r, setR] = useState<Referral | null>(null);
  useEffect(() => {
    api<Referral>('/referral')
      .then(setR)
      .catch(() => undefined);
  }, []);
  const qr = useMemo(() => (r ? qrUrl(r.link) : ''), [r]);
  if (!r) return null;
  const text = `Join me on WorkLab XC and get ${r.percent}% off your first plan: ${r.link}`;
  const copy = () =>
    navigator.clipboard.writeText(r.link).then(
      () => toast('Link copied.', 'ok'),
      () => toast('Copy it by hand: ' + r.link, 'err'),
    );
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'WorkLab XC', text, url: r.link });
        return;
      } catch {
        return;
      }
    }
    copy();
  };
  const poster = async () => {
    const b = await posterBlob(r);
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'worklab-xc-invite.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <section className="card pl-share" aria-label="Share with friends">
      <h2 className="h3">Share with friends, get {r.percent}% off</h2>
      <p className="small">
        A friend who joins with your link gets {r.percent}% off their first purchase. When they pay, you get{' '}
        {r.percent}% off your next one. Discounts do not stack and are given only after a payment arrives.
      </p>
      <div className="pl-share-body">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="pl-qr" src={qr} alt={`QR code for ${r.link}`} width={150} height={150} />
        <div className="grow">
          <input
            className="input"
            readOnly
            value={r.link}
            aria-label="Your invite link"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button className="btn xs solid" type="button" onClick={() => void share()}>
              <Icon name="send" size={14} /> Share
            </button>
            <button className="btn xs" type="button" onClick={copy}>
              Copy link
            </button>
            <a
              className="btn xs"
              href={`https://wa.me/?text=${encodeURIComponent(text)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
            <button className="btn xs" type="button" onClick={() => void poster()}>
              Save as image
            </button>
          </div>
          <p className="small" style={{ marginTop: 8 }}>
            {`${r.joined} joined · ${r.paid} paid · `}
            {r.next.percent
              ? `${r.next.percent}% off waiting on your next purchase`
              : 'no discount waiting yet'}
          </p>
        </div>
      </div>
    </section>
  );
}
