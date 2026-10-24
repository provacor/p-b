// My Mistake Book page: every mistake shows its subject › paper › chapter › topic, and the book
// can be browsed subject-wise (all subjects), then chapter-wise (every chapter of the subject),
// then topic-wise (the chapter's সূচিপত্র topics).

import { icon } from '../icons.js?v=202610241732';
import { esc } from '../components.js?v=202610241732';
import { mistakes, KINDS, kindOf } from '../mistakes.js?v=202610241732';
import { hasKey } from '../ai.js?v=202610241732';
import { tocOf } from './topic.js?v=202610241732';

export const mistakeState = { filter: 'open', kind: 'all', retry: null, subject: 'all', chapter: null, topic: 'all' };
const bn = (s) => String(s).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
const KEYS = 'কখগঘঙ';
const SOURCE = { mcq: 'MCQ', game: 'গেম', recall: 'মনে করে দেখো', manual: 'নিজে যোগ করা' };

// item id → topic, built once per chapter from content/toc.json
const tpIndex = new Map();
export function topicOf(m) {
  if (!m.chapterId) return null;
  const t = tocOf(m.chapterId);
  if (t && m.topicId) {
    const x = t.topics.find((tp) => tp.id === m.topicId);
    if (x) return { id: x.id, name: x.name, toc: true };
  }
  if (t && m.itemId) {
    let idx = tpIndex.get(m.chapterId);
    if (!idx) {
      idx = new Map();
      for (const tp of t.topics) for (const id of tp.items) idx.set(id, tp);
      tpIndex.set(m.chapterId, idx);
    }
    const x = idx.get(m.itemId) ?? idx.get(String(m.itemId).split('#')[0]);
    if (x) return { id: x.id, name: x.name, toc: true };
  }
  if (m.topicName) return { id: m.topicId ?? `name:${m.topicName}`, name: m.topicName, toc: false };
  return null;
}
const NO_TOPIC = '__none';
const topicKey = (m) => topicOf(m)?.id ?? NO_TOPIC;
const chapterLabel = (ch) => `${ch.number != null ? `${ch.paper?.unitLabel === 'Chapter' || !ch.paper?.unitLabel ? 'অধ্যায়' : ch.paper.unitLabel} ${bn(ch.number)}: ` : ''}${ch.name}`;

function path(model, m) {
  const ch = m.chapterId ? model.byId.get(m.chapterId) : null;
  if (!ch) return `<p class="mk-path none">${icon('layers')} অধ্যায় দেওয়া নেই</p>`;
  const tp = topicOf(m);
  const parts = [
    `<span>${esc(ch.subject?.icon ?? '')} ${esc(ch.subject?.name ?? '')}</span>`,
    ch.paper ? `<span>${esc(ch.paper.name)}</span>` : '',
    `<a href="#/c/${esc(ch.id)}">${esc(chapterLabel(ch))}</a>`,
    tp ? (tp.toc ? `<a href="#/t/${esc(ch.id)}/${esc(tp.id)}">${icon('target')} ${esc(tp.name)}</a>` : `<span>${icon('target')} ${esc(tp.name)}</span>`) : '',
  ].filter(Boolean);
  return `<p class="mk-path">${parts.join('<i>›</i>')}</p>`;
}

