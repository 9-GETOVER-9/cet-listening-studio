import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { compareNCEText } from '@/lib/nceShadowing';
const annotationSettings=vi.hoisted(()=>({enabled:true,linking:true,weak:true,phrases:true}));
vi.mock('@/store/settingsStore',()=>({useSettingsStore:(selector:(value:unknown)=>unknown)=>selector({sentenceAnnotations:annotationSettings})}));
const modules = import.meta.glob('./NCEPracticePanel.tsx');
async function api() { expect(modules['./NCEPracticePanel.tsx'], 'NCE practice panel must exist').toBeDefined(); return await modules['./NCEPracticePanel.tsx']() as typeof import('./NCEPracticePanel'); }
it('hides original, translation, name marking and answer-derived annotation until checked', async () => {
    const p = await api();
    const props = { text: 'John lives in London', translation: '约翰住伦敦', hidden: true, evaluation: null, spans: [], onSpans: () => { } };
    const hidden = renderToStaticMarkup(createElement(p.NCEPracticePanel, props));
    expect(hidden).not.toContain('John');
    expect(hidden).not.toContain('约翰');
    expect(hidden).not.toContain('专有名词标记');
    const shown = renderToStaticMarkup(createElement(p.NCEPracticePanel, { ...props, hidden: false }));
    expect(shown).toContain('John');
    expect(shown).toContain('专有名词标记');
});
it('provides a local recording panel with privacy and backup explanation', async () => {
 const panels=import.meta.glob('./NCERecordingPanel.tsx');expect(panels['./NCERecordingPanel.tsx']).toBeDefined();
 const p=await panels['./NCERecordingPanel.tsx']() as typeof import('./NCERecordingPanel');
 const html=renderToStaticMarkup(createElement(p.NCERecordingPanel,{owner:'guest',cardId:'c',moduleId:'m',onBusyChange:()=>{},onAudio:()=>{},playbackSignal:0}));
 expect(html).toContain('个人录音');expect(html).toContain('不上传');expect(html).toContain('下载备份');expect(html).not.toContain('待开发');
});

it('shows accessible inline pronunciation by default without opening the full analysis', async () => {
 const p=await api();const html=renderToStaticMarkup(createElement(p.NCEPracticePanel,{text:'at a bank',translation:'在银行',hidden:false,evaluation:null,spans:[],onSpans:()=>{},analysis:{phrases:[],grammar:[],pronunciation:[{type:'连读',example:'at_a bank'}]},analysisUnlocked:true}));
 expect(html).toContain('data-annotation="linking"');
});
it('keeps the translation collapsed until requested in the simple visible exercise', async () => {
 const p=await api();const html=renderToStaticMarkup(createElement(p.NCEPracticePanel,{text:'Read aloud.',translation:'大声朗读。',hidden:false,evaluation:null,spans:[],onSpans:()=>{}}));
 expect(html).toContain('翻译');expect(html).not.toContain('大声朗读。');
});
it('uses red for omitted words and a stronger green for correct words',async()=>{
 const p=await api();const html=renderToStaticMarkup(createElement(p.NCEPracticePanel,{text:'Read this aloud.',translation:'大声朗读。',hidden:false,evaluation:compareNCEText('Read this aloud.','Read aloud.'),spans:[],onSpans:()=>{}}));
 expect(html).toContain('bg-red-100');expect(html).toContain('bg-green-100');expect(html).not.toContain('bg-orange-50');
});

it('retains existing sentence annotations only when display and existing card access both allow them',async()=>{
 const p=await api();const analysis:import('@/types').AIAnalysis={phrases:[{phrase:'at a bank',meaning:'在银行'}],grammar:[],pronunciation:[{type:'连读',example:'at_a bank'},{type:'弱读',example:'a /ə/'}]};const props={text:'at a bank',translation:'在银行',hidden:false,evaluation:null,spans:[],onSpans:()=>{},analysis,showAnnotations:true,analysisUnlocked:true};const html=renderToStaticMarkup(createElement(p.NCEPracticePanel,props));expect(html).toContain('data-annotation="linking weak phrases"');expect(html).toContain('原句标注图例');expect(renderToStaticMarkup(createElement(p.NCEPracticePanel,{...props,analysisUnlocked:false}))).not.toContain('data-annotation');expect(renderToStaticMarkup(createElement(p.NCEPracticePanel,{...props,showAnnotations:false}))).not.toContain('data-annotation');const hidden=renderToStaticMarkup(createElement(p.NCEPracticePanel,{...props,hidden:true}));expect(hidden).not.toContain('at a bank');expect(hidden).not.toContain('data-annotation');annotationSettings.enabled=false;try{expect(renderToStaticMarkup(createElement(p.NCEPracticePanel,props))).not.toContain('data-annotation')}finally{annotationSettings.enabled=true}
})
