/**
 * 扫描 cards.json，识别所有"一卡多音频"的卡片
 *
 * 识别规则：
 * 对于 NCE 教材，当卡片 A（编号 N）存在 audioFile: "A_N.mp3" 时：
 * - 检查是否存在对应的音频文件 A_(N+1).mp3
 * - 检查是否存在卡片 A_(N+1)
 * - 如果音频存在但卡片不存在 → 卡片 A 需要标记为多音频
 */

const fs = require('fs');
const path = require('path');

// 读取 cards.json
const cardsPath = path.join(__dirname, '../public/data/cards.json');
const audioDir = path.join(__dirname, '../public/data/audio');

console.log('📂 读取 cards.json...');
const data = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
const cards = data.cards || [];

console.log(`📊 总卡片数: ${cards.length}`);

// 按模块分组
const moduleMap = {};
cards.forEach(c => {
  if (!moduleMap[c.moduleId]) moduleMap[c.moduleId] = [];
  moduleMap[c.moduleId].push(c);
});

console.log(`📚 总模块数: ${Object.keys(moduleMap).length}`);

// 获取所有音频文件
console.log('\n📂 扫描音频目录...');
const audioFiles = new Set(fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3')));
console.log(`🎵 音频文件总数: ${audioFiles.size}`);

// 构建 cardId -> card 的映射
const cardIdMap = new Map();
cards.forEach(c => cardIdMap.set(c.cardId, c));

// 识别多音频卡片
const multiAudioCards = [];

function getAudioPrefix(cardId) {
  // 提取音频前缀，如 "IU_04" -> "IU_"
  const match = cardId.match(/^([A-Za-z]+)_(\d+)$/);
  if (match) {
    return {
      prefix: match[1],  // "IU"
      num: parseInt(match[2])  // 4
    };
  }
  return null;
}

Object.entries(moduleMap).forEach(([moduleId, moduleCards]) => {
  moduleCards.forEach(card => {
    // 跳过已经有 mergedAudioFiles 的卡片
    if (card.mergedAudioFiles && card.mergedAudioFiles.length > 0) {
      return;
    }

    // 提取音频前缀
    const audioPrefix = getAudioPrefix(card.audioFile.replace('.mp3', ''));
    if (!audioPrefix) return;

    const { prefix, num } = audioPrefix;
    const nextAudio = `${prefix}_${num + 1}.mp3`;
    const nextCardId = `${prefix}_${num + 1}`;

    // 检查下一个音频文件是否存在
    const audioExists = audioFiles.has(nextAudio);

    // 检查下一个卡片是否存在
    const nextCardExists = cardIdMap.has(nextCardId);

    // 如果音频存在但卡片不存在，这就是一个多音频卡片
    if (audioExists && !nextCardExists) {
      multiAudioCards.push({
        cardId: card.cardId,
        moduleId: card.moduleId,
        audioFile: card.audioFile,
        nextAudio: nextAudio,
        mergedAudioFiles: [card.audioFile, nextAudio],
        mergedFrom: [card.cardId, nextCardId],
        isMerged: true,
        mergedLevel: 2
      });
    }
  });
});

console.log(`\n🔍 识别出的多音频卡片数量: ${multiAudioCards.length}`);

// 按模块分组统计
const byModule = {};
multiAudioCards.forEach(c => {
  const book = c.moduleId.match(/NCE_Book(\d+)/)?.[1] || 'Other';
  if (!byModule[book]) byModule[book] = [];
  byModule[book].push(c);
});

console.log('\n📊 按模块分布:');
Object.entries(byModule).forEach(([book, cards]) => {
  console.log(`  NCE Book${book}: ${cards.length} 张`);
});

// 显示前10个示例
console.log('\n📝 前10个示例:');
multiAudioCards.slice(0, 10).forEach((c, i) => {
  console.log(`  ${i + 1}. ${c.cardId} (${c.moduleId})`);
  console.log(`     音频: ${c.audioFile} + ${c.nextAudio}`);
});

// 检查 IU_04 是否被识别
const iu04 = multiAudioCards.find(c => c.cardId === 'IU_04');
console.log('\n🎯 IU_04 识别结果:');
if (iu04) {
  console.log('  ✅ IU_04 被识别为多音频卡片');
  console.log('  音频:', iu04.mergedAudioFiles);
} else {
  console.log('  ❌ IU_04 未被识别');
  // 检查原因
  const card = cardIdMap.get('IU_04');
  if (card) {
    const nextAudio = 'IU_05.mp3';
    console.log('  原因分析:');
    console.log('    audioFile:', card.audioFile);
    console.log('    IU_05.mp3 存在:', audioFiles.has(nextAudio));
    console.log('    IU_05 卡片存在:', cardIdMap.has('IU_05'));
  }
}

// 生成修改后的 cards.json
console.log('\n🔧 生成修改后的 cards.json...');

const cardsToUpdate = new Set(multiAudioCards.map(c => c.cardId));

const modifiedCards = cards.map(card => {
  if (cardsToUpdate.has(card.cardId)) {
    const update = multiAudioCards.find(c => c.cardId === card.cardId);
    return {
      ...card,
      mergedAudioFiles: update.mergedAudioFiles,
      mergedFrom: update.mergedFrom,
      isMerged: update.isMerged,
      mergedLevel: update.mergedLevel
    };
  }
  return card;
});

// 更新版本号
const newData = {
  ...data,
  cards: modifiedCards,
  version: data.version + '-multi-audio-fix'
};

const outputPath = path.join(__dirname, '../public/data/cards-fixed.json');
fs.writeFileSync(outputPath, JSON.stringify(newData, null, 2));

console.log(`\n✅ 修改后的 cards.json 已保存到: ${outputPath}`);
console.log(`   原始大小: ${(fs.statSync(cardsPath).size / 1024 / 1024).toFixed(2)} MB`);
console.log(`   新文件大小: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);

// 生成更新脚本
console.log('\n📋 后续步骤:');
console.log('1. 检查 cards-fixed.json 确认修改正确');
console.log('2. 备份原文件: cp cards.json cards.json.backup');
console.log('3. 上传到服务器: scp cards-fixed.json root@101.43.10.196:/var/www/cet-listening/data/cards.json');
console.log('4. 验证: 在浏览器中清除 IndexedDB，重新加载数据');
