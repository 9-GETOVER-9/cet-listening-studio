"""
生成100个邀请码并打印SQL插入语句
格式: INV-{随机4位}-{随机4位}
"""
import random
import string

def generate_code():
    """生成格式为 INV-XXXX-XXXX 的邀请码"""
    chars = string.ascii_uppercase + string.digits
    # 排除易混淆字符
    chars = chars.replace('0', '').replace('O', '').replace('I', '').replace('1', '')
    part1 = ''.join(random.choices(chars, k=4))
    part2 = ''.join(random.choices(chars, k=4))
    return f'INV-{part1}-{part2}'

# 生成100个邀请码
codes = set()
while len(codes) < 100:
    codes.add(generate_code())

# 打印SQL
print("-- ============================================================")
print("-- 插入100个邀请码（每张30天Pro）")
print("-- 在 Supabase Dashboard SQL Editor 中执行")
print("-- ============================================================\n")

for code in sorted(codes):
    print(f"INSERT INTO activation_codes (code, days, used) VALUES ('{code}', 30, false);")

print("\n-- ============================================================")
print(f"-- 总共生成 {len(codes)} 个邀请码")
print("-- =============================================================")