function card(model, m) {
  const k = kindOf(m.kind);
  let answers;
  if (m.source === 'recall') {
    answers = `<p class="mk-ans bad">${icon('x')} মনে করতে পারোনি</p>${mistakeState.retry === m.id ? '' : `<p class="mk-ans good">${icon('check')} উত্তর: ${esc(m.correct)}</p>`}`;
  } else if (m.source === 'mcq' || m.source === 'game') {
    answers = `${m.chosen != null && m.options?.[m.chosen] != null ? `<p class="mk-ans bad">${icon('x')} তোমার উত্তর: ${esc(m.options[m.chosen])}</p>` : ''}
       ${mistakeState.retry === m.id ? '' : `<p class="mk-ans good">${icon('check')} সঠিক: ${esc(m.correct)}</p>`}`;
  } else {
    answers = `${m.myAnswer ? `<p class="mk-ans bad">${icon('x')} তোমার উত্তর: ${esc(m.myAnswer)}</p>` : ''}
       ${m.rightAnswer ? `<p class="mk-ans good">${icon('check')} সঠিক: ${esc(m.rightAnswer)}</p>` : ''}`;
  }
  const retry = mistakeState.retry === m.id && m.options?.length
    ? `<div class="opts mk-retry">${m.options.map((o, i) => `<button class="opt" data-mk-answer="${i}" data-mk="${esc(m.id)}"><span class="opt-key">${KEYS[i] ?? i + 1}</span><span>${esc(o)}</span></button>`).join('')}</div>`
    : '';
  const kindSel = `<select class="mk-kind-sel" data-mk-kind="${esc(m.id)}" aria-label="ভুলের ধরন">
      <option value="">ধরন বেছে নাও…</option>
      ${KINDS.map(([id, bnName]) => `<option value="${id}" ${m.kind === id ? 'selected' : ''}>${bnName}</option>`).join('')}
    </select>`;
  const canRetry = (m.source === 'mcq' || m.source === 'game') && m.options?.length > 1 && !m.resolved;
  return `<li class="mk ${m.resolved ? 'fixed' : ''} ${k ? `hue-${k[3]}` : ''}">
      ${path(model, m)}
      <div class="mk-top">
        ${k ? `<span class="mk-badge">${k[1]} <small>${k[2]}</small></span>` : '<span class="mk-badge none">ধরন ঠিক হয়নি</span>'}
        <span class="mk-src">${SOURCE[m.source] ?? ''}</span>
        ${m.times > 1 ? `<span class="mk-times">${bn(m.times)} বার</span>` : ''}
        ${m.resolved ? `<span class="ok-tag">ঠিক হয়েছে</span>` : ''}
      </div>
      <p class="mk-q">${esc(m.question)}</p>
      ${answers}
      ${retry}
      ${m.explanation && mistakeState.retry !== m.id ? `<p class="mk-exp">${esc(m.explanation)}</p>` : ''}
      ${m.reason ? `<p class="mk-reason">${icon('sparkle')} ${esc(m.reason)}</p>` : ''}
      <p class="mk-meta">${new Date(m.at).toLocaleDateString('bn-BD')}</p>
      <div class="mk-actions">
        ${kindSel}
        <button class="chip" data-mk-ai="${esc(m.id)}" ${hasKey() ? '' : 'title="AI সেটিংসে key দাও"'}>${icon('sparkle')} AI দিয়ে ধরন</button>
        ${canRetry ? `<button class="chip" data-mk-retry="${esc(m.id)}">${icon('revision')} আবার চেষ্টা</button>` : ''}
        <button class="chip" data-mk-fix="${esc(m.id)}">${icon('check')} ${m.resolved ? 'আবার খোলো' : 'ঠিক হয়েছে'}</button>
        <button class="task-del" data-mk-del="${esc(m.id)}" aria-label="মুছো">${icon('trash')}</button>
      </div>
    </li>`;
}

const countBy = (list, key) => {
  const c = new Map();
  for (const m of list) { const k = key(m); c.set(k, (c.get(k) ?? 0) + 1); }
  return c;
};
const subjOf = (model, m) => (m.chapterId ? model.byId.get(m.chapterId)?.subject?.id : null) ?? NO_TOPIC;
const badge = (n) => `<b class="mk-n ${n ? '' : 'zero'}">${bn(n)}</b>`;

