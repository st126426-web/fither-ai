import type { ChatCard } from '../conversation/types.ts';
import { DAY_TH } from '../lib/util.ts';

type PlanCard = Extract<ChatCard, { kind: 'plan' }>;
type CheckinCard = Extract<ChatCard, { kind: 'checkin' }>;
type VenueCard = Extract<ChatCard, { kind: 'venue' }>;

const BRAND = '#7C5CBF';
const INK = '#2E2A35';
const MUTED = '#8A8394';
const OK = '#2E8B63';

type Flex = Record<string, unknown>;

export function textMessage(text: string, quickReplies?: { label: string; data: string }[]): Flex {
  const msg: Flex = { type: 'text', text: text.slice(0, 4900) };
  if (quickReplies?.length) {
    msg.quickReply = {
      items: quickReplies.slice(0, 13).map((q) => ({
        type: 'action',
        action: { type: 'postback', label: q.label.slice(0, 20), data: q.data, displayText: q.label },
      })),
    };
  }
  return msg;
}

function label(text: string, size = 'sm', color = MUTED, weight?: string): Flex {
  return { type: 'text', text, size, color, ...(weight ? { weight } : {}), wrap: true };
}

function divider(): Flex {
  return { type: 'separator', margin: 'md', color: '#EFECF4' };
}

/** Plan card — one bubble per session, carousel across the week. */
export function planCardFlex(card: PlanCard, webUrl: string): Flex {
  const bubbles = card.sessions.slice(0, 10).map((s, i) => ({
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: BRAND,
      contents: [
        { type: 'text', text: `วัน${DAY_TH[s.day] ?? s.day}`, color: '#FFFFFF', size: 'xs' },
        { type: 'text', text: s.title_th, color: '#FFFFFF', weight: 'bold', size: 'md', wrap: true },
        { type: 'text', text: `${s.title_en} · ${s.duration_min} นาที`, color: '#EADFFA', size: 'xxs', wrap: true },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px',
      contents: s.exercises.map((x) => ({
        type: 'box', layout: 'vertical', spacing: 'none',
        contents: [
          {
            type: 'text',
            text: `${x.name_th} (${x.name_en})`,
            size: 'sm', color: INK, wrap: true, weight: 'bold',
          },
          label(`${x.sets} เซต × ${x.reps} ครั้ง · ${x.load_note || 'น้ำหนักตัว'}`, 'xxs'),
        ],
      })),
    },
    footer: {
      type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '10px',
      contents: [
        {
          type: 'button', style: 'link', height: 'sm',
          action: { type: 'uri', label: 'ดูวิดีโอท่า', uri: s.exercises[0]?.video_url || FALLBACK_VIDEO },
        },
        {
          type: 'button', style: 'primary', height: 'sm', color: BRAND,
          action: { type: 'uri', label: 'เปิดในเว็บแอป', uri: `${webUrl}#/u/mind/session/${i}` },
        },
      ],
    },
  }));

  // Leading summary bubble carrying the why-line.
  bubbles.unshift({
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#F3EFFB',
      contents: [
        { type: 'text', text: `สัปดาห์ที่ ${card.week_number}`, size: 'xs', color: BRAND, weight: 'bold' },
        { type: 'text', text: 'แผนของคุณ', size: 'xl', weight: 'bold', color: INK },
      ],
    } as Flex,
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px',
      contents: [
        label('ทำไมสัปดาห์นี้เป็นแบบนี้', 'xxs', BRAND, 'bold'),
        { type: 'text', text: card.why_th ?? '', size: 'sm', color: INK, wrap: true },
        divider(),
        {
          type: 'box', layout: 'horizontal',
          contents: [
            label(`${card.sessions.length} วัน`, 'xs'),
            label(`${card.volume_total_sets} เซตรวม`, 'xs'),
            ...(card.delta_vs_prev_pct !== null
              ? [label(`${card.delta_vs_prev_pct > 0 ? '+' : ''}${card.delta_vs_prev_pct}%`, 'xs',
                card.delta_vs_prev_pct <= 0 ? OK : BRAND, 'bold')]
              : []),
          ],
        },
      ],
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '10px',
      contents: [{
        type: 'button', style: 'primary', height: 'sm', color: BRAND,
        action: { type: 'uri', label: 'เปิดเว็บแอป', uri: `${webUrl}#/u/mind/plan` },
      }],
    },
  } as never);

  return {
    type: 'flex',
    altText: `แผนสัปดาห์ที่ ${card.week_number} พร้อมแล้ว`,
    contents: { type: 'carousel', contents: bubbles },
  };
}

