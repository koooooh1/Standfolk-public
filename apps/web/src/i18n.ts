import type { Lang } from './api';

export const tr = (lang: Lang, english: string, korean: string) => lang === 'ko' ? korean : english;
export const displayPlayerName = (name: string, nativeName: string | null | undefined, lang: Lang) => lang === 'ko' && nativeName && /[\uac00-\ud7a3]/u.test(nativeName) ? nativeName : name;
const CLUB_NAMES_KO: Record<string, string> = {
  'Vellmouth Rovers': '벨머스 로버스', 'Kestrin Athletic': '케스트린 애슬레틱', Marrowby: '매로비', 'Ostwick Town': '오스트윅 타운',
  'Hallowfield United': '할로필드 유나이티드', 'Greywater City': '그레이워터 시티', 'Dunmarsh Rangers': '던마시 레인저스', 'Pennick Albion': '페닉 앨비언',
  'Ridgeford City': '리지퍼드 시티', 'Corvane United': '코베인 유나이티드', 'Elderby Town': '엘더비 타운', Fenwold: '펜월드',
  'Blackmere Rovers': '블랙미어 로버스', 'Thistleby United': '시슬비 유나이티드', 'Caddon Wanderers': '캐든 원더러스', 'Ambry Town': '앰브리 타운',
  'Stanbury Athletic': '스탠버리 애슬레틱', 'Merrow Heath': '메로 히스', 'Brackwater United': '브랙워터 유나이티드', 'Hythemoor Town': '하이드무어 타운',
  'Larkspur City': '라크스퍼 시티', Westerholt: '웨스터홀트', 'Lorne Park': '론 파크', 'Kilnford Forest': '킬른퍼드 포레스트',
  'Saltholme Athletic': '솔트홈 애슬레틱', 'Northam Vale': '노덤 베일'
};
const TOWNS_KO: Record<string, string> = {
  Vellmouth: '벨머스', Kestrin: '케스트린', Marrowby: '매로비', Ostwick: '오스트윅', Hallowfield: '할로필드', Greywater: '그레이워터',
  Dunmarsh: '던마시', Pennick: '페닉', Ridgeford: '리지퍼드', Corvane: '코베인', Elderby: '엘더비', Fenwold: '펜월드',
  Blackmere: '블랙미어', Thistleby: '시슬비', Caddon: '캐든', Ambry: '앰브리', Stanbury: '스탠버리', 'Merrow Heath': '메로 히스',
  Brackwater: '브랙워터', Hythemoor: '하이드무어', Larkspur: '라크스퍼', Westerholt: '웨스터홀트', Lorne: '론', Kilnford: '킬른퍼드',
  Saltholme: '솔트홈', Northam: '노덤'
};
const GROUNDS_KO: Record<string, string> = {
  'Quayside Park': '키사이드 파크', 'Millbank Road': '밀뱅크 로드', 'Weir Lane': '위어 레인', 'Furnace Road': '퍼니스 로드', 'The Chase': '더 체이스',
  'Lantern Street': '랜턴 스트리트', Peatfield: '피트필드', 'Albion Rise': '앨비언 라이즈', Kingsmoor: '킹스무어', 'Rookery Lane': '루커리 레인',
  'Orchard Park': '오차드 파크', Dykeside: '다이크사이드', 'Coalpit Road': '콜핏 로드', 'Burr Meadow': '버 메도', 'Drovers Field': '드로버스 필드',
  'Chapel Green': '채플 그린', 'Wheelwright Park': '휠라이트 파크', 'Gorse Hill': '고스 힐', 'Sluice Road': '슬루이스 로드', 'Beacon Way': '비컨 웨이',
  Meadowbank: '메도뱅크', 'Holt End': '홀트 엔드', 'Lorne Park': '론 파크', Brickfield: '브릭필드', 'Brine Street': '브라인 스트리트', 'Vale Road': '베일 로드'
};
const LEAGUES_KO: Record<string, string> = { 'Brenmoor League': '브렌무어 리그', 'Brenmoor Championship': '브렌무어 챔피언십' };
export const displayClubName = (name: string, lang: Lang) => lang === 'ko' ? CLUB_NAMES_KO[name] ?? name : name;
export const displayTownName = (name: string, lang: Lang) => lang === 'ko' ? TOWNS_KO[name] ?? name : name;
export const displayGroundName = (name: string, lang: Lang) => lang === 'ko' ? GROUNDS_KO[name] ?? name : name;
export const displaySurfaceName = (name: string, lang: Lang) => lang === 'ko' ? ({ Grass: '천연 잔디', 'Hybrid grass': '하이브리드 잔디', 'Artificial turf': '인조 잔디' } as Record<string, string>)[name] ?? name : name;
export const displayLeagueName = (name: string, lang: Lang) => lang === 'ko' ? LEAGUES_KO[name] ?? name : name;
export const displayClubNickname = (name: string | undefined, lang: Lang) => lang === 'ko' ? ({ 'The Ferrymen': '페리 선원들', 'The Kestrels': '황조롱이들' } as Record<string, string>)[name ?? ''] ?? name : name;
const COUNTRY_KO: Record<string, string> = { England: '잉글랜드', Scotland: '스코틀랜드', Wales: '웨일스', 'Northern Ireland': '북아일랜드', Ireland: '아일랜드', Czechia: '체코', Slovakia: '슬로바키아', Israel: '이스라엘', France: '프랑스', Morocco: '모로코', Japan: '일본', Uruguay: '우루과이', Ghana: '가나', Netherlands: '네덜란드', Spain: '스페인', Denmark: '덴마크', Argentina: '아르헨티나', Nigeria: '나이지리아', Hungary: '헝가리', Belgium: '벨기에', Norway: '노르웨이', Sweden: '스웨덴', Portugal: '포르투갈', Croatia: '크로아티아', Poland: '폴란드', Finland: '핀란드', 'Korea Republic': '대한민국', 'South Korea': '대한민국' };
export const displayCountryName = (name: string, lang: Lang) => lang === 'ko' ? COUNTRY_KO[name] ?? name : name;