// The subject → chapter → topic browser.
function browser(model, base) {
  const st = mistakeState;
  const bySubj = countBy(base, (m) => subjOf(model, m));
  const subjChips = `<div class="chip-row mk-subjects">
      <button class="chip ${st.subject === 'all' ? 'on' : ''}" data-mk-subj="all">সব বিষয় ${badge(base.length)}</button>
      ${model.subjects.map((s) => `<button class="chip ${st.subject === s.id ? 'on' : ''}" data-mk-subj="${esc(s.id)}">${esc(s.icon ?? '')} ${esc(s.name)} ${badge(bySubj.get(s.id) ?? 0)}</button>`).join('')}
      ${bySubj.get(NO_TOPIC) ? `<button class="chip ${st.subject === NO_TOPIC ? 'on' : ''}" data-mk-subj="${NO_TOPIC}">অধ্যায় দেওয়া নেই ${badge(bySubj.get(NO_TOPIC))}</button>` : ''}
    </div>`;
  if (st.subject === 'all' || st.subject === NO_TOPIC) return subjChips;
  const subject = model.byId.get(st.subject);
  if (!subject) return subjChips;
  const inSubj = base.filter((m) => subjOf(model, m) === subject.id);
  const byCh = countBy(inSubj, (m) => m.chapterId);
  const chapters = subject.papers.map((p) => `
      <p class="mk-paper">${esc(p.name)}</p>
      ${p.chapters.map((c) => `<button class="mk-ch ${st.chapter === c.id ? 'on' : ''} ${byCh.get(c.id) ? '' : 'mk-zero'}" data-mk-ch="${esc(c.id)}"><span>${esc(chapterLabel(c))}</span>${badge(byCh.get(c.id) ?? 0)}</button>`).join('')}`).join('');
  let topics = '';
  if (st.chapter) {
    const ch = model.byId.get(st.chapter);
    const inCh = inSubj.filter((m) => m.chapterId === st.chapter);
    const byTp = countBy(inCh, topicKey);
    const tocTopics = tocOf(st.chapter)?.topics ?? [];
    const extra = [...new Map(inCh.map((m) => topicOf(m)).filter((t) => t && !t.toc).map((t) => [t.id, t])).values()];
    const list = [...tocTopics.map((t) => ({ id: t.id, name: t.name })), ...extra];
    topics = `<div class="mk-topics">
        <p class="mk-paper">${icon('target')} ${esc(ch?.name ?? '')} — টপিক</p>
        <div class="chip-row">
          <button class="chip ${st.topic === 'all' ? 'on' : ''}" data-mk-tp="all">সব টপিক ${badge(inCh.length)}</button>
          ${list.map((t) => `<button class="chip ${st.topic === t.id ? 'on' : ''} ${byTp.get(t.id) ? '' : 'dim'}" data-mk-tp="${esc(t.id)}">${esc(t.name)} ${badge(byTp.get(t.id) ?? 0)}</button>`).join('')}
          ${byTp.get(NO_TOPIC) ? `<button class="chip ${st.topic === NO_TOPIC ? 'on' : ''}" data-mk-tp="${NO_TOPIC}">টপিক জানা নেই ${badge(byTp.get(NO_TOPIC))}</button>` : ''}
        </div></div>`;
  }
  const cur = st.chapter ? model.byId.get(st.chapter) : null;
  return `${subjChips}
    <details class="mk-chd" ${cur ? '' : 'open'}>
      <summary>${cur ? `${esc(chapterLabel(cur))} <small>· অধ্যায় বদলাও</small>` : `${esc(subject.name)} — অধ্যায়ের তালিকা`}</summary>
      <div class="mk-chapters">
        <button class="mk-ch ${!st.chapter ? 'on' : ''}" data-mk-ch=""><span>${esc(subject.icon ?? '')} ${esc(subject.name)} — সব অধ্যায়</span>${badge(inSubj.length)}</button>
        ${chapters}
      </div>
    </details>
    ${topics}`;
}

