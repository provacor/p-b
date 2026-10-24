// My Mistake Book: every wrong MCQ answer is saved automatically; mistakes can also be
// added by hand (from a test paper). Each one can be classified — by the AI tutor or
// by hand — into one of five kinds, retried, and marked as fixed. Stored on this device.

const KEY = 'hscos:mistakes:v1';
export const KINDS = [
  ['concept', 'ধারণাগত ভুল', 'Concept mistake', 'violet'],
  ['formula', 'সূত্রের ভুল', 'Formula mistake', 'blue'],
  ['calculation', 'হিসাবের ভুল', 'Calculation mistake', 'amber'],
  ['reading', 'প্রশ্ন পড়ায় ভুল', 'Reading mistake', 'cyan'],
  ['careless', 'অসাবধানতার ভুল', 'Careless mistake', 'rose'],
];
export const kindOf = (id) => KINDS.find((k) => k[0] === id);

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
let list = read();
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full: keep in memory */
  }
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const mistakes = () => list;
export const mistakeById = (id) => list.find((m) => m.id === id);
export const openMistakes = () => list.filter((m) => !m.resolved);

// A wrong MCQ answer (source 'mcq'), a wrong answer in a game ('game') or a card the student
// could not recall ('recall'). The same question answered wrong again bumps its count instead.
// topicId is the সূচিপত্র topic (content/toc.json); when it is missing the view looks it up.
export function recordMcqMistake({ itemId, sectionId, chapterId, topicId, topicName, question, options, chosen, correct, explanation, source = 'mcq' }) {
  const old = itemId ? list.find((m) => m.itemId === itemId) : null;
  if (old) {
    Object.assign(old, { chosen: chosen ?? null, at: Date.now(), times: (old.times ?? 1) + 1, resolved: false });
    if (topicId && !old.topicId) Object.assign(old, { topicId, topicName: topicName ?? old.topicName ?? null });
  } else {
    list.unshift({ id: uid(), source, itemId, sectionId: sectionId ?? null, chapterId: chapterId ?? null, topicId: topicId ?? null, topicName: topicName ?? null, question, options: options ?? null, chosen: chosen ?? null, correct, explanation: explanation ?? '', kind: null, reason: '', times: 1, resolved: false, at: Date.now() });
  }
  save();
  return old ?? list[0];
}

export function addManualMistake({ chapterId, topicId, question, myAnswer, rightAnswer, kind }) {
  const q = String(question ?? '').trim();
  if (!q) return null;
  const m = { id: uid(), source: 'manual', chapterId: chapterId || null, topicId: topicId || null, question: q.slice(0, 2000), myAnswer: String(myAnswer ?? '').trim().slice(0, 1000), rightAnswer: String(rightAnswer ?? '').trim().slice(0, 1000), kind: kind || null, reason: '', times: 1, resolved: false, at: Date.now() };
  list.unshift(m);
  save();
  return m;
}

export function updateMistake(id, patch) {
  const m = mistakeById(id);
  if (!m) return;
  Object.assign(m, patch);
  save();
}

export function deleteMistake(id) {
  list = list.filter((m) => m.id !== id);
  save();
}

// Per-chapter weight of open mistakes (used by the study planner to find weak chapters).
export function mistakeWeight() {
  const w = {};
  for (const m of list) if (!m.resolved && m.chapterId) w[m.chapterId] = (w[m.chapterId] ?? 0) + (m.times ?? 1);
  return w;
}

export const replaceAllMistakes = (arr) => { list = Array.isArray(arr) ? arr : []; save(); };
