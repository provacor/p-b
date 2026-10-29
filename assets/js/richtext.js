// Readable bodies for concept / rule / revision / mistake cards.
// The content is stored as plain text (often one long paragraph); this only changes how it is
// shown: sentences get their own lines, inline numbered lists ("1. … 2. …", "Rule 01: … Rule 02: …")
// become real lists, "•" runs become bullets, and labelled parts (ভুল:/সঠিক:, e.g./যেমন:,
// মনে রাখুন:, বিকারক/পরীক্ষা: …) get their own coloured blocks. No text is added or removed.

import { esc } from './components.js?v=202610290912';

const BN = '০১২৩৪৫৬৭৮৯';
const toNum = (s) => Number(String(s).replace(/[০-৯]/g, (d) => BN.indexOf(d)));

// label → style; matched at the start of a segment, case-insensitive for the English ones
const LABELS = [
  [/^(ভুল|Wrong|Incorrect|Original)\s*[:：]/i, 'bad'],
  [/^(সঠিক|Correct|Right)\s*[:：]/i, 'good'],
  [/^(Why|কারণ|ব্যাখ্যা)\s*[:：]/i, 'why'],
  [/^(?:e\.\s?g\.?|Ex\.)\s*[:：\-–—]?\s*|^(?:Examples?|উদাহরণ|যেমন)\s*[:：\-–—]\s*/i, 'ex'],
  [/^(মনে রাখ(?:ুন|ো|বে|বেন)?|মনে রাখার কৌশল|টিপস|Tips?|শর্টকাট|Shortcut|Trick|সতর্কতা|Note|নোট|বি\.দ্র\.|N\.B\.?)\s*[:：\-–—]/i, 'tip'],
  [/^(বিকারক\/পরীক্ষা|বিকারক|পরীক্ষা)\s*[:：]/, 'test'],
  [/^(পর্যবেক্ষণ)\s*[:：]/, 'obs'],
  [/^(সিদ্ধান্ত)\s*[:：]/, 'res'],
  [/^(Structure|Formula|গঠন|কাঠামো(?:\s*\/\s*ফর্মুলা)?|ফর্মুলা|সূত্র)\s*[:：]/i, 'form'],
];
const ICON = { bad: '✗', good: '✓', why: '?', ex: '✎', tip: '💡', test: '🧪', obs: '👁', res: '✔', form: '⚙' };

// where an inline label starts a new block (it must follow a sentence end or a space)
const INLINE_BREAK = /\s(?=(?:e\.g\.|E\.g\.|Example\s*:|উদাহরণ\s*[:：]|যেমন\s*[:：\-–—]|মনে রাখ(?:ুন|ো|বে|বেন)?\s*[:：]|টিপস\s*[:：]|সঠিক\s*[:：]|ভুল\s*[:：]|Why\s*:|Correct\s*:|Structure\s*:|গঠন\s*[:：])\s?)/g;

// Split one line at a run of sequential markers: "1. a 2. b 3. c", "১। a ২। b", "Rule 01: a Rule 02: b", "01: a 02: b".
function splitNumbered(line) {
  const kinds = [
    /(^|\s)((?:Rule|Rules|নিয়ম)\s*([0-9০-৯]{1,2})\s*[:：.)\-–])\s*/gi,
    /(^|\s)(([0-9০-৯]{1,2})\s*[.)।:]\s)/g,
    /(^|\s)(\(([0-9০-৯]{1,2})\)\s)/g,
  ];
  for (const re of kinds) {
    const hits = [...line.matchAll(re)].map((m) => ({ at: m.index + m[1].length, mark: m[2], n: toNum(m[3]) }));
    // keep the longest run that counts up by one
    let best = [];
    for (let i = 0; i < hits.length; i++) {
      const run = [hits[i]];
      for (let j = i + 1; j < hits.length; j++) if (hits[j].n === run[run.length - 1].n + 1) run.push(hits[j]);
      if (run.length > best.length) best = run;
    }
    if (best.length < 2) continue;
    const out = [];
    const head = line.slice(0, best[0].at).trim();
    if (head) out.push({ t: 'p', s: head });
    let tail = '';
    best.forEach((h, k) => {
      const last = k + 1 === best.length;
      const end = last ? line.length : best[k + 1].at;
      let body = line.slice(h.at + h.mark.length, end).trim();
      // the last item ends at its first danda; whatever follows is ordinary text again
      const cut = last ? body.search(/।\s+\S/) : -1;
      if (cut > 0) { tail = body.slice(cut + 1).trim(); body = body.slice(0, cut + 1); }
      out.push({ t: 'n', mark: h.mark.trim().replace(/^\(/, '').replace(/[\s:：.)।\-–]+$/, ''), s: body });
    });
    if (tail) out.push({ t: 'p', s: tail });
    return out;
  }
  return null;
}

