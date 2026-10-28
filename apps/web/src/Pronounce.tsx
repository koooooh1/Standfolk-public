// Browser speech synthesis as a pronunciation guide; voices vary, so the respelling stays the reference.
import { Volume2 } from 'lucide-react';
import type { Lang } from './api';
import { tr } from './i18n';

const VOICE_LANG: Record<string, string> = {
  'Korea Republic': 'ko-KR', Japan: 'ja-JP', Israel: 'he-IL', Morocco: 'ar-MA', Hungary: 'hu-HU', France: 'fr-FR',
  Spain: 'es-ES', Portugal: 'pt-PT', Argentina: 'es-AR', Uruguay: 'es-UY', Netherlands: 'nl-NL', Denmark: 'da-DK',
  Norway: 'nb-NO', Sweden: 'sv-SE', Czechia: 'cs-CZ', Slovakia: 'sk-SK', Croatia: 'hr-HR', Poland: 'pl-PL', Finland: 'fi-FI', Belgium: 'fr-BE'
};

type Props = { name: string; nativeName?: string; respelling?: string; nationality?: string; lang?: Lang };

export function Pronounce({ name, nativeName, respelling, nationality, lang = 'en' }: Props) {
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const handleListen = () => {
    const lang = (nationality && VOICE_LANG[nationality]) ?? 'en-GB';
    const utterance = new SpeechSynthesisUtterance(lang === 'en-GB' ? name : nativeName ?? name);
    utterance.lang = lang;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };
  if (!respelling && !nativeName) return null;
  return (
    <div className="pronounce">
      <div>
        {respelling && <span className="respelling">{respelling}</span>}
        {nativeName && <span className="native" lang={nationality ? VOICE_LANG[nationality] : undefined}>{nativeName}</span>}
      </div>
      {canSpeak && (
        <button type="button" className="listen" onClick={handleListen} aria-label={tr(lang, `Listen to how to say ${name}`, `${name} 발음 듣기`)}>
          <Volume2 size={16} aria-hidden="true" />{tr(lang, 'Listen', '발음 듣기')}
        </button>
      )}
    </div>
  );
}
