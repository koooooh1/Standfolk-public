import { useState } from 'react';
import { UserRound } from 'lucide-react';

type Props = { id: string; number: number; color: string; size: number; name: string; initials?: string };

// Shows the generated portrait when it exists; otherwise initials when given, else a face-shaped placeholder.
export function Portrait({ id, number, color, size, name, initials }: Props) {
  const [hasImage, setHasImage] = useState(true);
  const style = { width: size, height: size, background: color, fontSize: Math.round(size * 0.38) };
  if (!hasImage && initials) return <span className="portrait" style={style} aria-hidden="true">{initials}</span>;
  if (!hasImage) return <span className="portrait portrait-empty" style={style} aria-hidden="true"><UserRound size={Math.round(size * 0.62)} strokeWidth={1.6} /></span>;
  return <img className="portrait" style={style} src={`/api/media/people/${id}.webp`} alt={name} width={size} height={size} onError={() => setHasImage(false)} />;
}

// Club crests in data/catalog/media/crests: a generated square WebP first, then an older authored SVG, then the short name.
const CREST_FILES = ['webp', 'svg'] as const;
export function CrestImage({ id, short, color, size }: { id: string; short: string; color: string; size: number }) {
  const [attempt, setAttempt] = useState(0);
  const ext = CREST_FILES[attempt];
  if (!ext) return <span className="crest-fallback" style={{ width: size, height: size * 1.15, background: color }} aria-hidden="true">{short}</span>;
  const height = ext === 'svg' ? Math.round(size * 1.17) : size;
  return <img key={ext} className="crest-img" src={`/api/media/crests/${id}.${ext}`} alt="" width={size} height={height} onError={() => setAttempt((a) => a + 1)} />;
}
