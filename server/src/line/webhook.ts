import type { Config } from '../config.ts';
import type { ChatEvent } from '../conversation/types.ts';
import { routeChat } from '../conversation/router.ts';
import type { Storage } from '../storage/types.ts';
import { toLineMessages } from './adapter.ts';

export interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
  postback?: { data: string };
}

type LineMessage = Record<string, unknown>;

/** HMAC-SHA256, base64 — Web Crypto so the same code runs on Node and Workers. */
export async function verifySignature(secret: string, body: string, signature: string): Promise<boolean> {
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Normalises a LINE event into the surface-neutral shape the router takes. */
export function toChatEvent(event: LineEvent): ChatEvent | null {
  const external_id = event.source?.userId ?? 'line-unknown';
  if (event.type === 'follow') return { type: 'follow', source: 'line', external_id };
  if (event.type === 'postback' && event.postback) {
    return { type: 'postback', source: 'line', external_id, data: event.postback.data };
  }
  if (event.type === 'message' && event.message?.type === 'text') {
    return { type: 'text', source: 'line', external_id, text: event.message.text ?? '' };
  }
  return null; // stickers, images, joins — nothing to answer
}

/** Routes one LINE event and renders the reply as LINE messages. */
export async function routeLineEvent(
  storage: Storage,
  cfg: Config,
  event: LineEvent,
  webUrl: string,
): Promise<LineMessage[]> {
  const chatEvent = toChatEvent(event);
  if (!chatEvent) return [];
  const messages = await routeChat(storage, cfg, chatEvent);
  return toLineMessages(messages, webUrl);
}

/** Sends the collected messages using the reply token (free tier: no pushes). */
export async function replyToLine(cfg: Config, replyToken: string, messages: LineMessage[]): Promise<void> {
  if (!cfg.lineChannelAccessToken) {
    console.warn('[FitHer] LINE_CHANNEL_ACCESS_TOKEN unset — reply skipped (simulator mode).');
    return;
  }
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.lineChannelAccessToken}`,
    },
    body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
  });
  if (!res.ok) console.error('[FitHer] LINE reply failed:', res.status, await res.text());
}
