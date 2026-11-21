/*
  한국어 — being translated section by section; what is not here yet reads in English.
  Glossary, to keep every screen saying the same thing:
    hero 영웅 · skill 기술 · quest 퀘스트 · tavern 선술집 · guild 길드 · slayer 사냥꾼 · Endless Tower 끝없는 탑
    journal 일지 · Crown 왕관 · omens 징조 · pet 펫 · forge 대장간 · compendium 도감 · festival 축제
    weekly boss 주간 보스 · ascension 승천 · rebirth 환생 · routines 루틴 · gold 골드 · realm 왕국 · town 마을
    home 집 · church 교회 · shop 상점 · achievement 업적 · XP 경험치 · level 레벨 · talent 특성 · attribute 능력치
    energy 기력 · mastery 숙련 · daily task 일일 과제 · slot 슬롯 · Dawn Meadows 새벽 초원
  Tone: the narrator and characters speak in a literary 해라/하오 register; the interface uses polite 해요체.
*/
export default {
  app: { tagline: '아이들 왕국' },

  common: {
    showAll: '모두 보기 ({n})', showLess: '접기', gold: '골드', nothing: '없음', lvlShort: 'Lv {n}', raw: '{v}', notNow: '나중에', close: '닫기', buyFor: '{price}에 구매',
    cancel: '취소', level: '레벨', levelN: '레벨 {n}', seconds: '{n}초', add: '추가', hp: 'HP', stop: '중지',
    moveUp: '위로', moveDown: '아래로', remove: '제거', always: '항상', locked: '잠김', equip: '장착',
    missingMaterials: '재료가 부족해요', notEnoughGold: '골드가 부족해요', back: '뒤로', next: '다음',
    delete: '삭제', save: '저장', bought: '구매함: <b>{name}</b>', maxLevel: '최대 레벨',
    skipToContent: '본문으로 건너뛰기',
  },

  time: { dh: '{d}일 {h}시간', hm: '{h}시간 {m}분', ms: '{m}분 {s}초', s: '{s}초', hours: '{n}시간' },

  nav: {
    routines: '루틴',
    crown: '왕관',
    guilds: '길드',
    journal: '일지', hero: '영웅', inventory: '소지품', combat: '세계 지도', slayer: '사냥꾼', tower: '끝없는 탑', quests: '퀘스트',
    achievements: '업적', stats: '통계', tavern: '선술집', home: '집', church: '교회', shop: '상점',
    settings: '설정', realm: '왕국', town: '마을',
    pets: '펫', forge: '대장간', bestiary: '도감', festival: '축제', omens: '징조', weekly: '주간 보스',
    groups: { hero: '영웅', adventure: '모험', progress: '진행', town: '마을' },
    ascension: '승천',
    skills: '기술', more: '메뉴', main: '주 메뉴',
  },

  heroMenu: { feedback: '버그나 아이디어 알리기', viewHero: '영웅 보기', saveNow: '지금 저장', saved: '저장했어요', mainMenu: '메인 메뉴', label: '영웅 메뉴' },

  title: {
    continue: '이어하기', newGame: '새 게임', newGameHint: '빈 슬롯에 영웅 만들기', load: '불러오기',
    slotsUsed: '슬롯 {total}개 중 {n}개 사용 중', autosaveHint: '진행 상황은 몇 초마다 자동으로 저장돼요.',
    chooseSlot: '슬롯 선택', overwriteTitle: '슬롯 덮어쓰기', overwriteMessage: '슬롯 {n}에는 {name}이(가) 있어요. 새 게임이 그 자리를 차지하지만, {name}은(는) 슬롯의 자동 백업에 남아 있어서 설정에서 다시 불러올 수 있어요.',
    overwrite: '덮어쓰기', deleteTitle: '게임 삭제', deleteMessage: '{name}(영웅 레벨 {level})이(가) 삭제돼요. 되돌릴 수 없어요.',
    heroLevel: '영웅 레벨 {n}', played: '플레이 시간 {time}', saved: '{when} 저장', justNow: '방금', ago: '{time} 전',
    loadOne: '불러오기', emptySlot: '빈 슬롯', createCharacter: '영웅 만들기',
    footer: '아이콘: game-icons.net (CC BY 3.0)',
    importSave: '저장 파일 가져오기', importHint: '설정에서 내려받은 파일로',
    importWhere: '이 영웅을 어디에 둘까요?', placeHere: '여기에 두기', replaceHere: '가져온 영웅으로 바꾸기',
    imported: '<b>{name}</b>이(가) 이제 슬롯 {n}에 있어요', importFailed: '브라우저가 저장 파일을 보관하지 못하게 했어요',
  },

  creation: {
    tutorial: '안내 튜토리얼',
    tutorialHint: '화면 위쪽에 약 10분 동안 첫걸음을 안내해요.',
    gradual: '메뉴를 조금씩 알아가기',
    gradualHint: '화면은 쓸모가 생길 때 나타나요. 끄면 처음부터 모두 볼 수 있어요.',
    startLater: '둘 다 나중에 설정에서 바꿀 수 있어요.',
    title: '새 영웅', slot: '슬롯 {n}',
    steps: { role: '직업', race: '종족', look: '외모', difficulty: '난이도', origin: '출신', begin: '시작' },
    name: '이름', namePlaceholder: '전설은 당신을 뭐라고 부를까요?', randomName: '무작위 이름', portrait: '초상화', colour: '색',
    recommended: '추천',
    note: '난이도는 나중에 바꿀 수 없어요. 게임은 슬롯 {n}에 자동으로 저장돼요.',
    axes: { combat: '전투', gathering: '채집', crafting: '제작', toughness: '맷집' },
    styleLabel: '싸움 방식',
    styles: { melee: '근접', ranged: '원거리', magic: '마법' },
    starter: '처음 키우기 좋은 기술',
    talents: '고유 특성',
    kit: '시작 장비',
    lookHint: '직업에 맞는 초상화와 색을 골라 두었어요. 원하면 직접 고르세요.',
    details: '직업 상세',
    diff: {
      pace: { easy: '빠른 성장', normal: '꾸준한 성장', hard: '느린 성장', legend: '아주 느린 성장' },
      monsters: { less: '몬스터가 {n}% 약해요', same: '몬스터는 원래 강함 그대로예요', more: '몬스터가 {n}% 강해요' },
      gold: { more: '골드 {n}% 증가', same: '보통 골드', less: '골드 {n}% 감소' },
      offline: { full: '자리를 비워도 그대로 성장', part: '자리를 비운 동안 {n}%만 성장' },
      death: { none: '죽어도 시간만 잃어요', some: '죽으면 골드의 {n}%를 잃어요' },
      for: { easy: '느긋하게 즐기거나 처음 해 보는 방치형 게임이라면.', normal: '의도한 그대로의 게임.', hard: '장르를 잘 알고 도전을 원하는 분께.', legend: '아주 인내심 많은 분을 위한 길고 험한 길.' },
    },
    raceIntro: '왕관이 부서질 때 모든 종족은 그 파편의 흔적을 받았어요. 당신은 어디서 태어났나요?', originIntro: '당신은 거의 아무것도 기억하지 못한 채 깨어나요. 되살아나는 단 하나를 고르세요.',
    originGives: '가져오는 것',
    noBonus: '시작 혜택 없음: 오직 수수께끼뿐.',
    sum: { role: '직업', origin: '출신', difficulty: '난이도' },
    ready: '준비 완료. 당신의 이야기는 새벽 초원에서 시작돼요.',
    begin: '모험 시작', unnamed: '이름 없음', perks: '혜택', startsWith: '시작할 때 가진 것',
  },

  welcome: {
    title: '환영해요, {name}',
    tips: [
      '메뉴에서 기술을 고르고 행동 하나를 누르면 시작해요. 행동은 저절로 반복돼요.',
      '채집 기술은 제작 기술의 재료가 돼요. 광석은 주괴가 되고, 주괴는 장비가 돼요.',
      '레벨을 올릴 때마다 <b>영웅 경험치</b>도 얻어요. 능력치와 특성 포인트는 영웅 화면에서 써요.',
      '자리를 비운 동안에도 오프라인 한도까지 게임이 계속 진행돼요.',
      '<b>선술집</b>에서 일꾼을 고용하면 다른 기술을 동시에 훈련해 줘요.',
      '퀘스트로 새 지역과 보스가 열려요. 퀘스트 게시판을 자주 확인하세요.',
      '전투는 저절로 진행돼요. 공격할 때마다 <b>기력</b>이 쌓이고 능력이 알아서 발동해요. 능력은 전투 화면에서 골라요.',
      '당신의 이야기는 <b>일지</b>에 기록돼요. 탐험할수록 새 페이지가 나타나요.',
    ],
    start: '모험을 시작하자',
    tutorial: '화면 위쪽의 짧은 안내가 첫걸음을 도와줘요. 언제든 숨기거나 건너뛸 수 있어요.',
  },

  toast: {
    jailed: '들켰다! 감옥에 갇혔어요.',
    hybrid: '새 교배종 발견: <b>{name}</b>!',
    guardian: '<b>{name}</b> 쓰러짐! 첫 처치 보상을 받았어요.',
    favour: '기사단 호감도: 레벨 <b>{n}</b>',
    masterwork: '걸작! <b>{item}</b>',
    huntStreak: '사냥 연속: <b>{n}마리 처치</b> · 전투 경험치와 전리품 +{v}%',
    bossPhase: '{name}이(가) 이제 <b>{phase}</b>!',
    elite: '정예 몬스터 등장: <b>{name}</b>!',
    eliteDown: '정예 몬스터 처치: <b>{name}</b>',
    chapter: '일지의 새 페이지: <b>{name}</b>',
    levelUp: '<b>{skill}</b> 레벨 <b>{level}</b> 달성', heroLevel: '영웅 레벨 <b>{level}</b>!', heroLevelPlain: '영웅 레벨 {level}',
    pointsToSpend: '쓸 수 있는 포인트가 있어요', mastery: '숙련 {level}: <b>{name}</b>', rare: '희귀 전리품: <b>{item}</b>',
    achievement: '업적 달성: <b>{name}</b>', quest: '퀘스트 완료: <b>{name}</b>', death: '<b>{name}</b>에게 쓰러졌어요',
    expeditionOk: '{exp} 원정대가 돌아왔어요(<b>{name}</b>). 골드 {gold}', expeditionFail: '{exp} 원정이 실패했어요(<b>{name}</b>)',
    dungeon: '<b>{name}</b> 정복! {loot}',
    boon: '하늘이 축복을 내려요: <b>{name}</b>', wish: '소원이 이루어졌어요: <b>{wish}</b>, 영원히',
    weeklyKill: '<b>{name}</b> 쓰러짐! 전리품은 당신 거예요.', weeklyKillAgain: '<b>{name}</b>이(가) 또다시 쓰러졌어요!',
    petEgg: '<b>수수께끼의 알</b>을 찾았어요!', petEggPlain: '수수께끼의 알을 찾았어요', petEggHint: '부화기에서 따뜻하게 데워지고 있어요.',
    petLevel: '{name} 레벨 <b>{level}</b> 달성!', petBond: '{name}와(과)의 유대가 이제 <b>{tier}</b>예요.',
    pet: '새 펫: <b>{name}</b>!', petPlain: '펫을 찾았어요: {name}', streak: '일일 과제 모두 완료! 연속: <b>{n}일</b>',
  },

  notify: {
    title: 'Aetheria', unpaid: '{name}이(가) 일을 멈췄어요: 급료를 줄 수 없어요',
    expeditionOk: '{exp} 원정대가 돌아왔어요: {name}', expeditionFail: '{exp} 원정이 실패했어요: {name}', tripStopped: '{exp} 원정대가 다시 출발하지 못했어요: 다친 사람이 있거나 지도가 없어요',
    queueDone: '행동 대기열이 끝났어요', event: '이벤트: {event}',
  },

  event: { bought: '떠돌이 상인에게서 샀어요', offer: '{time} 후 제안 종료', gone: '상인이 떠났어요' },
}
