import { useState } from 'react';
import { useI18n } from '../lib/i18n.tsx';

/**
 * Not everyone wants to answer nine questions one at a time in a chat box.
 * This hands her a prompt to paste into whichever AI she already uses; it
 * interviews her there, and she pastes one paragraph back here. The coach
 * extracts every field from that paragraph in a single turn.
 */
const PROMPT_TH = `ช่วยสัมภาษณ์ฉันสั้น ๆ เพื่อเริ่มโปรแกรมออกกำลังกาย

สำคัญ: ถ้าคุณจำอะไรเกี่ยวกับฉันได้อยู่แล้ว (อายุ ส่วนสูง น้ำหนัก ตารางชีวิต อาการบาดเจ็บ หรือเป้าหมายที่เคยคุยกัน) ให้ใช้ข้อมูลนั้นเลย อย่าถามซ้ำ บอกฉันด้วยว่าคุณดึงอะไรมาจากความจำบ้าง แล้วถามเฉพาะส่วนที่ยังไม่รู้ ทีละข้อ

ถามเรื่องนี้:
1. เป้าหมาย (แข็งแรงขึ้น / ลดไขมัน / มีแรงมากขึ้น / สร้างนิสัย) และเหตุผลที่อยากเริ่ม
2. มีกรอบเวลาไหม เช่น อีกกี่เดือน หรือมีงานอะไรที่อยากพร้อมทัน
3. สัปดาห์ละกี่วัน ครั้งละกี่นาที และสะดวกช่วงเช้า กลางวัน หรือเย็น
4. มีอุปกรณ์อะไรบ้าง (ดัมเบล ลู่วิ่ง เสื่อ ยางยืด หรือไม่มีเลย)
5. เคยออกกำลังกายแบบมีโปรแกรมไหม (ไม่เคย / เคยแล้วหยุดไป / ทำอยู่ประจำ)
6. มีตรงไหนเคยเจ็บหรือต้องระวังไหม และมีท่าไหนที่ไม่ชอบทำ
7. อายุ ส่วนสูง น้ำหนัก (ไม่สะดวกบอกก็ข้ามได้)
8. นอนคืนละกี่ชั่วโมงโดยประมาณ
9. อยากให้โค้ชคุยด้วยแบบไหน อ่อนโยนไม่กดดัน / ปกติ / ตรงไปตรงมาช่วยผลัก

พอถามครบแล้ว สรุปคำตอบทั้งหมดเป็นย่อหน้าเดียวเป็นภาษาไทย เขียนเหมือนฉันเล่าให้โค้ชฟัง ไม่ต้องใส่หัวข้อหรือ bullet
ข้อไหนฉันไม่อยากตอบก็ข้ามไปได้ ไม่ต้องเดาแทนฉัน`;

const PROMPT_EN = `Interview me briefly so I can start a workout programme.

Important: if you already remember anything about me — age, height, weight, my
schedule, past injuries, goals we have discussed — use it instead of asking again.
Tell me what you pulled from memory, then ask only about what you do not know,
one question at a time.

Ask me about:
1. My goal (get stronger / lose fat / more energy / build the habit) and why I want to start
2. Any timeframe — how many months, or an occasion I want to be ready for
3. How many days a week, how long per session, and whether morning, midday or evening suits me
4. What equipment I have (dumbbells, treadmill, mat, resistance band, or nothing)
5. Whether I have followed a training programme before (never / used to and stopped / train regularly)
6. Any past injuries or areas to be careful with, and any movements I dislike
7. Age, height, weight (fine to skip)
8. Roughly how many hours I sleep
9. How I want my coach to talk to me: gentle and no pressure / balanced / direct and pushing

When you have all the answers, write them up as ONE paragraph in plain English, as if I were telling my coach. No headings, no bullet points.
If I skip something, leave it out — do not guess on my behalf.`;

export default function QuickSetup() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const prompt = lang === 'en' ? PROMPT_EN : PROMPT_TH;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      // Clipboard can be blocked; the textarea below is still selectable.
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="quicksetup">
      <button className="quicksetup-toggle" onClick={() => setOpen((v) => !v)}>
        <span>✨ {t.quickSetup}</span>
        <span aria-hidden>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="quicksetup-body">
          <p>{t.quickSetupHint}</p>
          <button className="btn sm" onClick={copy}>
            {copied ? `✓ ${t.copied}` : `📋 ${t.copyPrompt}`}
          </button>
          <textarea readOnly value={prompt} rows={8} onFocus={(e) => e.currentTarget.select()} />
          <p className="quicksetup-step">{t.quickSetupThen}</p>
        </div>
      )}
    </div>
  );
}
