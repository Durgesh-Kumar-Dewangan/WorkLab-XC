type RecognitionResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionResult) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function canListen() {
  if (typeof window === 'undefined') return false;
  const w = window as SpeechWindow;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function hush() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

export function say(text: string) {
  if (!canSpeak()) return;
  hush();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

export function listen(onText: (text: string) => void, onEnd: () => void) {
  const w = window as SpeechWindow;
  const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Constructor) return onEnd;
  const recognition = new Constructor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = document.documentElement.lang || 'en-US';
  recognition.onresult = (event) => {
    const last = event.results[event.results.length - 1];
    onText(Array.from(last).map((item) => item.transcript).join(''));
  };
  recognition.onend = onEnd;
  recognition.onerror = onEnd;
  recognition.start();
  return () => {
    recognition.stop();
    onEnd();
  };
}
