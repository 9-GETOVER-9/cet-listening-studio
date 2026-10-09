"""Clean spoken glosses and apply context-sensitive corrections before synthesis."""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'docs/ielts-wanglu-translations.json'
meanings = json.loads(path.read_text(encoding='utf8'))
corrections = '''
allergy|过敏；过敏反应
analyst|分析师
air|空气
anger|愤怒
$169|一百六十九美元
$48|四十八美元
$5.96|五美元九十六美分
$12.5|十二美元五十美分
$37.5|三十七美元五十美分
0.6|零点六
1000000|一百万
250000|二十五万
500000|五十万
1600|一千六百
TA|教学助理
PE|体育
PhD|博士学位
free entry|免费入场
endangered species|濒危物种
animal life|动物生活
admission office|招生办公室
advanced level|高级水平
black velvet|黑色天鹅绒
call slip|借书申请单
check number|支票号码
chess club|国际象棋俱乐部
comment card|意见卡
connectives|连接词
consequences|结果；后果
cost effective|成本效益高的；划算的
cost-effective|成本效益高的；划算的
current account|活期账户
direct route|直达路线
disputes|争议；争端
dust bag|吸尘器集尘袋
entrance fee|入场费
familiar with|熟悉
failure rate|失败率；故障率
first floor|二楼，按英国楼层习惯
ground floor|一楼；底层
second floor|三楼，按英国楼层习惯
third floor|四楼，按英国楼层习惯
front desk|前台
given name|名字
gum tree|桉树
health check|健康检查
herb tea|草本茶
human race|人类
human resource|人力资源
ice pack|冰袋
kitchen table|厨房餐桌
land bridge|陆桥
landmarks|地标
leather jacket|皮夹克
leisure centre|休闲中心
life cycle|生命周期
long vacation|长假
main course|主菜；主要课程
master card|万事达信用卡
melting pot|熔炉；多元文化融合的社会
millions of|数百万的
natural ability|天赋能力
necessities|必需品
newsletters|通讯简报
notice board|公告栏
on sale|出售；促销
operation manager|运营经理
overdraft|银行透支
personal identity|个人身份
pence|便士
pennies|便士硬币
placement test|分班测试
public examination|公共考试
public school|公学，英国私立学校；美国公立学校
quality of life|生活质量
rats|老鼠
respondents|调查受访者
reset button|复位按钮
road runner|走鹃
scores|分数；得分
seating area|座位区
sentences|句子；判决
service manager|服务经理
short time|短时间
snowboarding|单板滑雪
spare parts|备用零件
spare time|空闲时间
stars|星星；明星
storage warehouse|储存仓库
tiger shark|虎鲨
top ten|前十名
traffic flow|车流
transport service|交通运输服务
transport system|交通运输系统
waiting list|候补名单
web browser|网页浏览器
weight loss|体重减轻
whitworth|惠特沃思
window dressing|橱窗布置；表面粉饰
Dressler|德雷斯勒
Deighton|戴顿
Parkhurst|帕克赫斯特
Walsham|沃尔舍姆
Ruddick|拉迪克
Urwin|厄温
awful|糟糕的；可怕的
assumptions|假设
admission|入场；录取
aptitude|天资；能力倾向
bank house|银行大楼
book keeper|记账员
breed fish|繁殖鱼类
clinical|临床的
constituents|组成部分；选民
current|当前的；水流
delivered|已送达的
graduate|毕业生；毕业
labyrinths|迷宫
mind|头脑；介意
optic|视觉的；光学的
paper|纸；论文
prescription|处方
record|记录；录制
return|归还；返回
seal|海豹；密封
sound|声音；健全的
spring|春天；弹簧
term|学期；术语
volume|体积；音量
'''
for row in corrections.strip().splitlines():
    word, meaning = row.split('|', 1)
    meanings[word.casefold()] = meaning

def spoken(value):
    value = re.sub(r'\([^)]*\)|（[^）]*）|<[^>]*>', '', value)
    value = re.sub(r'\b(?:n|v|vt|vi|a|adj|adv|prep|pron|conj|interj|abbr|num|na|un|pl|int)\.\s*/?', '', value)
    value = re.sub(r'\s*[,，;；/]\s*', '；', value).strip('； /')
    value = '；'.join(part for part in value.split('；') if part.strip())
    return '；'.join(value.split('；')[:2])

cards_path = ROOT / 'public/data/ielts-corpus-v1.json'
corpus = json.loads(cards_path.read_text(encoding='utf8'))
for card in corpus['cards']:
    card['chinese'] = spoken(meanings[card['word'].casefold()])
    if not re.search(r'[\u4e00-\u9fff]', card['chinese']):
        raise ValueError(f'No Chinese: {card["word"]}')
corpus['translationNote'] = '中文为补充释义，参考现有高频词表、ECDICT 和词组人工补译，非原包官方中文。'
corpus['translationSource'] = 'https://github.com/skywind3000/ECDICT'
cards_path.write_text(json.dumps(corpus, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
path.write_text(json.dumps(meanings, ensure_ascii=False, indent=2), encoding='utf8')
print(f'glosses complete: {len(corpus["cards"])}')
