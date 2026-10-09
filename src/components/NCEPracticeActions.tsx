import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { NCERecordingPlaceholder } from './NCEPracticePanel';
import { isOriginalNCESentence } from '@/lib/nceShadowing';
import type { Card } from '@/types';
export function NCEPracticeActions({ card }: {
    card: Card;
}) {
    const navigate = useNavigate();
    if (card.level !== 'NCE')
        return null;
    return <div className="mt-4 space-y-3" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
  {isOriginalNCESentence(card) && <Button variant="outline" className="w-full" onClick={() => navigate(`/nce/shadowing/${encodeURIComponent(card.moduleId)}?targetId=${encodeURIComponent(card.cardId)}`)}>输入法跟读 · 从当前原句开始</Button>}
  <NCERecordingPlaceholder />
 </div>;
}
