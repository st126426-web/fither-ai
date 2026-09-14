import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'th' | 'en';

const KEY = 'fither.lang';

/** Thai-first: that is the product's default, not a fallback. */
export function storedLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'th' || v === 'en') return v;
  } catch { /* private browsing */ }
  return 'th';
}

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Strings;
  /** Pick the right side of a th/en pair coming from data. */
  pick: (th: string | null | undefined, en: string | null | undefined) => string;
}

const Ctx = createContext<LangCtx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(storedLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const pick = useCallback(
    (th: string | null | undefined, en: string | null | undefined) =>
      (lang === 'en' ? (en || th) : (th || en)) ?? '',
    [lang],
  );

  return (
    <Ctx.Provider value={{ lang, setLang, t: STRINGS[lang], pick }}>
      {children}
    </Ctx.Provider>
  );
}

export function useI18n(): LangCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n must be used inside <LangProvider>');
  return ctx;
}

/**
 * Thai is the source of truth. `en` is annotated as `Strings`, so a missing
 * or misspelled translation is a compile error rather than a Thai string
 * leaking into the English UI.
 */
const th = {
    // app shell
    appName: 'FitHer AI',
    tabs: { home: 'หน้าแรก', plan: 'แผน', discover: 'ค้นหา', meals: 'มื้ออาหาร', coach: 'โค้ช' },
    back: 'กลับ',
    profileAria: 'โปรไฟล์',
    offline: 'โหมดออฟไลน์ · ส่วนที่เชื่อมต่อเซิร์ฟเวอร์จะกลับมาเมื่อ API พร้อม',
    comingSoon: 'เร็ว ๆ นี้',
    viewAll: 'ดูทั้งหมด',

    // home
    hello: (n: string) => `สวัสดีค่ะ คุณ${n} 👋`,
    welcome: 'ยินดีต้อนรับสู่ FitHer',
    helloAnon: 'ยินดีต้อนรับค่ะ 👋',
    welcomeSub: 'เริ่มจากคุยกับโค้ชสักครู่นะคะ',
    goalIs: (g: string) => `เป้าหมาย: ${g}`,
    streak: (n: number) => `ต่อเนื่อง ${n} สัปดาห์`,
    forgiven: 'มีสัปดาห์ที่พัก · ไม่นับว่าหลุด',
    weekN: (n: number) => `สัปดาห์ที่ ${n}`,
    nextSession: 'ครั้งต่อไปของคุณ',
    seeThisWeek: 'ดูแผนสัปดาห์นี้',
    noPlanYet: 'ยังไม่มีแผน',
    noPlanBody: 'คุยกับโค้ชสักครู่ เล่าว่าคุณอยากได้อะไรและมีเวลาแค่ไหน แล้วโค้ชจะจัดแผนสัปดาห์แรกให้ค่ะ',
    startChat: 'เริ่มคุยกับโค้ช',
    activeChallenge: 'ชาเลนจ์ที่กำลังทำ',
    whatsOn: 'สัปดาห์นี้มีอะไร',
    quickActions: 'ทางลัด',
    qaSchedule: 'ตารางสัปดาห์',
    qaHistory: 'ประวัติแผน',
    qaDevice: 'เชื่อมนาฬิกา',
    qaWater: 'บันทึกน้ำ',

    // plan
    yourPlan: 'แผนของคุณ',
    totalSets: (n: number) => `${n} เซตรวม`,
    whyLabel: 'ทำไมสัปดาห์นี้เป็นแบบนี้',
    viewList: 'รายการ',
    viewCalendar: 'ปฏิทิน',
    minutes: (n: number) => `${n} นาที`,
    exerciseCount: (n: number) => `${n} ท่า`,
    stDone: 'ทำแล้ว', stSkipped: 'ข้าม', stTodo: 'ยังไม่ทำ',
    progress14: 'ความคืบหน้า สัปดาห์ 1–4',
    historyLink: 'ดูประวัติแผนและสิ่งที่เปลี่ยน →',
    noPlanThisWeek: 'ยังไม่มีแผนสำหรับสัปดาห์นี้',
    noPlanThisWeekSub: 'คุยกับโค้ชเพื่อรับแผนสัปดาห์แรก',

    // session detail
    sessionDetail: 'รายละเอียด',
    notFound: 'ไม่พบเซสชันนี้',
    load: 'น้ำหนัก',
    bodyweight: 'น้ำหนักตัว',
    watchVideo: 'ดูวิดีโอท่านี้',
    howTo: 'วิธีทำ',
    commonMistake: 'ข้อผิดที่เจอบ่อย',
    targets: 'ส่วนที่ได้',
    markDone: 'ทำเสร็จแล้ว',
    doneLabel: 'ทำแล้ว',
    skipToday: 'ข้ามวันนี้',
    skippedLabel: 'ข้ามแล้ว',
    displayOnlyNote: 'สถานะนี้ใช้แสดงผลในแอป · ข้อมูลจริงประจำสัปดาห์มาจากการเช็คอินใน LINE',

    // schedule
    weekSchedule: 'ตารางสัปดาห์',
    noPlanToSchedule: 'ยังไม่มีแผนให้จัดตาราง',
    tapToMove: 'แตะเซสชันที่อยากย้าย แล้วแตะวันใหม่ที่ต้องการค่ะ',
    movingNow: (t: string) => `กำลังย้าย “${t}” — แตะวันปลายทาง`,
    selected: 'เลือกอยู่', move: 'ย้าย',
    checkinDay: 'วันเช็คอิน: อาทิตย์',
    nextPlanDay: 'แผนใหม่: จันทร์',
    slotCheckin: 'เช็คอิน', slotNewPlan: 'แผนใหม่',

    // history
    planHistory: 'ประวัติแผน',
    nPlans: (n: number) => `${n} แผน`,
    noHistory: 'ยังไม่มีประวัติแผน',
    nDays: (n: number) => `${n} วัน`,
    fromLastWeek: (n: number) => `${n}% จากสัปดาห์ก่อน`,
    whatChanged: 'อะไรเปลี่ยน และทำไม',
    stActive: 'ใช้งานอยู่', stSuperseded: 'ถูกแทนที่', stDraft: 'ฉบับร่าง',

    // discover
    recommendedVenue: 'ที่ออกกำลังกายที่แนะนำ',
    noVenueYet: 'ยังไม่มีคำแนะนำ',
    noVenueBody: 'เมื่อคุณรู้สึกว่าออกกำลังที่บ้านเริ่มเบาไป บอกโค้ชใน LINE ว่า “อยากลองไปยิม” แล้วเราจะหายิมที่ผ่านการตรวจสอบสำหรับมือใหม่ให้ค่ะ',
    whyThisVenue: 'ทำไมที่นี่ถึงเหมาะกับคุณ',
    beginnerFriendly: 'ผ่านการตรวจสอบสำหรับมือใหม่',
    notVetted: 'ยังไม่ผ่านการตรวจสอบ',
    viewMap: 'ดูแผนที่',
    communities: 'คอมมูนิตี้และกิจกรรมใกล้คุณ',
    join: 'เข้าร่วม',
    members: (n: number) => `${n} คน`,
    eventsThisMonth: 'อีเวนต์เดือนนี้',
    signUp: 'สมัคร',
    spotsLeft: (n: number) => `เหลือ ${n} ที่`,

    // meals
    mealsTitle: 'มื้ออาหารที่แมตช์กับเป้าหมายคุณ',
    mealsSub: 'ปรับได้ทุกมื้อ',
    thaiFirst: 'อาหารไทยเป็นหลัก',
    proteinTarget: 'โปรตีน 1.4 g/kg',
    today: 'วันนี้', tomorrow: 'พรุ่งนี้', dayAfter: 'มะรืนนี้',
    swap: 'สลับ',
    findPlaceTitle: 'หาร้านใกล้คุณ',
    findPlaceBody: 'หาร้านที่มีเมนูตรงกับเป้าหมายของคุณ พร้อมแคลและโปรตีนโดยประมาณ',
    findPlaceCta: 'หาร้านใกล้ฉัน',
    groceryTitle: 'รายการซื้อของประจำสัปดาห์',
    groceryBody: 'รวมวัตถุดิบทุกมื้อให้อัตโนมัติ แยกตามหมวดในซูเปอร์',
    groceryCta: 'สร้างรายการซื้อของ',
    meal: { breakfast: 'เช้า', lunch: 'กลางวัน', dinner: 'เย็น', snack: 'ของว่าง' } as Record<string, string>,

    // coach
    coachTitle: 'โค้ชที่น่าจะเข้ากับคุณ',
    coachSub: 'จับคู่จากเป้าหมาย ตาราง และสไตล์ที่คุณชอบ',
    topMatches: 'แนะนำสำหรับคุณ',
    talkFirst: 'คุยก่อน',
    years: (n: number) => `${n} ปี`,
    handoffTitle: 'โค้ชกำลังติดต่อกลับหาคุณ',
    handoffBody: 'เราหยุดจัดโปรแกรมอัตโนมัติไว้ก่อน เพราะคุณแจ้งอาการที่ควรให้คนดูแลค่ะ โค้ชจะทักกลับใน LINE ภายใน 24 ชั่วโมง',
    notSureTitle: 'ยังไม่แน่ใจว่าต้องการโค้ชไหม',
    notSureBody: 'ตอบคำถาม 6 ข้อเรื่องเป้าหมายและตารางของคุณ แล้วเราจะบอกว่าโค้ชแบบไหนเหมาะ หรือแผนอัตโนมัติก็เพียงพอแล้ว',
    notSureCta: 'ทำแบบประเมิน',

    // profile
    profile: 'โปรไฟล์',
    trainingProfile: 'โปรไฟล์การฝึก',
    fName: 'ชื่อที่อยากให้เรียก',
    fNamePlaceholder: 'เช่น มายด์',
    fGoal: 'เป้าหมาย',
    fDays: 'กี่วันต่อสัปดาห์',
    fMinutes: 'ครั้งละกี่นาที',
    fEquipment: 'อุปกรณ์ที่มี',
    fExperience: 'ประสบการณ์',
    fLifeStage: 'ช่วงชีวิต',
    fTone: 'อยากให้โค้ชคุยแบบไหน',
    fToneHint: 'ปรับได้ทุกเมื่อ โค้ชจะเปลี่ยนวิธีพูดตามนี้',
    fMotivation: 'เหตุผลที่เริ่ม',
    fTimeframe: 'กรอบเวลา',
    fAbout: 'ข้อมูลพื้นฐาน',
    fAboutHint: 'ใช้ตั้งน้ำหนักเริ่มต้นและติดตามการเปลี่ยนแปลง · ไม่บอกก็ได้',
    fAge: 'อายุ', fHeight: 'ส่วนสูง (ซม.)', fWeight: 'น้ำหนัก (กก.)',
    fCoachNotes: 'สิ่งที่โค้ชจำไว้',
    fInjuries: 'ต้องระวัง', fDislikes: 'ไม่ชอบทำ', fTrainTime: 'ช่วงเวลาที่เทรน', fSleep: 'นอน',
    hoursN: (n: number) => `${n} ชม./คืน`,
    weeksN: (n: number) => `${n} สัปดาห์`,
    fLanguage: 'ภาษา',
    save: 'บันทึก',
    saving: 'กำลังบันทึก…',
    savedAppliesNext: 'บันทึกแล้ว · จะปรับแผนในสัปดาห์หน้า',
    savedAppliesNextEn: 'Applies at your next weekly re-plan.',
    bodyStats: 'น้ำหนักและสัดส่วน',
    latestWeight: 'น้ำหนักล่าสุด',
    kg: 'กก.',
    over5w: (d: string) => `${d} กก. ใน 5 สัปดาห์`,
    addMeasurement: '+ เพิ่มการวัดใหม่',
    myJourney: 'เส้นทางของฉัน',
    noEvents: 'ยังไม่มีกิจกรรม',
    appearance: 'หน้าตาแอป',
    themeMode: 'โหมด',
    themeSystem: 'ตามระบบ', themeLight: 'สว่าง', themeDark: 'มืด',
    themeAccent: 'สีหลัก',
    accentNames: { plum: 'พลัม', rose: 'โรส', sage: 'เซจ', indigo: 'อินดิโก้', clay: 'เคลย์' } as Record<string, string>,
    settings: 'การตั้งค่า',
    sNotif: 'การแจ้งเตือน', sNotifSub: 'เตือนวันเช็คอินและวันเทรน', sConfigure: 'ตั้งค่า',
    sDevices: 'เชื่อมต่ออุปกรณ์', sConnect: 'เชื่อมต่อ',
    sPlanTier: 'แพ็กเกจ', sPlanTierSub: 'Free pilot · ใช้งานได้ทุกฟีเจอร์ระหว่างทดลอง', sFree: 'ฟรี',
    sPrivacy: 'ความเป็นส่วนตัว (PDPA)',
    sPrivacySub: 'เราเก็บเฉพาะข้อมูลที่จำเป็นต่อการจัดแผน และคุณลบได้ทุกเมื่อ',
    deleteAll: 'ลบข้อมูลของฉันทั้งหมด',
    deleteAllSub: 'ลบโปรไฟล์ แผน และประวัติทั้งหมดทันที',
    deleteConfirm: 'ลบข้อมูลทั้งหมดของคุณและกลับไปเริ่มต้นใหม่?',

    // quick setup via her own AI
    quickSetup: 'ตอบเร็ว ๆ ด้วย AI ที่คุณใช้อยู่',
    quickSetupHint: 'ขี้เกียจพิมพ์ทีละข้อ? ก๊อปคำถามนี้ไปถาม ChatGPT หรือ AI ที่คุณใช้ แล้วเอาคำตอบมาวางในแชทนี้ ทีเดียวจบ',
    copyPrompt: 'คัดลอกคำถาม',
    copied: 'คัดลอกแล้ว',
    quickSetupThen: 'เสร็จแล้วเอาย่อหน้าที่ AI สรุปให้ มาวางในช่องแชทด้านล่างได้เลยค่ะ',

    // chat
    chatTitle: 'คุยกับโค้ช',
    chatSub: 'คุยที่นี่ หรือใน LINE ก็ได้ — เป็นบทสนทนาเดียวกัน',
    chatIntro: 'คุยกับโค้ชได้เลยค่ะ บทสนทนานี้ต่อเนื่องกับใน LINE',
    chatIntroNew: 'กำลังทักทาย…',
    chatStart: 'เริ่มต้นใหม่',
    chatAskPlan: 'ขอดูแผน',
    chatAskCheckin: 'เช็คอิน',
    chatPlaceholder: 'พิมพ์ข้อความ…',
    chatError: 'ส่งข้อความไม่สำเร็จค่ะ ลองใหม่อีกครั้งนะคะ',
    chatFab: 'คุยกับโค้ช',

    // landing
    landing: {
      nav: 'เข้าสู่ตัวอย่างแอป',
      heroKicker: 'โค้ชออกกำลังกาย AI สำหรับผู้หญิงไทย',
      heroTitle: 'แผนออกกำลังกายที่ปรับตามชีวิตจริงของคุณ',
      heroBody: 'FitHer คุยกับคุณผ่าน LINE จัดแผนให้ตามอุปกรณ์ เวลา และความพร้อมจริง ๆ สัปดาห์ไหนไม่ไหวก็เริ่มใหม่แบบเบาลง ไม่มีคำพูดที่ทำให้รู้สึกผิด',
      ctaPrimary: 'ลองดูตัวอย่างแอป',
      ctaSecondary: 'เพิ่มเพื่อนใน LINE',
      noSignup: 'ไม่ต้องสมัคร ไม่ต้องกรอกบัตรเครดิต',
      howTitle: 'ใช้งานอย่างไร',
      how: [
        { icon: '💬', t: 'คุยใน LINE 1 นาที', b: 'ตอบคำถามสั้น ๆ 5 ข้อ เรื่องเป้าหมาย เวลา และอุปกรณ์ที่มี' },
        { icon: '📋', t: 'รับแผนสัปดาห์แรก', b: 'พร้อมเหตุผลหนึ่งบรรทัดว่าทำไมสัปดาห์นี้ถึงเป็นแบบนี้' },
        { icon: '🤍', t: 'สัปดาห์ไหนไม่ไหวก็ได้', b: 'บอกเราตอนเช็คอิน แล้วแผนถัดไปจะเบาลง ไม่ใช่หนักขึ้นเพื่อชดเชย' },
        { icon: '🏋️‍♀️', t: 'พร้อมค่อยออกไปยิม', b: 'เราแนะนำเฉพาะที่ที่ตรวจสอบแล้วว่าเป็นมิตรกับมือใหม่' },
      ],
      whyTitle: 'ทำไมถึงต่างจากแอปอื่น',
      why: [
        { t: 'ปรับตามที่คุณทำได้จริง', b: 'ไม่ใช่โปรแกรมสำเร็จรูป แผนคิดจากสิ่งที่คุณทำสำเร็จในสัปดาห์ที่ผ่านมา' },
        { t: 'ไม่มีคำพูดที่ทำให้รู้สึกผิด', b: 'ระบบตรวจจับและบล็อกคำตำหนิก่อนส่งถึงคุณ ทุกครั้ง' },
        { t: 'ความปลอดภัยไม่ได้ฝากไว้กับ AI', b: 'กฎความปลอดภัยเป็นโค้ดที่ตรวจทุกแผนก่อนส่ง เช่น เพิ่มปริมาณไม่เกิน 10% ต่อสัปดาห์' },
        { t: 'ยิมที่ตรวจสอบแล้ว', b: 'เราดูว่ามีช่วงเวลาผู้หญิง คลาสมือใหม่ และเทรนเนอร์ที่ดูฟอร์มให้หรือไม่' },
      ],
      safetyTitle: 'ถ้าคุณบอกว่าเจ็บ เราจะหยุด',
      safetyBody: 'ถ้าคุณพูดถึงอาการเจ็บ บาดเจ็บ เวียนหัว หรือตั้งครรภ์ ระบบจะหยุดจัดโปรแกรมทันทีและส่งต่อให้โค้ชที่เป็นคน เราไม่ให้คำแนะนำทางการแพทย์',
      previewTitle: 'ดูของจริงได้เลย',
      previewBody: 'ตัวอย่างนี้ใช้ข้อมูลของ “มายด์” ที่ผ่านสัปดาห์แรกมาแล้ว และเพิ่งรายงานว่าสัปดาห์ที่สองไม่ได้ทำเลย',
      previewCta: 'เปิดตัวอย่างแอป →',
      demoNote: 'นี่คือต้นแบบสำหรับสาธิต ฟีเจอร์บางส่วนยังเป็นตัวอย่างหน้าตา',
      footer: 'ต้นแบบ · ไม่ใช่คำแนะนำทางการแพทย์',
  },
};

