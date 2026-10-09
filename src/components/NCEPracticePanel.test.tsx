import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
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
it('includes disabled personal recording playback and distinguishes content from pronunciation', async () => { const p = await api(); const html = renderToStaticMarkup(createElement(p.NCERecordingPlaceholder)); expect(html).toContain('个人录音回放 · 待开发'); expect(html).toContain('disabled'); expect(html).toContain('发音质量'); });

it('retains existing sentence annotations only when display and existing card access both allow them',async()=>{
 const p=await api();const analysis:import('@/types').AIAnalysis={phrases:[{phrase:'at a bank',meaning:'在银行'}],grammar:[],pronunciation:[{type:'连读',example:'at_a bank'},{type:'弱读',example:'a /ə/'}]};const props={text:'at a bank',translation:'在银行',hidden:false,evaluation:null,spans:[],onSpans:()=>{},analysis,showAnnotations:true,analysisUnlocked:true};const html=renderToStaticMarkup(createElement(p.NCEPracticePanel,props));expect(html).toContain('data-annotation="linking weak phrases"');expect(html).toContain('原句标注图例');expect(renderToStaticMarkup(createElement(p.NCEPracticePanel,{...props,analysisUnlocked:false}))).not.toContain('data-annotation');expect(renderToStaticMarkup(createElement(p.NCEPracticePanel,{...props,showAnnotations:false}))).not.toContain('data-annotation');const hidden=renderToStaticMarkup(createElement(p.NCEPracticePanel,{...props,hidden:true}));expect(hidden).not.toContain('at a bank');expect(hidden).not.toContain('data-annotation');annotationSettings.enabled=false;try{expect(renderToStaticMarkup(createElement(p.NCEPracticePanel,props))).not.toContain('data-annotation')}finally{annotationSettings.enabled=true}
})