// one sentence per line: split after a Bengali danda (।), "?" / "!", or an English full stop / closing
// bracket that is followed by a capital letter (but not after e.g., i.e., Mr. …)
const ABBR = /(?:^|[\s(])(?:e\.g|i\.e|etc|vs|Mr|Mrs|Ms|Dr|St|No|Fig|approx|[A-Z])\.$/i;
function sentences(s) {
  const out = [];
  for (const part of s.split(/(?<=[।!?])\s+(?=\S)|(?<=[a-z0-9\u0980-\u09FF)][.)])\s+(?=[A-Z(])/)) {
    const x = part.trim();
    if (!x) continue;
    if (out.length && (ABBR.test(out[out.length - 1]) || x.length < 4)) out[out.length - 1] += ` ${x}`;
    else out.push(x);
  }
  return out;
}

function labelOf(s) {
  for (const [re, kind] of LABELS) {
    const m = s.match(re);
    if (m) return { kind, label: m[0].replace(/[:：\-–—\s]+$/, ''), rest: s.slice(m[0].length).trim() };
  }
  return null;
}

// A Bengali sentence followed by its English version ("তুমি … - You must …") reads as an example.
const isTranslation = (s) => /[ঀ-৿].*\s[-–—]\s+[A-Z][a-z]/.test(s) && !/[ঀ-৿]/.test(s.split(/\s[-–—]\s+/).pop());

function blocksOf(text) {
  const blocks = [];
  for (const raw of String(text).split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    // bullets written inline: "a • b • c"
    if (line.includes(' • ') || /^[•▪◦➤▸►-]\s/.test(line)) {
      const parts = line.split(/\s*•\s+/).map((x) => x.replace(/^[▪◦➤▸►-]\s+/, '').trim()).filter(Boolean);
      const head = /^[•▪◦➤▸►-]\s/.test(line) ? null : parts.shift();
      if (head) blocks.push(...expand(head));
      for (const p of parts) blocks.push({ t: 'b', s: p });
      continue;
    }
    // long runs written as "a — x; b — y; c — z" or "a | b | c" read better as a list
    const semi = line.split(/;\s+/), bars = line.split(/\s+\|\s+/);
    const list = bars.length >= 3 ? bars : semi.length >= 3 && line.length > 100 ? semi : null;
    if (list) {
      const head = list[0].match(/^(.{0,80}?[:：])\s*(.+)$/);
      if (head) { blocks.push({ t: 'p', s: head[1] }); list[0] = head[2]; }
      for (const x of list) if (x.trim()) blocks.push({ t: 'b', s: x.trim() });
      continue;
    }
    blocks.push(...expand(line));
  }
  return blocks;
}

// "arm (অস্ত্রসজ্জিত করা), beef (অভিযোগ করা), baby (…), …" — a long run of short comma items reads
// better as chips; "a / b / c / d" as a list. Returns null for ordinary prose.
function wordList(s) {
  const slash = s.split(/\s+\/\s+/);
  if (slash.length >= 4 && slash.every((x) => x.length < 140)) return { t: 'b', items: slash };
  const m = s.match(/^(.{0,90}?(?:[:：]|যেমন|e\.g\.|such as|like))\s+(.+)$/i);
  const head = m && m[2].split(',').length >= 6 ? m[1] : '';
  const body = head ? m[2] : s;
  const items = body.split(/,\s+(?![^()]*\))/);
  if (items.length < 6) return null;
  const avg = items.reduce((a, x) => a + x.length, 0) / items.length;
  if (avg > 38 || items.some((x) => x.length > 70)) return null;
  return { t: 'c', head, items };
}