function grouped(model, shown) {
  const st = mistakeState;
  let key, label;
  if (st.subject === 'all') {
    key = (m) => subjOf(model, m);
    label = (k) => { const s = model.byId.get(k); return s ? `${s.icon ?? ''} ${s.name}` : 'অধ্যায় দেওয়া নেই'; };
  } else if (!st.chapter) {
    key = (m) => m.chapterId ?? NO_TOPIC;
    label = (k) => { const c = model.byId.get(k); return c ? chapterLabel(c) : 'অধ্যায় দেওয়া নেই'; };
  } else {
    key = topicKey;
    label = (k) => (k === NO_TOPIC ? 'টপিক জানা নেই' : shown.map(topicOf).find((t) => t?.id === k)?.name ?? k);
  }
  const groups = new Map();
  for (const m of shown) { const k = key(m); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); }
  return [...groups.entries()].map(([k, arr]) => `<h3 class="mk-group">${esc(label(k))} <span>${bn(arr.length)}টি</span></h3>
      <ul class="mk-list">${arr.map((m) => card(model, m)).join('')}</ul>`).join('');
}

export function mistakesView(model) {
  const st = mistakeState;
  const all = mistakes();
  const open = all.filter((m) => !m.resolved);
  const counts = Object.fromEntries(KINDS.map(([id]) => [id, open.filter((m) => m.kind === id).length]));
  const unclassified = open.filter((m) => !m.kind).length;
  const max = Math.max(1, ...Object.values(counts));
  let base = all.filter((m) => (st.filter === 'open' ? !m.resolved : st.filter === 'fixed' ? m.resolved : true));
  if (st.kind !== 'all') base = base.filter((m) => (st.kind === 'none' ? !m.kind : m.kind === st.kind));
  let shown = base;
  if (st.subject !== 'all') shown = shown.filter((m) => subjOf(model, m) === st.subject);
  if (st.chapter) shown = shown.filter((m) => m.chapterId === st.chapter);
  if (st.chapter && st.topic !== 'all') shown = shown.filter((m) => topicKey(m) === st.topic);

  const bars = KINDS.map(([id, bnName, en, hue]) => `<button class="mk-bar hue-${hue} ${st.kind === id ? 'on' : ''}" data-mk-filter-kind="${id}">
      <span class="mk-bar-label">${bnName}<small>${en}</small></span>
      <span class="mk-bar-track"><span style="width:${(counts[id] / max) * 100}%"></span></span>
      <b>${bn(counts[id])}</b></button>`).join('');

  const chapterOpts = model.subjects.map((s) => `<optgroup label="${esc(`${s.icon ?? ''} ${s.name}`)}">${s.papers.flatMap((p) => p.chapters).map((c) => `<option value="${esc(c.id)}" ${st.chapter === c.id ? 'selected' : ''}>${esc(c.paper?.name ?? '')} · ${esc(chapterLabel(c))}</option>`).join('')}</optgroup>`).join('');
  const formTopics = st.chapter ? topicOptions(st.chapter) : '';

  const ch = st.chapter ? model.byId.get(st.chapter) : null;
  const subject = st.subject !== 'all' ? model.byId.get(st.subject) : null;
  const tpName = st.chapter && st.topic !== 'all' ? (st.topic === NO_TOPIC ? 'টপিক জানা নেই' : (tocOf(st.chapter)?.topics.find((t) => t.id === st.topic)?.name ?? shown.map(topicOf).find((t) => t?.id === st.topic)?.name ?? '')) : '';
  const crumb = [subject ? `${subject.icon ?? ''} ${subject.name}` : st.subject === NO_TOPIC ? 'অধ্যায় দেওয়া নেই' : 'সব বিষয়', ch ? chapterLabel(ch) : '', tpName].filter(Boolean).map(esc).join(' › ');

  return {
    nav: 'progress',
    title: 'Mistake Book',
    back: '#/progress',
    html: `<header class="page-title rise"><p class="eyebrow">My Mistake Book</p><h1>ভুলের খাতা</h1>
        <p class="muted">MCQ-তে ভুল করলে, গেমে ভুল হলে বা কার্ডে মনে না পড়লে এখানে জমা হয় — বিষয়, অধ্যায় আর টপিক ধরে সাজানো। খোলা ভুল ${bn(open.length)}টি, মোট ${bn(all.length)}টি।</p></header>

      <section class="card rise" style="--i:1">
        <h2 class="card-title">${icon('layers')} বিষয় › অধ্যায় › টপিক</h2>
        ${browser(model, base)}
      </section>

      <section class="card rise" style="--i:2">
        <h2 class="card-title">${icon('chart')} কোন ধরনের ভুল বেশি</h2>
        <div class="mk-bars">${bars}</div>
        ${unclassified ? `<button class="link" data-mk-filter-kind="none">${bn(unclassified)}টির ধরন এখনো ঠিক হয়নি →</button>` : ''}
      </section>

      <div class="chip-row mk-filters rise" style="--i:3">
        ${[['open', 'খোলা'], ['fixed', 'ঠিক হয়েছে'], ['all', 'সব']].map(([v, l]) => `<button class="chip ${st.filter === v ? 'on' : ''}" data-mk-filter="${v}">${l}</button>`).join('')}
        ${st.kind !== 'all' ? `<button class="chip on" data-mk-filter-kind="all">${esc(st.kind === 'none' ? 'ধরন ঠিক হয়নি' : kindOf(st.kind)[1])} ✕</button>` : ''}
      </div>
      <p class="mk-crumb">${icon('target')} ${crumb} — ${bn(shown.length)}টি ভুল</p>

      ${shown.length ? grouped(model, shown)
        : `<div class="empty sm"><div class="empty-art">${icon('check')}</div><h2>${all.length ? 'এখানে কোনো ভুল নেই' : 'এখনো কোনো ভুল নেই'}</h2><p>${all.length ? 'অন্য বিষয়, অধ্যায় বা ফিল্টার দেখো।' : 'MCQ অনুশীলনে বা গেমে ভুল করলে, কিংবা নিচে নিজে যোগ করলে এখানে আসবে।'}</p></div>`}

      <details class="card mk-add rise" style="--i:4">
        <summary>${icon('notes')} পরীক্ষার খাতা থেকে ভুল যোগ করো</summary>
        <form class="mk-form" data-mk-form>
          <select name="chapter" data-mk-form-ch aria-label="অধ্যায়"><option value="">বিষয় ও অধ্যায় (ঐচ্ছিক)</option>${chapterOpts}</select>
          <select name="topic" data-mk-form-tp aria-label="টপিক" ${formTopics ? '' : 'hidden'}>${formTopics}</select>
          <textarea name="question" rows="3" required maxlength="2000" placeholder="প্রশ্নটা লেখো"></textarea>
          <input name="mine" maxlength="1000" placeholder="আমার উত্তর ছিল…">
          <input name="right" maxlength="1000" placeholder="সঠিক উত্তর…">
          <select name="kind" aria-label="ভুলের ধরন"><option value="">ধরন (না জানলে AI দিয়ে পরে ঠিক করো)</option>${KINDS.map(([id, b, en]) => `<option value="${id}">${b} — ${en}</option>`).join('')}</select>
          <button class="btn btn-primary tap" type="submit">${icon('check')}<span>যোগ করো</span></button>
        </form>
      </details>`,
  };
}

// <option>s of a chapter's topics for the add form ('' when the chapter has no সূচিপত্র).
export function topicOptions(chapterId) {
  const tps = tocOf(chapterId)?.topics ?? [];
  if (!tps.length) return '';
  return `<option value="">টপিক (ঐচ্ছিক)</option>${tps.map((t) => `<option value="${esc(t.id)}" ${mistakeState.topic === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}`;
}
