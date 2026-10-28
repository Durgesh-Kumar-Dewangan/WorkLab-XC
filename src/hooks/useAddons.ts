'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useApp } from '@/lib/store';

/** Which paid add-ons this account has. `chatbot` is the AI tutor. Unknown (false) until the server answers. */
export function useAddons() {
  const signedIn = useApp((s) => !!s.session);
  const [state, setState] = useState<{ loaded: boolean; chatbot: boolean; freeChatLeft: number }>({ loaded: false, chatbot: false, freeChatLeft: 0 });
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    api<{ mine: { sku: string }[]; free?: { chat: [number, number] } }>('/addons')
      .then((r) => alive && setState({ loaded: true, chatbot: r.mine.some((m) => m.sku === 'chatbot'), freeChatLeft: r.free ? Math.max(0, r.free.chat[1] - r.free.chat[0]) : 0 }))
      .catch(() => alive && setState({ loaded: true, chatbot: false, freeChatLeft: 0 }));
    return () => {
      alive = false;
    };
  }, [signedIn]);
  return state;
}

/** Starts checkout for the AI tutor add-on and sends the learner to the payment page. */
export async function buyTutor(): Promise<void> {
  const r = await api<{ url: string }>('/addons', { body: { sku: 'chatbot' } });
  window.location.href = r.url;
}