// a line → paragraph / numbered / labelled blocks
function expand(line) {
  const num = splitNumbered(line);
  if (num) return num.flatMap((b) => (b.t === 'p' ? expand(b.s) : [b]));
  const out = [];
  for (const piece of line.split(INLINE_BREAK).map((x) => x.trim()).filter(Boolean)) {
    const lab = labelOf(piece);
    if (lab) { out.push({ t: 'l', ...lab }); continue; }
    for (const s of sentences(piece)) {
      const wl = wordList(s);
      if (wl?.t === 'c') { if (wl.head) out.push({ t: 'p', s: wl.head }); out.push({ t: 'c', items: wl.items }); }
      else if (wl) for (const x of wl.items) out.push({ t: 'b', s: x.trim() });
      else out.push(isTranslation(s) ? { t: 'l', kind: 'ex', label: '', rest: s } : { t: 'p', s });
    }
  }
  return out;
}

const inline = (s) => esc(s)
  // "শব্দ:" / "Term —" at the start of a line reads as a key term
  .replace(/^([^:：।]{2,28}?)(\s?[:：]\s)/, '<b class="rt-key">$1</b>$2')
  // arrows stand out a little
  .replace(/(→|⟶|=&gt;)/g, '<span class="rt-arrow">$1</span>');

// a list item that holds several sentences: first one as the item, the rest as lines under it
const liBody = (t) => sentences(t).map((x, k) => {
  const wl = wordList(x);
  const body = wl?.t === 'c' ? `${wl.head ? inline(wl.head) : ''}${chipsOf(wl.items)}` : inline(x);
  return k ? `<span class="rt-sub">${body}</span>` : body;
}).join('');
const chipsOf = (items) => `<div class="rt-chips">${items.map((x) => `<span>${inline(x.trim().replace(/[,।.]$/, ''))}</span>`).join('')}</div>`;

export function richText(text) {
  const blocks = blocksOf(text);
  if (!blocks.length) return '';
  let html = '';
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.t === 'b' || b.t === 'n') {
      const tag = b.t === 'b' ? 'ul' : 'ol';
      let items = '';
      while (i < blocks.length && blocks[i].t === b.t) {
        const x = blocks[i];
        items += `<li>${x.t === 'n' ? `<span class="rt-mark">${esc(x.mark)}</span>` : ''}<span class="rt-li">${liBody(x.s)}</span></li>`;
        i++;
      }
      i--;
      html += `<${tag} class="rt-list">${items}</${tag}>`;
    } else if (b.t === 'l') {
      const lines = sentences(b.rest).map((x) => {
        const wl = wordList(x);
        if (wl?.t === 'c') return `${wl.head ? `<div>${inline(wl.head)}</div>` : ''}${chipsOf(wl.items)}`;
        if (wl) return `<ul class="rt-list">${wl.items.map((y) => `<li><span>${inline(y.trim())}</span></li>`).join('')}</ul>`;
        return `<div>${inline(x)}</div>`;
      }).join('');
      html += `<div class="rt-lab rt-${b.kind}">${b.label ? `<span class="rt-tag">${ICON[b.kind] ?? ''} ${esc(b.label)}</span>` : `<span class="rt-tag">${ICON[b.kind]}</span>`}${lines}</div>`;
    } else if (b.t === 'c') {
      html += chipsOf(b.items);
    } else {
      // a sentence that is only a bracketed Bengali gloss "(যে ব্যক্তি … বলে)" reads as a translation
      const gloss = /^\([^()]*[\u0980-\u09FF][^()]*\)[।.]?$/.test(b.s);
      html += `<p class="rt-p${gloss ? ' rt-gloss' : ''}">${inline(b.s)}</p>`;
    }
  }
  return `<div class="rt">${html}</div>`;
}
