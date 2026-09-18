#!/bin/sh
# يجلب مصدر COCO CAKE من المستودع العام nayef1986/baro-inventory
# ويثبّته على هذه النسخة قبل البناء. المرجع مثبّت على commit محدد،
# فالبناء قابل للتكرار بنفس النتيجة.
set -e
REPO=nayef1986/baro-inventory
REF=898a3025eeb7c49d65ea162570b3ac9c59c20859

curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$REF" -o src.tgz
rm -rf .src && mkdir .src && tar xzf src.tgz -C .src --strip-components=1
rm -f src.tgz

mkdir -p src public
rm -rf src/sweetcost public/sweet-cost sweet-cost
cp -R .src/src/sweetcost      src/sweetcost
cp -R .src/public/sweet-cost  public/sweet-cost
cp -R .src/sweet-cost         sweet-cost
rm -rf .src

# ملفات لا تلزم النشر
rm -f src/sweetcost/lib/cost.test.ts src/sweetcost/README.md

# إعدادات الاتصال بـSupabase. مفتاح anon عام بطبيعته —
# الحماية من RLS: كل السياسات للدور authenticated فقط.
cat > .env.production <<'ENV'
VITE_SWEETCOST_SUPABASE_URL=https://tdlpikekpnxuzyfcvqzo.supabase.co
VITE_SWEETCOST_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkbHBpa2VrcG54dXp5ZmN2cXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2ODg2NzIsImV4cCI6MjEwNTI2NDY3Mn0.jxKvvA_0ySwQVcRDAznZNwQwpwAOwjaj1M6CHY9F8uM
VITE_SWEETCOST_REQUIRE_AUTH=true
ENV

echo "COCO CAKE source ready @ $REF"
