// 무기 목록, 카테고리, 아이콘, 위력 스케일
const I = {
  bomb: '<path d="M10 7.5a6.5 6.5 0 1 0 0.01 0z" fill="currentColor"/><path d="M14.5 6.5l2.5-2.5M17 4l1.5-.5M17 4l.5-1.5M17 4l1.2 1.2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  missile: '<path d="M4 20l3-1 9.5-9.5a4 4 0 0 0 1.2-3.9L17 4l-1.6-.7a4 4 0 0 0-3.9 1.2L2 14l3 1 1 3z" fill="currentColor"/><path d="M4 20l-1.5 1.5" stroke="currentColor" stroke-width="1.8"/>',
  cluster: '<circle cx="12" cy="6" r="3.2" fill="currentColor"/><circle cx="5" cy="15" r="2" fill="currentColor"/><circle cx="12" cy="18" r="2" fill="currentColor"/><circle cx="19" cy="15" r="2" fill="currentColor"/><path d="M12 9.5L6 13M12 9.5v6.5M12 9.5L18 13" stroke="currentColor" stroke-width="1.4" stroke-dasharray="1.5 1.5"/>',
  bunker: '<path d="M12 2l3 5v8l-3 3-3-3V7z" fill="currentColor"/><path d="M3 15h5M16 15h5M2 19h20" stroke="currentColor" stroke-width="2"/>',
  carpet: '<path d="M3 6h18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="6" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="14" r="1.8" fill="currentColor"/><circle cx="18" cy="16" r="1.8" fill="currentColor"/><path d="M3 21h18" stroke="currentColor" stroke-width="1.6"/>',
  railgun: '<path d="M2 12h20" stroke="currentColor" stroke-width="2.6"/><path d="M4 8l4 4-4 4M14 8l4 4-4 4" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  napalm: '<path d="M12 2c2 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-3 0-6 1-9z" fill="currentColor"/>',
  laser: '<path d="M12 2v20" stroke="currentColor" stroke-width="3"/><path d="M5 22h14M8 5l-3-2M16 5l3-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  meteor: '<circle cx="15" cy="15" r="5" fill="currentColor"/><path d="M3 3l8 8M7 2l6 6M2 7l6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  rod: '<path d="M12 2v15" stroke="currentColor" stroke-width="2.6"/><path d="M12 17l-3 4h6z" fill="currentColor"/><path d="M8 3l1 3M16 3l-1 3" stroke="currentColor" stroke-width="1.4"/>',
  quake: '<path d="M2 13h4l2-6 3 12 3-15 3 11 2-2h3" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"/>',
  tornado: '<path d="M3 4h18M5 8h14M7 12h10M9 16h7M11 20h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  sinkhole: '<ellipse cx="12" cy="15" rx="9" ry="4" fill="none" stroke="currentColor" stroke-width="2"/><ellipse cx="12" cy="15" rx="5" ry="2" fill="currentColor"/><path d="M8 5l2 4M16 5l-2 4M12 3v5" stroke="currentColor" stroke-width="1.6"/>',
  tsunami: '<path d="M2 18c3 0 4-2 6-2s3 2 6 2 4-2 8-2M2 13c2-6 9-10 15-6-3 0-5 2-4 5 1 2 4 1 5 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  blackhole: '<circle cx="12" cy="12" r="4.5" fill="currentColor"/><ellipse cx="12" cy="12" rx="10" ry="3.5" stroke="currentColor" stroke-width="1.8" fill="none" transform="rotate(-20 12 12)"/>',
  antigrav: '<path d="M12 20V6M7 11l5-5 5 5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/><rect x="4" y="19" width="5" height="3" fill="currentColor"/><rect x="15" y="16" width="4" height="3" fill="currentColor"/>',
  ball: '<circle cx="12" cy="14" r="7" fill="currentColor"/><path d="M12 7V2" stroke="currentColor" stroke-width="2"/><circle cx="9.5" cy="12" r="1.6" fill="#0003"/>',
  stomp: '<path d="M5 20c-1-6 1-11 5-14 2-1 4 0 4 2l-1 6c2-1 5 0 6 2l1 4z" fill="currentColor"/><path d="M5 20h16" stroke="currentColor" stroke-width="1.6"/>',
  nuke: '<circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 9.8L8.6 3.9a7 7 0 0 1 6.8 0zM14 13.1l6.8 0a7 7 0 0 1-3.4 5.9zM10 13.1l-3.4 5.9a7 7 0 0 1-3.4-5.9z" fill="currentColor"/>',
  bomber: '<path d="M2 12l8-1 1-7h2l1 7 8 1v2l-8 1-.5 4 2.5 1.5V22l-4-1-4 1v-1.5L10.5 19 10 15l-8-1z" fill="currentColor"/>',
  icbm: '<path d="M12 1c2 2 3 5 3 8v8l2 3h-3l-2-2-2 2H7l2-3V9c0-3 1-6 3-8z" fill="currentColor"/><path d="M10 22l2 1 2-1" stroke="currentColor" stroke-width="1.4"/>',
};