const CLUB_STORIES_KO: Record<string, { title: string; text: string }> = {
  'club-vr-01': { title: '항구에서 시작된 구단', text: '페리 선원들이 벨머스 항구 방파제에서 구단을 창단했습니다.' },
  'club-vr-02': { title: '바다를 마주한 홈구장', text: '바다를 마주한 키사이드 파크가 문을 열었습니다.' },
  'club-vr-03': { title: '물결 종의 노래', text: '홈에서 골이 터지면 북쪽 스탠드가 오래된 항구 종을 세 번 울린 뒤 느린 항구 노래를 부릅니다.' },
  'club-vr-04': { title: '하구 더비의 시작', text: '케스트린 애슬레틱과 첫 리그 맞대결을 치렀고, 하구 더비가 시작됐습니다.' },
  'club-vr-05': { title: '첫 리그 우승', text: '브렌무어 리그에서 첫 우승을 차지했습니다.' },
  'club-vr-06': { title: '마지막 날에 거둔 우승', text: '최종전에서 승리하며 두 번째 리그 우승을 차지했습니다.' },
  'club-vr-07': { title: '세 번째 컵 우승', text: '결승에서 할로필드 유나이티드를 꺾고 세 번째 브렌무어 컵을 들어 올렸습니다.' },
  'club-vr-08': { title: '페리 깃발', text: '서포터들은 구단 창단에 참여한 페리 선원들의 신호에서 따온 청록색 깃발을 흔듭니다.' },
  'club-vr-09': { title: '항구 산책길', text: '홈 팬들은 킥오프 전 항구 방파제를 따라 경기장으로 걸어갑니다.' },
  'club-ka-01': { title: '하구 남쪽에서 시작된 구단', text: '하구 남쪽 강변의 제분소 노동자들이 구단을 창단했습니다.' },
  'club-ka-03': { title: '날개 인사', text: '선수단이 입장하면 서포터들이 양팔을 날개처럼 들어 올립니다.' },
  'club-ka-04': { title: '첫 라이벌전', text: '벨머스 로버스와 첫 리그 맞대결을 치렀습니다.' },
  'club-ka-05': { title: '브렌무어 컵 우승', text: '첫 브렌무어 컵을 들어 올렸습니다.' },
  'club-ka-06': { title: '챔피언십으로 강등', text: '브렌무어 챔피언십으로 강등됐습니다.' },
  'club-ka-07': { title: '더 네스트', text: '밀뱅크 로드의 지붕 있는 관중석으로, 가장 열정적인 홈 팬들이 모입니다.' },
  'club-ka-08': { title: '교대 종소리', text: '창단을 이끈 노동자들의 교대 시간을 기리는 제분소 호루라기가 킥오프에 울립니다.' }
};

