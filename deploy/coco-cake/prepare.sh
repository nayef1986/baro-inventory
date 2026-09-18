#!/bin/sh
# يجهّز مصدر COCO CAKE في هذا المجلد قبل البناء.
#
# إن كان المستودع نفسه حاضراً (المشروع مربوط بـGitHub) ينسخ من النسخة
# المسحوبة مباشرة. وإلا يجلب main من المستودع العام — فالسكربت يعمل في
# الحالتين بلا تغيير.
set -e
REPO=nayef1986/baro-inventory
REF=main

if [ -d ../../src/sweetcost ]; then
  SRC=../..
  ORIGIN="المستودع المسحوب"
else
  curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$REF" -o src.tgz
  rm -rf .src && mkdir .src && tar xzf src.tgz -C .src --strip-components=1
  rm -f src.tgz
  SRC=.src
  ORIGIN="codeload @ $REF"
fi

mkdir -p src public
rm -rf src/sweetcost public/sweet-cost sweet-cost
cp -R "$SRC/src/sweetcost"     src/sweetcost
cp -R "$SRC/public/sweet-cost" public/sweet-cost
cp -R "$SRC/sweet-cost"        sweet-cost
rm -rf .src

# ملفات لا تلزم النشر
rm -f src/sweetcost/lib/cost.test.ts src/sweetcost/README.md

# إعدادات الاتصال بـSupabase. بلا بوابة دخول بطلب صاحب المتجر،
# فالسياسات للدور anon والرابط وحده هو ما يحمي القاعدة.
cat > .env.production <<'ENV'
VITE_SWEETCOST_SUPABASE_URL=https://tdlpikekpnxuzyfcvqzo.supabase.co
VITE_SWEETCOST_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkbHBpa2VrcG54dXp5ZmN2cXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2ODg2NzIsImV4cCI6MjEwNTI2NDY3Mn0.jxKvvA_0ySwQVcRDAznZNwQwpwAOwjaj1M6CHY9F8uM
VITE_SWEETCOST_REQUIRE_AUTH=false
ENV

echo "COCO CAKE source ready — $ORIGIN"
