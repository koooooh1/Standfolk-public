import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../src/catalog.js';
import { createRetriever, passages } from '../src/retrieval.js';

const catalog = loadCatalog(fileURLToPath(new URL('../../../data/catalog', import.meta.url)));
const retriever = createRetriever(catalog);
const top = (question: string, k = 3) => retriever.search(question, k).map((p) => p.ref);

describe('world-pack retrieval', () => {
  it('splits the world pack into passages the agent service accepts', () => {
    const all = passages(catalog);
    expect(all.length).toBeGreaterThan(150);
    expect(new Set(all.map((p) => p.ref)).size).toBe(all.length);
    expect(all.every((p) => p.text.length > 0 && p.text.length <= 2000)).toBe(true);
  });

  it.each([
    ['What happens after a home goal at Quayside Park?', 'club:vr:culture:0'],
    ['Where did Youngho Go play before?', 'player:p-go'],
    ['What does Ring it mean?', 'club:vr:fan-language']
  ])('finds the passage for a question that shares its words: %s', (question, ref) => {
    expect(top(question)).toContain(ref);
  });

  it.each([
    ['Who is the boss of Kestrin Athletic?', 'staff:s-brook'],
    ['What is the stadium of Vellmouth Rovers?', 'club:vr'],
    ['What trophies have Vellmouth Rovers won?', 'club:vr'],
    ['What chants do Vellmouth fans sing?', 'club:vr:culture:0']
  ])('finds the passage when the fan uses other words: %s', (question, ref) => {
    expect(top(question)).toContain(ref);
  });

  it.each([
    ['Tell me about Vellde', 'player:p-velde'],
    ['Who is Youngoh?', 'player:p-go']
  ])('finds a misspelt name: %s', (question, ref) => {
    expect(top(question)).toContain(ref);
  });

  it('treats FTS5 syntax in a question as plain words and returns nothing for stopwords only', () => {
    expect(() => retriever.search('Go" OR NEAR(* AND -')).not.toThrow();
    expect(retriever.search('what is the')).toEqual([]);
  });
});
