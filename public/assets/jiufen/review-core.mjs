import {sentenceClip} from './three-pass.mjs';
import {fsrs,createEmptyCard,Rating,State} from './ts-fsrs.mjs';

// v1: library {version, owner, cards, session, limit}; each card has immutable source
// identifiers plus memory/history. Session owns its persisted queue, current draft,
// reveal/grade and replay preferences; audio replays never create rated attempts.
export const VERSION = 1;
export const SOURCE_GRADING_VERSION = 2;
const list = value => Array.isArray(value) ? value : [];
const clone = value => JSON.parse(JSON.stringify(value));
const text = value => value == null ? '' : String(value);
const id = value => typeof value === 'number' && !Number.isSafeInteger(value) ? '' : text(value);
export function dayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw Error('Invalid date');
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function addDays(day, days) {
  const [year, month, date] = day.split('-').map(Number);
  return dayKey(new Date(year, month-1, date+days, 12));
}
export function newMemory(day = dayKey()) {
  return {ease:2.5, interval:1, streak:0, type:1, difficulty:0, nextDay:day, attempts:0, correct:0, wrong:0, today:'', todayCorrect:0, todayStreak:0};
}
export function safeAudioUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
export function plainText(value) {
  // Store raw source separately. Never insert it as HTML in the review dialog.
  return text(value).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'')
    .replace(/<input\b[^>]*(?:placeholder|data-q-number)=["']([^"']*)["'][^>]*>/gi,' [ $1 ] ')
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|tr|li|h[1-6])>/gi,'\n').replace(/<[^>]*>/g,' ')
    .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').trim();
}
// Original attempt states: 0 = unanswered, 1 = correct, 2 = incorrect.
// Unknown/ungraded values must not be guessed from the expected answer.
export function sourceQuestionCorrectness(q) {
  const value=q?.state??q?.correct??q?.isCorrect;
  if([false,0,2,'0','2','false'].includes(value))return false;
  if([true,1,'1','true'].includes(value))return true;
  return null;
}
const explicitlyWrong = q => sourceQuestionCorrectness(q)===false;
// The source serves translations separately from articleJson; join only by its explicit index.
export function originalTranslations(response) {
  if(response?.hasTranslations===false)return {};
  const result={};
  for(const row of list(response?.translations)){
    const raw=row?.sentenceIndex;
    const index=raw!=null&&String(raw).trim()!==''?Number(raw):Number(typeof row?.sentenceKey==='string'?row.sentenceKey.match(/(\d+)\s*$/)?.[1]:NaN);
    const translated=plainText(row?.zhText);
    if(Number.isSafeInteger(index)&&index>=0&&translated)result[String(index)]=translated;
  }
  return result;
}
export function reviewAnswerLabels(card) {
  return [...new Set(list(Array.isArray(card?.rightAnswer)?card.rightAnswer:[card?.rightAnswer]).map(plainText).filter(Boolean))];
}
export function sentenceAnswerRuns(card, sentence) {
  const value=text(sentence),choice=/choice|matching/i.test(card?.type??'')||list(card?.options).length>0;
  const terms=reviewAnswerLabels(card).flatMap(answer=>{
    if(choice){const option=list(card?.options).find(o=>normalized(o.value)===normalized(answer));return option?.label?[plainText(option.label)]:[];}
    return answer.split(/\s*[|;\/]\s*/).filter(Boolean);
  }).filter(Boolean).sort((a,b)=>b.length-a.length);
  if(!terms.length)return [{text:value,answer:false}];
  const escaped=terms.map(term=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+'));
  const pattern=new RegExp(`(?<![\\p{L}\\p{N}_])(?:${escaped.join('|')})(?![\\p{L}\\p{N}_])`,'giu');
  const runs=[];let offset=0;
  for(const match of value.matchAll(pattern)){if(match.index>offset)runs.push({text:value.slice(offset,match.index),answer:false});runs.push({text:match[0],answer:true});offset=match.index+match[0].length;}
  if(offset<value.length)runs.push({text:value.slice(offset),answer:false});
  return runs;
}
function associatedSentences(part, question) {
  let article = part.articleJson;
  if (typeof article === 'string') { try { article=JSON.parse(article); } catch { return []; } }
  const raw = question.sentenceIndex;
  let indexes = raw;
  if (typeof indexes === 'string') {
    try { indexes=JSON.parse(indexes); } catch {
      indexes=[];
      for (const token of raw.split(/[,，;；\s]+/).filter(Boolean)) {
        const match=token.match(/^(\d+)(?:[-–~](\d+))?$/);
        if (!match) return [];
        const start=Number(match[1]), end=Number(match[2]??match[1]);
        if (end<start || end-start>1000) return [];
        for(let n=start;n<=end;n++) indexes.push(n);
      }
    }
  }
  const wanted = new Set((Array.isArray(indexes)?indexes:indexes==null?[]:[indexes]).map(Number));
  return list(article?.segments).flatMap(s=>list(s.sentences)).filter(s=>wanted.has(Number(s.sentence_index))).map(s=>({index:id(s.sentence_index),text:plainText(s.text),translation:plainText(s.translation??s.translation_text??s.translated_text??s.chinese??s.zh??''),start:s.start_time??null,end:s.end_time??null}));
}
function normalizeOptions(value) {
  return list(value).flatMap(o => {
    const value=id(o.optionNum??o.choice??o.value);
    return value ? [{value,label:plainText(o.option??o.content??o.label)}] : [];
  });
}
export function collectWrongCards(resultId, review) {
  const result=id(resultId);
  review={...review?.result,...review,channel:review?.channel??review?.result?.channel};
  if (!result || review?.channel !== 'listening') return [];
  const cards=[];
  for (const part of list(review.parts)) for (const group of list(part.groups)) {
    const partId=id(part.id??part.partId), groupId=id(group.id??group.groupId);
    if (!partId || !groupId) continue;
    const questions=list(group.questions), unordered=group.type==='multiple-choice' && questions.length>1;
    const batches=unordered?[questions]:questions.map(q=>[q]);
    for (const batch of batches) {
      if (!batch.some(explicitlyWrong)) continue;
      const questionIds=batch.map(q=>id(q.questionId??q.id));
      const numbers=batch.map(q=>id(q.qNumber??q.questionNumber));
      if (questionIds.some(x=>!x||x===groupId) || numbers.some(x=>!x)) continue;
      const sourceKey=JSON.stringify([id(review.unitId??review.originalUnitId??review.unit?.id),partId,groupId,...questionIds]);
      const sentenceRows=batch.flatMap(q=>associatedSentences(part,q));
      const sentences=[...new Map(sentenceRows.map(s=>[s.index,s])).values()];
      const clips=batch.map(q=>sentenceClip(part,q.qNumber??q.questionNumber));
      const audioUrl=safeAudioUrl(part.audioUrl??part.exAudioUrl);
      const clip=audioUrl && clips.every(Boolean)?{url:audioUrl,start:Math.min(...clips.map(c=>c.start)),end:Math.max(...clips.map(c=>c.end))}:null;
      let options=normalizeOptions(batch[0].options);
      if (!options.length) options=normalizeOptions(group.options);
      const rightAnswers=batch.map(q=>q.rightAnswer??q.correctAnswer??null);
      cards.push({key:sourceKey,resultIds:[result],source:{resultId:result,unitId:id(review.unitId??review.originalUnitId??review.unit?.id),partId,partNum:id(part.partNum??part.partNumber??''),groupId,questionIds,numbers},
        title:plainText(review.title??review.unit?.title??part.title??'九分学长听力'),type:batch[0].type??group.type??'',unordered,
        prompt:batch.map(q=>plainText(q.question??q.text)).filter(Boolean).join('\n'),
        groupTitle:plainText(group.title1??group.title),groupSubtitle:plainText(group.title2),
        context:plainText(group.contentHtml),instruction:plainText(group.typeDescription??group.description),options,
        imageUrl:safeAudioUrl(group.imageUrl??group.image),rightAnswer:unordered?rightAnswers:rightAnswers[0],
        userAnswer:unordered?batch.map(q=>q.userAnswer??q.answer??''):batch[0].userAnswer??batch[0].answer??'',
        sentences,clip,audioUrl,rawSource:{group:clone(group),questions:clone(batch),articleJson:clone(part.articleJson??null)},memory:null,history:[]});
    }
  }
  return cards;
}
export function mergeCards(existing, incoming, day=dayKey()) {
  const result=clone(existing), byKey=new Map(result.map(c=>[c.key,c]));
  for (const next of incoming) {
    const old=byKey.get(next.key);
    if (!old) { const card={...clone(next),memory:newMemory(day),firstSeen:day,lastSeen:day};result.push(card);byKey.set(card.key,card);continue; }
    if (next.resultIds.every(r=>old.resultIds.includes(r))) continue;
    const memory={...old.memory,type:3,nextDay:day,dueAt:null};
    // Reappearance reopens the card, but is not a fabricated review attempt.
    const ids=[...new Set([...old.resultIds,...next.resultIds])], history=old.history, firstSeen=old.firstSeen;
    Object.assign(old,clone(next),{resultIds:ids,memory,history,firstSeen,lastSeen:day});
  }
  return result;
}
export function mergeImportedCards(existing,incoming,{completedAt,cutoff,day=dayKey()}={}) {
  const result=clone(existing),byKey=new Map(result.map(card=>[card.key,card]));
  const timestamp=Date.parse(completedAt),baseline=Date.parse(cutoff);
  for(const next of incoming){
    const old=byKey.get(next.key),sourceAt=Number.isFinite(timestamp)?new Date(timestamp).toISOString():null;
    const incomingTimes=Object.fromEntries(next.resultIds.map(id=>[id,sourceAt]));
    if(!old){const card={...clone(next),sourceAt,resultTimes:incomingTimes,memory:newMemory(day),firstSeen:day,lastSeen:day};result.push(card);byKey.set(card.key,card);continue;}
    const unseen=next.resultIds.some(id=>!old.resultIds.includes(id));
    const timestampUpgrade=!!sourceAt&&next.resultIds.some(id=>!old.resultTimes?.[id]);
    if(!unseen&&!timestampUpgrade)continue;
    const ids=[...new Set([...old.resultIds,...next.resultIds])];
    const newer=Number.isFinite(timestamp)&&Number.isFinite(Date.parse(old.sourceAt))&&timestamp>Date.parse(old.sourceAt);
    const recurrence=Number.isFinite(timestamp)&&Number.isFinite(baseline)&&timestamp>baseline;
    const resultTimes={...old.resultTimes};for(const id of next.resultIds)if(!resultTimes[id])resultTimes[id]=sourceAt;
    const preserved={memory:old.memory,history:old.history,firstSeen:old.firstSeen,lastSeen:old.lastSeen,resultIds:ids,resultTimes};
    // Unknown legacy provenance is not permission to replace its most recent answer.
    if(newer)Object.assign(old,clone(next),{sourceAt},preserved);else {old.resultIds=ids;old.resultTimes=resultTimes;if(!old.sourceAt&&old.source?.resultId===next.source?.resultId)old.sourceAt=sourceAt;}
    // A deleted card stays suppressed for historical/undated imports. Only a
    // verified new wrong attempt after deletion may bring it back automatically.
    const revived=!!old.deletedAt&&Number.isFinite(timestamp)&&timestamp>Date.parse(old.deletedAt);
    if(revived)delete old.deletedAt;
    if(recurrence||revived){old.memory={...old.memory,type:3,nextDay:day,dueAt:null};old.lastSeen=day;}
  }
  return result;
}
const shuffle = (items, random) => {
  const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.min(i,Math.max(0,Math.floor(random()*(i+1))));[out[i],out[j]]=[out[j],out[i]];}return out;
};
export const SCHEDULER = 'fsrs-6-ts-fsrs-5.4.2';
export const SENTENCE_RATINGS = Object.freeze({fuzzy:Rating.Again,hard:Rating.Hard,good:Rating.Good,easy:Rating.Easy});
const sentenceScheduler=fsrs({request_retention:.9,enable_fuzz:false,enable_short_term:true});
export const isLearning = card => ['learning','relearning'].includes(card.memory.phase);
export function isReviewDue(card, day=dayKey(), now=Date.now()) {
  return isLearning(card) ? !card.memory.dueAt || card.memory.dueAt<=now : card.memory.nextDay<=day;
}
export function orderSentenceQueue(queue, now=Date.now()) {
  return [...queue].sort((a,b)=>{
    const aw=(a.dueAt||0)>now,bw=(b.dueAt||0)>now;
    if(aw!==bw)return aw?1:-1;
    if(aw)return a.dueAt-b.dueAt;
    return Number(!!b.dueAt)-Number(!!a.dueAt);
  });
}
export function buildQueue(cards, limit, day=dayKey(), random=Math.random, finishedCount=0, now=Date.now()) {
  const eligible=cards.filter(c=>isSentenceEligible(c));
  const learning=eligible.filter(isLearning);
  const due=eligible.filter(c=>!isLearning(c)&&c.memory.type!==1&&isReviewDue(c,day,now));
  const fresh=eligible.filter(c=>!isLearning(c)&&c.memory.type===1&&isReviewDue(c,day,now));
  // null is the persisted unlimited policy; numeric limits are legacy API support.
  const regular=[...shuffle(due,random),...shuffle(fresh,random)].slice(0,limit==null?undefined:Math.max(0,Math.floor(limit)-finishedCount-learning.length));
  return orderSentenceQueue([...learning,...regular].map(c=>({key:c.key,repeated:isLearning(c),immediate:false,...(isLearning(c)?{dueAt:c.memory.dueAt||0}:{})})),now);
}
const normalized = value => text(value).trim().toLocaleLowerCase();
const simpleKey = value => typeof value === 'string' && value.trim() && !/[\/|;()\[\]{}\r\n]|\sor\s/i.test(value);
export function checkAnswer(card, answer) {
  if (card.unordered) {
    if (!Array.isArray(card.rightAnswer) || !card.rightAnswer.length || !card.rightAnswer.every(simpleKey)) return null;
    const expected=card.rightAnswer.map(normalized).sort();
    if (!Array.isArray(answer)) return false;
    return JSON.stringify(answer.map(normalized).sort())===JSON.stringify(expected);
  }
  const keys=Array.isArray(card.rightAnswer)?card.rightAnswer:[card.rightAnswer];
  if (!keys.length || !keys.every(simpleKey)) return null;
  if (card.type==='multiple-choice') return null; // Single-row multi-selection syntax is not defined by the source.
  return keys.some(k=>normalized(k)===normalized(answer));
}
export function gradeAttempt(card, answer, {day=dayKey(),repeated=false,immediate=false,selfGrade}={}) {
  const automatic=checkAnswer(card,answer);
  const correct=automatic===null && typeof selfGrade==='boolean'?selfGrade:automatic;
  return applyMemoryGrade(card,answer,correct,{day,repeated,immediate,selfChecked:automatic===null});
}
function applyMemoryGrade(card,answer,correct,{day,repeated,immediate,selfChecked=false,assessment}={}) {
  const next=clone(card);
  if (correct===null) return {card:next,correct:null,needsSelfCheck:true,updated:false};
  const m=next.memory, beforeType=m.type;
  if(m.today!==day){m.today=day;m.todayCorrect=0;m.todayStreak=0;}
  const beforeToday=m.todayCorrect;
  if (!repeated && !immediate) {
    m.attempts++;
    if(correct){m.ease=Math.min(2.5,Math.round((m.ease+0.1)*10)/10);m.streak++;m.todayStreak++;m.interval=m.streak<=1?Math.floor(m.interval*m.ease):Math.round(m.interval*m.ease);m.correct++;}
    else {m.ease=Math.min(2.5,Math.max(1.3,Math.round((m.ease-0.2)*10)/10));m.interval=1;m.streak=0;m.todayStreak=0;m.wrong++;}
    m.nextDay=addDays(day,m.interval);
    if(beforeType!==4){
      if(correct && (beforeType===1 || beforeType===3)) m.type=m.difficulty===1 || beforeType===3 && m.streak>=3?2:3;
      if(!correct) m.type=beforeType===2?3:m.ease<1.5?4:3;
    }
  }
  if (!immediate && correct) m.todayCorrect++;
  const delayedEligible=beforeType!==4 && !immediate && !([1,2,3].includes(beforeType) && (correct?m.todayCorrect:beforeToday)>=1);
  next.history.push({day,answer:clone(answer),correct,repeated:repeated||immediate,immediate,selfChecked,...(assessment?{assessment}: {})});
  return {card:next,correct,updated:!repeated&&!immediate,delayedEligible};
}
export function insertRetries(queue, card, correct, {delayedEligible=true,immediate=false}={}) {
  const out=clone(queue);
  if (delayedEligible && !immediate) {
    const n=out.length,e=10*card.memory.ease;
    const s=n===1?0:n<=2?1:n>=e?Math.round(e):Math.round(n/25*e);
    const delayed={key:card.key,repeated:true,immediate:false};
    if(s>n || s<=1) out.push(delayed);else out.splice(s,0,delayed);
  }
  if(correct===false) out.unshift({key:card.key,repeated:true,immediate:true});
  return out;
}
export function sentenceAudioClip(card) {return card?.manualClip?{...card.manualClip,url:card.audioUrl||card.clip?.url}:card?.clip;}
export function isSentenceEligible(card, clip=sentenceAudioClip(card)) {
  return !!card && !card.deletedAt && list(card.sentences).some(sentence=>plainText(sentence.text).trim()) && !!clip && !!safeAudioUrl(clip.url)
    && Number.isFinite(clip.start) && Number.isFinite(clip.end) && clip.start>=0 && clip.end>clip.start;
}
const occurrence = id => ({id,played:false,revealed:false,everRevealed:false,translationRevealed:false,grade:null});
function removeDeletedFromSession(session,cards) {
  if(!session?.queue)return session;
  const deleted=new Set(cards.filter(card=>card.deletedAt).map(card=>card.key));
  const previous=session.queue[0]?.key;
  session.queue=session.queue.filter(item=>!deleted.has(item.key));
  if(deleted.has(previous)){
    session.sequence=Math.max(session.sequence||1,session.occurrence?.id||1)+1;
    session.occurrence=occurrence(session.sequence);
    if(session.replay)session.replay.position=0;
  }
  return session;
}
export function deleteReviewCard(library,key,now=Date.now()) {
  const data=clone(library),card=data.cards.find(card=>card.key===key);
  if(!card||card.deletedAt)return data;
  card.deletedAt=new Date(now).toISOString();data.lastDeletedKey=key;
  removeDeletedFromSession(data.session,data.cards);
  return data;
}
export function restoreReviewCard(library,key,day=dayKey(),now=Date.now()) {
  const data=clone(library),card=data.cards.find(card=>card.key===key);
  if(!card?.deletedAt)return data;
  delete card.deletedAt;if(data.lastDeletedKey===key)delete data.lastDeletedKey;
  if(data.session&&!data.session.queue.some(item=>item.key===key)){
    const queue=buildQueue([card],null,day,Math.random,0,now);
    data.session.queue.push(...queue);
  }
  return data;
}
export function createSession(cards, limit, day=dayKey(), random=Math.random, finishedCount=0, now=Date.now()) {
  return {version:VERSION,scheduler:SCHEDULER,mode:'sentence-listening',day,limit,finishedCount,queue:buildQueue(cards,limit,day,random,finishedCount,now),occurrence:occurrence(1),sequence:1,replay:{speed:1,loop:false,position:0},clips:{}};
}
export function restoreSession(saved, cards, day=dayKey()) {
  if (!saved || saved.version!==VERSION || saved.mode!=='sentence-listening' || saved.day!==day || !Array.isArray(saved.queue) || !saved.occurrence) return null;
  const keys=new Set(cards.map(c=>c.key));
  if (saved.queue.some(item=>!keys.has(item.key))) return null;
  return removeDeletedFromSession(clone(saved),cards);
}
export function migrateSentenceSession(library,day=dayKey()) {
  const data=clone(library),old=data.session;
  data.completedKeys??=[];data.finishedCount??=0;data.limit=null;data.day??=day;
  if(old?.mode==='sentence-listening')old.limit=null;
  if(data.sourceGradingVersion!==SOURCE_GRADING_VERSION){
    // Old cards retained the complete graded group and original transcript.
    // Recover omitted siblings locally, without altering any existing card or queue.
    const seen=new Set(),known=new Set(data.cards.map(card=>card.key));
    for(const card of [...data.cards]){
      const source=card.source,raw=card.rawSource;
      if(!source?.resultId||!source.unitId||!source.partId||!source.groupId||!Array.isArray(raw?.group?.questions))continue;
      const stamp=JSON.stringify([source.resultId,source.unitId,source.partId,source.groupId]);
      if(seen.has(stamp))continue;seen.add(stamp);
      const review={channel:'listening',unitId:source.unitId,title:card.title,parts:[{id:source.partId,partNum:source.partNum,audioUrl:card.audioUrl,articleJson:raw.articleJson,groups:[raw.group]}]};
      const incoming=collectWrongCards(source.resultId,review).filter(next=>!known.has(next.key));
      data.cards=mergeImportedCards(data.cards,incoming,{completedAt:card.resultTimes?.[source.resultId]??card.sourceAt??data.sync?.processed?.[source.resultId]?.completedAt,cutoff:data.sync?.cutoff,day});
      for(const next of incoming)known.add(next.key);
    }
    data.sourceGradingVersion=SOURCE_GRADING_VERSION;
  }
  // Move manually verified timing to the card so future plans use it too.
  for(const card of data.cards){if(!card.manualClip&&old?.clips?.[card.key])card.manualClip=clone(old.clips[card.key]);}
  if(old?.mode==='sentence-listening'&&old.scheduler==='anki-sm2-3')old.scheduler=SCHEDULER;
  if(old?.mode==='sentence-listening'&&old.scheduler!==SCHEDULER){
    const seen=new Set();old.queue=old.queue.filter(item=>!seen.has(item.key)&&(seen.add(item.key),true)).map(item=>({key:item.key,repeated:false,immediate:false}));
    old.scheduler=SCHEDULER;
  }
  if(!old || old.mode==='sentence-listening')return data;
  if(!data.dictationSessionBackup)data.dictationSessionBackup=clone(old);
  const next=createSession(data.cards,data.limit,day,Math.random,data.finishedCount||0);
  // Carry every unfinished source identity into a new, ungraded occurrence. The
  // untouched backup retains dictation drafts and retry state without relabeling it.
  if(old.day===day && Array.isArray(old.queue)){
    const seen=new Set(),byKey=new Map(data.cards.map(card=>[card.key,card]));
    next.queue=old.queue.filter(item=>!seen.has(item.key)&&isSentenceEligible(byKey.get(item.key))&&(seen.add(item.key),true)).map(item=>({key:item.key,repeated:false,immediate:false}));
  }
  data.session=next;return data;
}
function sentenceFsrsState(card,now) {
  if(card.memory.fsrs)return {card:clone(card.memory.fsrs),migration:null};
  // Only replay ratings with exact timestamps and known semantics. Day-only legacy
  // self-checks remain untouched in history, never converted to invented FSRS logs.
  const rows=list(card.history).filter(row=>Object.hasOwn(SENTENCE_RATINGS,row.assessment)
    &&(row.scheduler==='anki-sm2-3'||row.scheduler===SCHEDULER)&&Number.isFinite(Date.parse(row.at))&&Date.parse(row.at)<=now)
    .sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  let state=createEmptyCard(rows.length?rows[0].at:now);
  for(const row of rows)state=sentenceScheduler.next(state,row.at,SENTENCE_RATINGS[row.assessment]).card;
  return {card:state,migration:{from:card.memory.scheduler||'legacy',replayed:rows.length,ignored:list(card.history).length-rows.length}};
}
// Every outcome comes directly from the pinned, unmodified upstream FSRS library.
export function previewSentence(card,rating,{now=Date.now()}={}) {
  if(!Object.hasOwn(SENTENCE_RATINGS,rating))throw Error('Invalid rating');
  const previous=sentenceFsrsState(card,now),result=sentenceScheduler.next(previous.card,now,SENTENCE_RATINGS[rating]);
  const state=result.card,phase=({[State.New]:'new',[State.Learning]:'learning',[State.Review]:'review',[State.Relearning]:'relearning'})[state.state];
  const learning=state.state===State.Learning||state.state===State.Relearning;
  const due=state.due.getTime(),minutes=Math.max(1,Math.round((due-now)/60000));
  return {scheduler:SCHEDULER,phase,interval:state.scheduled_days,dueAt:learning?due:null,nextDay:dayKey(due),
    fsrs:clone(state),fsrsLog:clone(result.log),migration:previous.migration,
    label:learning?`${minutes} 分钟后`:`${state.scheduled_days} 天后`};
}
export function assessSentence(card,session,rating,{occurrenceId=session?.occurrence?.id,clip=sentenceAudioClip(card),now=Date.now()}={}) {
  const state=session?.occurrence;
  const blocked=reason=>({accepted:false,reason,card:clone(card),session:clone(session)});
  if(session?.mode!=='sentence-listening'||!state||occurrenceId!==state.id||session.queue[0]?.key!==card.key)return blocked('stale');
  if(state.grade)return blocked('already-graded');
  if(!Object.hasOwn(SENTENCE_RATINGS,rating))return blocked('invalid-rating');
  if(!isSentenceEligible(card,clip))return blocked('pending');
  if(!state.played)return blocked('unplayed');
  if((session.queue[0].dueAt||0)>now)return blocked('not-due');
  const item=session.queue[0],next=clone(session);
  const updated=clone(card),schedule=previewSentence(card,rating,{now}),m=updated.memory,correct=rating!=='fuzzy';
  const {label,fsrsLog,migration,...memorySchedule}=schedule;
  if(!m.fsrs){m.preFsrs=clone(card.memory);m.fsrsMigration={...migration,at:new Date(now).toISOString()};}
  Object.assign(m,memorySchedule);m.attempts=(m.attempts||0)+1;
  if(m.today!==session.day){m.today=session.day;m.todayCorrect=0;m.todayStreak=0;}
  m.correct=(m.correct||0)+(correct?1:0);m.wrong=(m.wrong||0)+(correct?0:1);
  m.streak=correct?(m.streak||0)+1:0;m.todayStreak=correct?(m.todayStreak||0)+1:0;
  m.todayCorrect=(m.todayCorrect||0)+(correct?1:0);m.type=m.phase==='review'&&m.interval>=21?2:3;
  updated.history.push({day:session.day,at:new Date(now).toISOString(),answer:null,correct,repeated:!!item.repeated,immediate:false,selfChecked:true,assessment:rating,revealed:!!state.everRevealed,scheduler:SCHEDULER,interval:m.interval,dueAt:m.dueAt,nextDay:m.nextDay,fsrsLog,fsrsCard:clone(m.fsrs)});
  next.occurrence.grade={rating,correct,updated:true,label};
  const rest=next.queue.slice(1).filter(q=>q.key!==card.key);
  if(isLearning(updated))rest.push({key:card.key,repeated:true,immediate:false,dueAt:m.dueAt});
  next.queue=[next.queue[0],...orderSentenceQueue(rest,now)];
  return {card:updated,correct,updated:true,accepted:true,session:next};
}
export function advanceSentence(session,now=Date.now()) {
  const next=clone(session);
  if(!next.occurrence.grade)return next;
  next.queue.shift();next.queue=orderSentenceQueue(next.queue,now);next.sequence=(next.sequence||1)+1;next.occurrence=occurrence(next.sequence);next.replay.position=0;
  return next;
}