export const CATEGORIES = [
  { id: 'blast', name: '폭발' },
  { id: 'sky', name: '하늘' },
  { id: 'nature', name: '자연재해' },
  { id: 'special', name: '특수' },
  { id: 'nuke', name: '핵' },
];

// opt: 무기별 켜고 끄는 옵션 (전역 공유 옵션은 global: true)
export const WEAPONS = [
  { id: 'bomb', cat: 'blast', name: '폭탄', desc: '하늘에서 떨어지는 고폭탄' },
  { id: 'missile', cat: 'blast', name: '미사일', desc: '카메라에서 발사, 빠르고 정확' },
  { id: 'cluster', cat: 'blast', name: '집속탄', desc: '공중에서 터져 자탄 수십 개를 흩뿌림' },
  { id: 'bunker', cat: 'blast', name: '벙커버스터', desc: '지붕을 뚫고 1층에서 폭발, 제자리 붕괴' },
  { id: 'carpet', cat: 'blast', name: '융단폭격', desc: '드래그한 선을 따라 폭격기 편대가 투하', hold: true },
  { id: 'railgun', cat: 'blast', name: '레일건', desc: '카메라 방향으로 건물 여러 채를 일렬 관통' },
  { id: 'napalm', cat: 'blast', name: '네이팜', desc: '불바다가 번지며 건물이 서서히 무너짐' },
  { id: 'laser', cat: 'sky', name: '궤도 레이저', desc: '누르고 끌어서 건물을 잘라내기', hold: true },
  { id: 'meteor', cat: 'sky', name: '운석우', desc: '거대 운석과 파편이 쏟아짐' },
  { id: 'rod', cat: 'sky', name: '신의 지팡이', desc: '궤도에서 텅스텐 막대 낙하, 거대 크레이터' },
  { id: 'quake', cat: 'nature', name: '지진', desc: '저층부부터 무너지는 연쇄 붕괴' },
  { id: 'tornado', cat: 'nature', name: '토네이도', desc: 'EF5 초대형 토네이도, 마우스를 따라감' },
  { id: 'sinkhole', cat: 'nature', name: '싱크홀', desc: '땅이 꺼지며 건물이 통째로 빨려 들어감' },
  { id: 'tsunami', cat: 'nature', name: '쓰나미', desc: '먼 곳에서 거대한 물의 벽이 도시를 쓸고 지나감' },
  { id: 'blackhole', cat: 'special', name: '블랙홀', desc: '모든 파편을 끌어당겨 삼킴', opts: [{ key: 'absorb', label: '완전 흡수' }] },
  { id: 'antigrav', cat: 'special', name: '반중력', desc: '일대가 떠올랐다가 한꺼번에 추락' },
  { id: 'ball', cat: 'special', name: '철거 철구', desc: '물리로 굴러가며 들이받음' },
  { id: 'stomp', cat: 'special', name: '괴수 발', desc: '거대한 발이 쿵쿵 걸으며 짓밟음' },
  { id: 'nuke', cat: 'nuke', name: '핵폭탄', desc: '바로 떨어지는 핵폭탄', opts: [{ key: 'realNuke', label: '실감 핵 연출', global: true }] },
  { id: 'bomber', cat: 'nuke', name: '폭격기 투하', desc: '폭격기가 날아와 투하, 카메라 연출', opts: [{ key: 'realNuke', label: '실감 핵 연출', global: true }, { key: 'cinematic', label: '연출 카메라', global: true }] },
  { id: 'icbm', cat: 'nuke', name: 'ICBM', desc: '사일로에서 발사되는 대륙간 탄도미사일', opts: [{ key: 'mirv', label: '다탄두(MIRV)' }, { key: 'realNuke', label: '실감 핵 연출', global: true }, { key: 'cinematic', label: '연출 카메라', global: true }] },
];

export const DEFAULT_OPTS = { realNuke: true, cinematic: true, mirv: false, absorb: false };

export function weaponIcon(id) { return `<svg viewBox="0 0 24 24" width="26" height="26">${I[id]}</svg>`; }

// 위력(1~100) → 크기/세기 배율. 반경은 폭발 상사법칙처럼 위력의 약 1/3제곱
export function powerScale(P) {
  P = Math.max(0.5, Math.min(100, P));
  return {
    P,
    r: 0.75 * P ** 0.38,      // 반경: 1→0.75, 10→1.8, 100→4.3
    v: 0.85 * P ** 0.22,      // 힘(속도): 1→0.85, 10→1.4, 100→2.3
    n: Math.sqrt(P),          // 개수: 1→1, 10→3.2, 100→10
    t: 0.9 + 0.25 * Math.log10(P), // 지속시간: 1→0.9, 10→1.15, 100→1.4
  };
}
// 슬라이더(0~1) ↔ 위력(1~100) 로그 스케일
export const sliderToPower = (s) => Math.round(10 ** (s * 2) * 10) / 10;
export const powerToSlider = (p) => Math.log10(Math.max(1, p)) / 2;
