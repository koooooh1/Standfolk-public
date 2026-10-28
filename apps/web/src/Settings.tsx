import { useState } from 'react';
import { Mic, Settings2, Users } from 'lucide-react';
import type { Depth, Lang, Mode, Prefs } from './api';
import { tr } from './i18n';

const KEY = 'standfolk.mode';

const getStore = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const setStore = (k: string, v: string | null) => { try { if (v) window.localStorage.setItem(k, v); else window.localStorage.removeItem(k); } catch { /* storage blocked */ } };

// The audience mode is kept in the URL (shareable) and in local storage (remembered); the URL wins.
export function readMode(): Mode {
  const fromUrl = new URLSearchParams(window.location.search).get('mode');
  if (fromUrl === 'fan' || fromUrl === 'broadcast') return fromUrl;
  return getStore(KEY) === 'broadcast' ? 'broadcast' : 'fan';
}

export function hasModeInUrl(): boolean {
  const mode = new URLSearchParams(window.location.search).get('mode');
  return mode === 'fan' || mode === 'broadcast';
}

export function saveMode(mode: Mode) {
  const url = new URL(window.location.href);
  url.searchParams.set('mode', mode);
  window.history.replaceState(null, '', url);
  setStore(KEY, mode);
}

export function readPrefs(): Prefs {
  const params = new URLSearchParams(window.location.search);
  const lang = (params.get('lang') ?? getStore('standfolk.lang')) === 'ko' ? 'ko' : 'en';
  const depth = (params.get('depth') ?? getStore('standfolk.depth')) === 'detailed' ? 'detailed' : 'short';
  if (params.has('player')) {
    params.delete('player');
    const url = new URL(window.location.href);
    url.searchParams.delete('player');
    window.history.replaceState(null, '', url);
  }
  setStore('standfolk.player', null);
  return { mode: readMode(), lang, depth };
}

export function savePrefs(prefs: Prefs) {
  saveMode(prefs.mode);
  const url = new URL(window.location.href);
  url.searchParams.set('lang', prefs.lang);
  url.searchParams.set('depth', prefs.depth);
  url.searchParams.delete('player');
  window.history.replaceState(null, '', url);
  setStore('standfolk.lang', prefs.lang);
  setStore('standfolk.depth', prefs.depth);
  setStore('standfolk.player', null);
}

const LABEL: Record<Lang, Record<Mode, string>> = {
  en: { fan: 'Fan workspace', broadcast: 'Broadcast Studio' },
  ko: { fan: '팬 화면', broadcast: '방송 스튜디오' }
};

type Props = { mode: Mode; prefs?: Prefs; onPrefs?: (prefs: Prefs) => void };

export function Settings({ mode, prefs, onPrefs }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const Icon = mode === 'fan' ? Users : Mic;
  const current: Prefs = prefs ?? { mode, lang: 'en', depth: 'short' };
  const update = (patch: Partial<Prefs>) => {
    const next = { ...current, ...patch };
    onPrefs?.(next);
  };
  return (
    <div className="settings">
      {isOpen && (
        <div className="settings-menu" role="group" aria-label={tr(current.lang, 'Workspace preferences', '작업 화면 설정')}>
          <p className="settings-title">{tr(current.lang, 'Current workspace', '현재 작업 화면')}</p>
          {onPrefs && (
            <>
              <p className="settings-title">{tr(current.lang, 'Language', '언어')}</p>
              {([['en', 'English'], ['ko', '한국어']] as Array<[Lang, string]>).map(([l, label]) => (
                <button key={l} type="button" aria-pressed={current.lang === l} onClick={() => update({ lang: l })}><span>{label}</span></button>
              ))}
              <p className="settings-title">{tr(current.lang, 'Explanation depth', '설명 상세도')}</p>
              {([['short', tr(current.lang, 'Short', '간단히')], ['detailed', tr(current.lang, 'Detailed', '자세히')]] as Array<[Depth, string]>).map(([d, label]) => (
                <button key={d} type="button" aria-pressed={current.depth === d} onClick={() => update({ depth: d })}><span>{label}</span></button>
              ))}
            </>
          )}
        </div>
      )}
      <button type="button" className={`settings-toggle settings-${mode}`} aria-expanded={isOpen} aria-label={`${tr(current.lang, 'Workspace', '작업 화면')}: ${LABEL[current.lang][mode]}`} title={`${tr(current.lang, 'Workspace', '작업 화면')}: ${LABEL[current.lang][mode]}`} onClick={() => setIsOpen(!isOpen)}>
        <Settings2 className="settings-gear" size={18} aria-hidden="true" />
        <Icon size={18} aria-hidden="true" />
        <span className="settings-label">{LABEL[current.lang][mode]}</span>
      </button>
    </div>
  );
}