export type Strings = typeof th;

const en: Strings = {
  appName: 'FitHer AI',
    tabs: { home: 'Home', plan: 'Plan', discover: 'Discover', meals: 'Meals', coach: 'Coach' },
    back: 'Back',
    profileAria: 'Profile',
    offline: 'Offline — live sections will return once the API is reachable',
    comingSoon: 'Coming soon',
    viewAll: 'See all',

    hello: (n: string) => `Hi ${n} 👋`,
    welcome: 'Welcome to FitHer',
    helloAnon: 'Welcome 👋',
    welcomeSub: 'Start with a quick chat with your coach.',
    goalIs: (g: string) => `Goal: ${g}`,
    streak: (n: number) => `${n}-week streak`,
    forgiven: 'One rest week — streak kept',
    weekN: (n: number) => `Week ${n}`,
    nextSession: 'Your next session',
    seeThisWeek: "See this week's plan",
    noPlanYet: 'No plan yet',
    noPlanBody: 'Chat with your coach for a minute — tell her what you want and how much time you have, and she will build your first week.',
    startChat: 'Start chatting',
    activeChallenge: 'Active challenge',
    whatsOn: "What's on this week",
    quickActions: 'Quick actions',
    qaSchedule: 'Week schedule',
    qaHistory: 'Plan history',
    qaDevice: 'Connect watch',
    qaWater: 'Log water',

    yourPlan: 'Your plan',
    totalSets: (n: number) => `${n} total sets`,
    whyLabel: 'Why this week looks like this',
    viewList: 'List',
    viewCalendar: 'Calendar',
    minutes: (n: number) => `${n} min`,
    exerciseCount: (n: number) => `${n} exercises`,
    stDone: 'Done', stSkipped: 'Skipped', stTodo: 'To do',
    progress14: 'Completion, weeks 1–4',
    historyLink: 'See plan history and what changed →',
    noPlanThisWeek: 'No plan for this week yet',
    noPlanThisWeekSub: 'Chat with your coach to get your first week.',

    sessionDetail: 'Session',
    notFound: 'Session not found',
    load: 'Load',
    bodyweight: 'Bodyweight',
    watchVideo: 'Watch the movement',
    howTo: 'How to do it',
    commonMistake: 'Most common mistake',
    targets: 'Works on',
    markDone: 'Mark as done',
    doneLabel: 'Done',
    skipToday: 'Skip today',
    skippedLabel: 'Skipped',
    displayOnlyNote: 'This status is for the app only — your real weekly data comes from the LINE check-in.',

    weekSchedule: 'Week schedule',
    noPlanToSchedule: 'No plan to schedule yet',
    tapToMove: 'Tap a session to move, then tap the day you want.',
    movingNow: (t: string) => `Moving “${t}” — tap the new day`,
    selected: 'Selected', move: 'Move',
    checkinDay: 'Check-in: Sunday',
    nextPlanDay: 'New plan: Monday',
    slotCheckin: 'Check-in', slotNewPlan: 'New plan',

    planHistory: 'Plan history',
    nPlans: (n: number) => `${n} plans`,
    noHistory: 'No plan history yet',
    nDays: (n: number) => `${n} days`,
    fromLastWeek: (n: number) => `${n}% vs last week`,
    whatChanged: 'What changed, and why',
    stActive: 'Active', stSuperseded: 'Superseded', stDraft: 'Draft',

    recommendedVenue: 'Recommended for you',
    noVenueYet: 'No recommendation yet',
    noVenueBody: 'When home workouts start feeling easy, tell the coach on LINE you are ready for a gym — we will find one vetted for beginners.',
    whyThisVenue: 'Why this one fits you',
    beginnerFriendly: 'Vetted beginner-friendly',
    notVetted: 'Not vetted',
    viewMap: 'View map',
    communities: 'Communities near you',
    join: 'Join',
    members: (n: number) => `${n} members`,
    eventsThisMonth: 'Events this month',
    signUp: 'Sign up',
    spotsLeft: (n: number) => `${n} spots left`,

    mealsTitle: 'Meals matched to your goal',
    mealsSub: 'Swap any meal',
    thaiFirst: 'Thai food first',
    proteinTarget: 'Protein 1.4 g/kg',
    today: 'Today', tomorrow: 'Tomorrow', dayAfter: 'In two days',
    swap: 'Swap',
    findPlaceTitle: 'Find a place near you',
    findPlaceBody: 'Restaurants with dishes that fit your goal, with rough calories and protein.',
    findPlaceCta: 'Find places near me',
    groceryTitle: 'Weekly grocery list',
    groceryBody: 'Every ingredient rolled up automatically, grouped by supermarket aisle.',
    groceryCta: 'Build grocery list',
    meal: { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' } as Record<string, string>,

    coachTitle: 'Your best coach matches',
    coachSub: 'Matched on your goal, schedule and the style you like',
    topMatches: 'Top matches',
    talkFirst: 'Book intro call',
    years: (n: number) => `${n} yrs`,
    handoffTitle: 'A coach is contacting you',
    handoffBody: 'Automated planning is paused because you reported something a person should look at. A coach will message you on LINE within 24 hours.',
    notSureTitle: 'Not sure you need a coach?',
    notSureBody: 'Answer six questions about your goal and schedule, and we will tell you what kind of coach fits — or whether the automated plan is enough.',
    notSureCta: 'Take the check',

    profile: 'Profile',
    trainingProfile: 'Training profile',
    fName: 'What should we call you?',
    fNamePlaceholder: 'e.g. Mind',
    fGoal: 'Goal',
    fDays: 'Days per week',
    fMinutes: 'Minutes per session',
    fEquipment: 'Equipment you have',
    fExperience: 'Experience',
    fLifeStage: 'Life stage',
    fTone: 'How should your coach talk to you?',
    fToneHint: 'Change this any time — it changes how the coach writes.',
    fMotivation: 'Why you started',
    fTimeframe: 'Timeframe',
    fAbout: 'About you',
    fAboutHint: 'Sets your starting load and lets you track change · optional',
    fAge: 'Age', fHeight: 'Height (cm)', fWeight: 'Weight (kg)',
    fCoachNotes: 'What your coach remembers',
    fInjuries: 'Working around', fDislikes: 'Will not do', fTrainTime: 'Trains', fSleep: 'Sleep',
    hoursN: (n: number) => `${n} h/night`,
    weeksN: (n: number) => `${n} weeks`,
    fLanguage: 'Language',
    save: 'Save',
    saving: 'Saving…',
    savedAppliesNext: 'Saved — applies at your next weekly re-plan',
    savedAppliesNextEn: 'Your current week is left untouched.',
    bodyStats: 'Weight and measurements',
    latestWeight: 'Latest weight',
    kg: 'kg',
    over5w: (d: string) => `${d} kg over 5 weeks`,
    addMeasurement: '+ Add a measurement',
    myJourney: 'My journey',
    noEvents: 'Nothing here yet',
    appearance: 'Appearance',
    themeMode: 'Mode',
    themeSystem: 'System', themeLight: 'Light', themeDark: 'Dark',
    themeAccent: 'Accent colour',
    accentNames: { plum: 'Plum', rose: 'Rose', sage: 'Sage', indigo: 'Indigo', clay: 'Clay' } as Record<string, string>,
    settings: 'Settings',
    sNotif: 'Notifications', sNotifSub: 'Check-in and training day reminders', sConfigure: 'Configure',
    sDevices: 'Connected devices', sConnect: 'Connect',
    sPlanTier: 'Plan', sPlanTierSub: 'Free pilot — every feature during the trial', sFree: 'Free',
    sPrivacy: 'Privacy (PDPA)',
    sPrivacySub: 'We keep only what is needed to build your plan, and you can delete it any time.',
    deleteAll: 'Delete all my data',
    deleteAllSub: 'Removes your profile, plans and history immediately',
    deleteConfirm: 'Delete all your data and start over?',

    quickSetup: 'Quick setup with your own AI',
    quickSetupHint: 'Too much typing? Copy this into ChatGPT or whichever AI you use, then paste its answer here in one go.',
    copyPrompt: 'Copy the prompt',
    copied: 'Copied',
    quickSetupThen: 'Then paste the paragraph it writes into the chat box below.',

    chatTitle: 'Chat with your coach',
    chatSub: 'Here or on LINE — it is the same conversation',
    chatIntro: 'Talk to your coach. This picks up wherever your LINE chat left off.',
    chatIntroNew: 'Saying hello…',
    chatStart: 'Start over',
    chatAskPlan: 'Show my plan',
    chatAskCheckin: 'Check in',
    chatPlaceholder: 'Type a message…',
    chatError: 'Could not send that. Please try again.',
    chatFab: 'Chat',

    landing: {
      nav: 'Open the demo',
      heroKicker: 'An AI strength coach for Thai women',
      heroTitle: 'A workout plan that bends around your actual life',
      heroBody: 'FitHer talks to you on LINE and builds a week around your equipment, your time and how ready you actually are. Miss a week and it restarts lighter — never with guilt.',
      ctaPrimary: 'Open the demo app',
      ctaSecondary: 'Add on LINE',
      noSignup: 'No sign-up. No card. Nothing to install.',
      howTitle: 'How it works',
      how: [
        { icon: '💬', t: 'One minute on LINE', b: 'Five quick questions about your goal, your time and the equipment you have.' },
        { icon: '📋', t: 'Get week one', b: 'With a one-line reason for why this particular week looks the way it does.' },
        { icon: '🤍', t: 'Missing a week is fine', b: 'Tell us at check-in and the next plan gets lighter — not heavier to make up for it.' },
        { icon: '🏋️‍♀️', t: 'Go to a gym when ready', b: 'We only recommend places actually vetted as beginner-friendly.' },
      ],
      whyTitle: 'What makes it different',
      why: [
        { t: 'Adapts to what you really did', b: 'Not a fixed programme. Each week is built from what you actually completed.' },
        { t: 'No guilt language, ever', b: 'Blaming phrasing is detected and blocked before it reaches you — every time.' },
        { t: 'Safety is not left to the AI', b: 'Safety rules are code, checked against every plan: volume rises at most 10% a week, and drops after a missed one.' },
        { t: 'Gyms we have checked', b: 'We look for women-only hours, real beginner classes, and trainers who watch your form.' },
      ],
      safetyTitle: 'If you say it hurts, we stop',
      safetyBody: 'Mention pain, injury, dizziness or pregnancy and planning halts immediately and hands over to a human coach. We do not give medical advice.',
      previewTitle: 'See the real thing',
      previewBody: 'The demo uses Mind\'s data — she finished week one, then reported that she missed week two entirely.',
      previewCta: 'Open the demo app →',
      demoNote: 'This is a prototype. Some sections are visual previews only.',
    footer: 'Prototype · not medical advice',
  },
};

export const STRINGS: Record<Lang, Strings> = { th, en };