export function clubStory(ref: string, title: string, text: string, lang: Lang) {
  if (lang !== 'ko') return { title, text };
  return CLUB_STORIES_KO[ref] ?? { title, text };
}

export function clubTerm(term: string, meaning: string, lang: Lang) {
  if (lang !== 'ko') return { term, meaning };
  const translations: Record<string, [string, string]> = {
    'Ring it': ['종을 울려', '홈팀이 골을 넣은 뒤 북쪽 관중석에서 종을 울릴 때 하는 말입니다.'],
    "The tide's in": ['밀물이 들어온다', '벨머스가 앞서고 있다는 뜻입니다.'],
    Ferrymen: ['페리 선원들', '벨머스 로버스의 별칭이자 팬들을 부르는 말입니다.'],
    'The Wall': ['더 월', '남쪽 골대 뒤 항구 쪽 관중석입니다.'],
    Quayside: ['키사이드', '키사이드 파크의 줄임말입니다.'],
    'Estuary derby': ['하구 더비', '벨머스 로버스와 케스트린 애슬레틱의 리그 경기입니다.'],
    'Wings up': ['날개를 들어', '날개 인사를 요청하거나 케스트린의 공격을 응원할 때 하는 말입니다.'],
    'The Nest': ['더 네스트', '밀뱅크 로드에 있는 홈 관중석입니다.'],
    Kestrels: ['황조롱이들', '케스트린 애슬레틱의 별칭입니다.'],
    'South bank': ['남쪽 강변', '하구 남쪽의 케스트린 지역과 그 팬들을 가리킵니다.'],
    Millbank: ['밀뱅크', '밀뱅크 로드의 줄임말입니다.']
  };
  const translated = translations[term];
  return translated ? { term: translated[0], meaning: translated[1] } : { term, meaning };
}

export function playerNarrative(id: string, text: string, lang: Lang) {
  if (lang !== 'ko') return text;
  const translations: Record<string, string> = {
    'In Korea he is Go Youngho (고영호), family name first.': '한국에서는 성을 앞에 두어 고영호(Go Youngho)로 표기합니다.',
    'South Korea reached the World Cup semi-finals in 2002, when it co-hosted the tournament with Japan. Many players come through school and university football.': '대한민국은 일본과 공동 개최한 2002년 월드컵에서 4강에 올랐습니다. 많은 선수가 학교와 대학 축구를 거쳐 성장합니다.',
    'The Lighthouse': '등대',
    'Korean high-school football': '한국 고교 축구',
    "Korea's top division": '한국 최상위 리그'
  };
  const replacements = { ...CLUB_NAMES_KO, ...TOWNS_KO, ...GROUNDS_KO };
  return Object.entries(replacements).sort(([a], [b]) => b.length - a.length).reduce((copy, [english, korean]) => copy.replaceAll(english, korean), translations[text] ?? text);
}