/** Check-in card — per-session Done/Partial/Skipped postbacks. */
export function checkinCardFlex(card: CheckinCard): Flex {
  const weekNumber = card.week_number;
  return {
    type: 'flex',
    altText: `เช็คอินสัปดาห์ที่ ${weekNumber}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '16px', backgroundColor: BRAND,
        contents: [
          { type: 'text', text: `เช็คอินสัปดาห์ที่ ${weekNumber}`, color: '#FFFFFF', weight: 'bold', size: 'lg' },
          { type: 'text', text: 'สัปดาห์ที่ผ่านมาเป็นอย่างไรบ้างคะ', color: '#EADFFA', size: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px',
        contents: card.sessions.map((s, i) => ({
          type: 'box', layout: 'vertical', spacing: 'xs',
          contents: [
            { type: 'text', text: `วัน${DAY_TH[s.day] ?? s.day} · ${s.title_th}`, size: 'sm', color: INK, weight: 'bold', wrap: true },
            {
              type: 'box', layout: 'horizontal', spacing: 'xs',
              contents: [
                miniButton('ทำแล้ว', `action=checkin_session&i=${i}&state=done`, OK),
                miniButton('บางส่วน', `action=checkin_session&i=${i}&state=partial`, '#C98A2E'),
                miniButton('ข้าม', `action=checkin_session&i=${i}&state=skipped`, MUTED),
              ],
            },
          ],
        })),
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px',
        contents: [
          { type: 'text', text: 'หรือรายงานทั้งสัปดาห์รวดเดียว', size: 'xxs', color: MUTED, align: 'center' },
          {
            type: 'button', style: 'primary', height: 'sm', color: BRAND,
            action: { type: 'postback', label: 'สัปดาห์นี้ไม่ได้ทำเลย', data: 'action=checkin_all&state=skipped', displayText: 'สัปดาห์นี้ไม่ได้ทำเลยค่ะ' },
          },
          {
            type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'postback', label: 'ทำครบทุกวัน', data: 'action=checkin_all&state=done', displayText: 'ทำครบทุกวันค่ะ' },
          },
        ],
      },
    },
  };
}

function miniButton(text: string, data: string, color: string): Flex {
  return {
    type: 'button', style: 'secondary', height: 'sm', flex: 1,
    action: { type: 'postback', label: text, data, displayText: text },
    color: '#FFFFFF',
    ...(color ? {} : {}),
  };
}

/** Venue card — partner recommendation, or a clearly-labelled fallback. */
export function venueCardFlex(v: VenueCard): Flex {
  const mapUri = v.lat && v.lng
    ? `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v.name} ${v.area}`)}`;

  return {
    type: 'flex',
    altText: `แนะนำที่ออกกำลังกาย: ${v.name}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        backgroundColor: v.vetted ? '#EAF5EF' : '#FDF2E7',
        contents: [
          {
            type: 'text',
            text: v.vetted ? 'Beginner-friendly ✓' : '⚠️ ยังไม่ผ่านการตรวจสอบ',
            size: 'xs', weight: 'bold', color: v.vetted ? OK : '#B4761F',
          },
          { type: 'text', text: v.name, size: 'lg', weight: 'bold', color: INK, wrap: true },
          { type: 'text', text: `${v.area}${v.price_tier ? ` · ${'฿'.repeat(v.price_tier)}` : ''}`, size: 'xs', color: MUTED },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px',
        contents: [
          label('ทำไมที่นี่ถึงเหมาะกับคุณ', 'xxs', BRAND, 'bold'),
          ...v.reasons_th.slice(0, 3).map((r) => ({
            type: 'box', layout: 'baseline', spacing: 'sm',
            contents: [
              { type: 'text', text: '•', size: 'sm', color: BRAND, flex: 0 },
              { type: 'text', text: r, size: 'sm', color: INK, wrap: true, flex: 1 },
            ],
          })),
          ...(v.note_th ? [divider(), { type: 'text', text: v.note_th, size: 'xs', color: MUTED, wrap: true }] : []),
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [{
          type: 'button', style: 'primary', height: 'sm', color: BRAND,
          action: { type: 'uri', label: 'ดูแผนที่', uri: mapUri },
        }],
      },
    },
  };
}

export function handoffCard(): Flex {
  return {
    type: 'flex',
    altText: 'โค้ชจะติดต่อกลับ',
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '18px',
        contents: [
          { type: 'text', text: '🤝 ส่งต่อให้โค้ชที่เป็นคน', weight: 'bold', size: 'md', color: INK },
          {
            type: 'text',
            text: 'เราหยุดจัดโปรแกรมอัตโนมัติไว้ก่อนค่ะ โค้ชจะติดต่อกลับหาคุณ ถ้าอาการไม่ดีขึ้นแนะนำให้พบแพทย์นะคะ',
            size: 'sm', color: MUTED, wrap: true,
          },
        ],
      },
    },
  };
}

/** Generic mock card used by the rich menu's mock cells — same JSON as the web app. */
export function mockListCard(opts: {
  title: string; subtitle: string; accent?: string;
  rows: { title: string; sub: string; badge?: string }[];
  webUrl: string; deepLink: string;
}): Flex {
  return {
    type: 'flex',
    altText: opts.title,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '16px', backgroundColor: opts.accent ?? '#F3EFFB',
        contents: [
          { type: 'text', text: opts.title, weight: 'bold', size: 'lg', color: INK },
          { type: 'text', text: opts.subtitle, size: 'xs', color: MUTED, wrap: true },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px',
        contents: opts.rows.slice(0, 4).map((r) => ({
          type: 'box', layout: 'horizontal', spacing: 'sm',
          contents: [
            {
              type: 'box', layout: 'vertical', flex: 1, spacing: 'none',
              contents: [
                { type: 'text', text: r.title, size: 'sm', weight: 'bold', color: INK, wrap: true },
                { type: 'text', text: r.sub, size: 'xxs', color: MUTED, wrap: true },
              ],
            },
            ...(r.badge ? [{ type: 'text', text: r.badge, size: 'xs', color: BRAND, weight: 'bold', flex: 0, gravity: 'center' }] : []),
          ],
        })),
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [{
          type: 'button', style: 'primary', height: 'sm', color: BRAND,
          action: { type: 'uri', label: 'ดูทั้งหมดในเว็บแอป', uri: `${opts.webUrl}#${opts.deepLink}` },
        }],
      },
    },
  };
}

const FALLBACK_VIDEO = 'https://www.youtube.com/results?search_query=beginner+strength+training';
