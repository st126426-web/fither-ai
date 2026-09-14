import type { AgentMessage, ChatCard } from '../conversation/types.ts';
import {
  checkinCardFlex, handoffCard, mockListCard, planCardFlex, textMessage, venueCardFlex,
} from './messages.ts';

type LineMessage = Record<string, unknown>;

/**
 * Renders surface-neutral agent messages as LINE messages. LINE is Thai-first,
 * so the Thai side is always what gets sent; the English side exists for the
 * web app.
 */
export function toLineMessages(messages: AgentMessage[], webUrl: string): LineMessage[] {
  const out: LineMessage[] = [];
  for (const m of messages) {
    if (m.text_th) {
      out.push(textMessage(
        m.text_th,
        m.quick_replies?.map((q) => ({ label: q.label_th, data: q.data })),
      ));
    }
    if (m.card) out.push(cardToFlex(m.card, webUrl));
  }
  // LINE accepts at most five messages per reply.
  return out.slice(0, 5);
}

function cardToFlex(card: ChatCard, webUrl: string): LineMessage {
  switch (card.kind) {
    case 'plan': return planCardFlex(card, webUrl);
    case 'checkin': return checkinCardFlex(card);
    case 'venue': return venueCardFlex(card);
    case 'handoff': return handoffCard();
    case 'mock_list':
      return mockListCard({
        title: card.title_th,
        subtitle: card.subtitle_th,
        accent: card.accent,
        rows: card.rows.map((r) => ({ title: r.title_th, sub: r.sub_th, badge: r.badge })),
        webUrl,
        deepLink: card.deep_link,
      });
  }
}
