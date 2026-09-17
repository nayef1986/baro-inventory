// ============================================================
// coach.ts — المساعد الذكي
//
// قاعدة صارمة: كل جملة هنا مبنية على رقم موجود فعلاً في
// قاعدة البيانات. لا رسائل عامة، ولا تحفيز عشوائي، ولا وعود
// مالية أو توقعات مستقبلية. إذا لم تتوفّر بيانات كافية
// لجملة ما، لا تُعرض الجملة أصلاً.
// ============================================================

import { changePercent, round } from './cost.ts'
import { money, percent, signedPercent } from './format.ts'
import { dailySeries, type PeriodKey, type PeriodTotals } from './analytics.ts'
import { productRows } from './derive.ts'
import type { SweetCostData } from '../types.ts'

export interface CoachCard {
  head: string
  body: string
  action: string | null
}

export interface GoalProgress {
  label: string
  goal: number
  achieved: number
  remaining: number
  percent: number
  reached: boolean
  message: string
}

export interface Milestone {
  id: string
  badge: string
  title: string
  detail: string
}

export type InsightTone = 'good' | 'warn' | 'info'

export interface Insight {
  tone: InsightTone
  text: string
}

export interface CoachOutput {
  card: CoachCard
  progress: GoalProgress | null
  milestones: Milestone[]
  insights: Insight[]
}

const PERIOD_WORD: Record<PeriodKey, string> = {
  today: 'اليوم',
  week: 'هذا الأسبوع',
  month: 'هذا الشهر',
  custom: 'هذه الفترة',
}

const PERIOD_PREV: Record<PeriodKey, string> = {
  today: 'أمس',
  week: 'الأسبوع الماضي',
  month: 'الشهر الماضي',
  custom: 'الفترة المقابلة',
}

export function buildCoach(args: {
  data: SweetCostData
  periodKey: PeriodKey
  totals: PeriodTotals
  previous: PeriodTotals
  goal: number | null
}): CoachOutput {
  const { data, periodKey, totals, previous, goal } = args
  const progress = buildProgress(periodKey, totals, goal)

  return {
    card: buildCard(periodKey, totals, previous, progress),
    progress,
    milestones: buildMilestones(data, totals),
    insights: buildInsights(data, periodKey, totals, previous),
  }
}

// ─── شريط التقدم ─────────────────────────────────────────────

function buildProgress(
  periodKey: PeriodKey,
  totals: PeriodTotals,
  goal: number | null,
): GoalProgress | null {
  if (goal === null || goal <= 0) return null

  const label = periodKey === 'week' ? 'هدف الأسبوع' : 'هدف الشهر'
  const remaining = goal - totals.sales
  const pct = Math.min(100, (totals.sales / goal) * 100)

  if (remaining <= 0) {
    return {
      label,
      goal,
      achieved: totals.sales,
      remaining: 0,
      percent: 100,
      reached: true,
      message: `تم تحقيق ${label}. المبيعات ${money(totals.sales)} ر.س، بزيادة ${money(-remaining)} ر.س عن الهدف.`,
    }
  }

  const closeToGoal = pct >= 90
  return {
    label,
    goal,
    achieved: totals.sales,
    remaining,
    percent: pct,
    reached: false,
    message: closeToGoal
      ? `أنت قريب. باقي ${money(remaining)} ر.س فقط للوصول إلى ${label}.`
      : `باقي ${money(remaining)} ر.س للوصول إلى ${label}.`,
  }
}

// ─── بطاقة «رسالتك اليوم» ────────────────────────────────────

function buildCard(
  periodKey: PeriodKey,
  totals: PeriodTotals,
  previous: PeriodTotals,
  progress: GoalProgress | null,
): CoachCard {
  const word = PERIOD_WORD[periodKey]

  if (totals.batchCount === 0) {
    return {
      head: 'لا يوجد نشاط مسجّل بعد.',
      body: `لم تُسجَّل أي دفعة إنتاج في ${word}. سجّل أول دفعة لتبدأ الأرقام بالظهور هنا.`,
      action: 'كل رقم تسجّله اليوم يبني معرفة حقيقية بتكلفة منتجاتك.',
    }
  }

  const marginDelta = totals.marginPercent - previous.marginPercent
  const salesChange = changePercent(totals.sales, previous.sales)

  const body =
    `المبيعات ${money(totals.sales)} ر.س، التكلفة ${money(totals.totalCost)} ر.س، ` +
    `والربح ${money(totals.profit)} ر.س بهامش ${percent(totals.marginPercent)}.`

  let head = `ملخص ${word}.`
  let action: string | null = null

  if (previous.batchCount > 0 && marginDelta >= 1) {
    head = 'الربحية تتحسّن.'
    action =
      `الهامش ارتفع من ${percent(previous.marginPercent)} إلى ${percent(totals.marginPercent)} ` +
      `مقارنة بـ${PERIOD_PREV[periodKey]}. أنت لا تبيع أكثر فقط، بل تحقّق ربحاً أفضل.`
  } else if (previous.batchCount > 0 && marginDelta <= -1) {
    head = 'انتبه للهامش.'
    action =
      `الهامش نزل من ${percent(previous.marginPercent)} إلى ${percent(totals.marginPercent)} ` +
      `مقارنة بـ${PERIOD_PREV[periodKey]}. راجع أسعار المكونات والمنتجات الأقل هامشاً.`
  } else if (salesChange !== null && salesChange >= 5) {
    head = 'المبيعات ترتفع.'
    action = `نمو ${signedPercent(salesChange)} عن ${PERIOD_PREV[periodKey]} مع ثبات الهامش عند ${percent(totals.marginPercent)}.`
  } else if (previous.batchCount > 0) {
    head = 'أداء مستقر.'
    action = `الهامش ثابت قرب ${percent(totals.marginPercent)}. ركّز الآن على خفض الهدر لرفع الربح.`
  }

  if (progress) action = progress.message

  return { head, body, action }
}

// ─── الإنجازات ───────────────────────────────────────────────

const SALES_TIERS = [10_000, 50_000, 100_000, 250_000, 500_000]

function buildMilestones(data: SweetCostData, totals: PeriodTotals): Milestone[] {
  const out: Milestone[] = []
  const series = dailySeries(data)
  if (series.length === 0) return out

  const lifetimeSales = data.productions.reduce((s, p) => s + p.revenue, 0)

  if (series.length === 1 && totals.batchCount > 0) {
    out.push({
      id: 'first-day',
      badge: 'إنجاز جديد',
      title: 'أول يوم مبيعات مسجّل',
      detail: 'من هنا تبدأ قراءة أرقام مشروعك بدل التخمين.',
    })
  }

  const tier = [...SALES_TIERS].reverse().find((t) => lifetimeSales >= t)
  if (tier) {
    out.push({
      id: `tier-${tier}`,
      badge: 'إنجاز جديد',
      title: `تجاوزت ${money(tier)} ر.س مبيعات`,
      detail: `الإجمالي المسجّل حتى الآن ${money(lifetimeSales)} ر.س.`,
    })
  }

  const best = series.reduce((a, b) => (b.sales > a.sales ? b : a))
  if (best.sales > 0 && series.length >= 2) {
    out.push({
      id: 'best-day',
      badge: 'رقم قياسي',
      title: `أعلى مبيعات في يوم: ${money(best.sales)} ر.س`,
      detail: `سُجّل في ${best.date}، الأعلى منذ بداية تسجيل البيانات.`,
    })
  }

  const streak = growthStreak(series)
  if (streak >= 3) {
    out.push({
      id: 'streak',
      badge: 'نمو متواصل',
      title: `${streak} فترات نمو متتالية`,
      detail: 'المبيعات ترتفع في كل فترة مقارنة بالتي قبلها.',
    })
  }

  const products = productRows(data).filter((p) => p.sellPrice > 0 && p.incompleteCount === 0)
  const top = products[0]
  if (top && products.length >= 2) {
    out.push({
      id: 'top-margin',
      badge: 'أعلى هامش',
      title: top.recipe.name,
      detail: `هامش ${percent(top.marginPercent)} — الأعلى بين منتجاتك حالياً.`,
    })
  }

  return out.slice(0, 4)
}

function growthStreak(series: { sales: number }[]): number {
  let streak = 0
  for (let i = series.length - 1; i > 0; i--) {
    const cur = series[i]?.sales ?? 0
    const prev = series[i - 1]?.sales ?? 0
    if (cur > prev) streak++
    else break
  }
  return streak
}

// ─── الملاحظات الذكية ────────────────────────────────────────

function buildInsights(
  data: SweetCostData,
  periodKey: PeriodKey,
  totals: PeriodTotals,
  previous: PeriodTotals,
): Insight[] {
  const out: Insight[] = []

  // ارتفاع سعر مكون عن متوسطه
  for (const ingredient of data.ingredients) {
    const latest = data.latest[ingredient.id]
    if (!latest || latest.last_price === null || latest.avg_price === null) continue
    if ((latest.price_count ?? 0) < 2) continue

    const change = changePercent(latest.last_price, latest.avg_price)
    if (change !== null && change >= 5) {
      out.push({
        tone: 'warn',
        text: `تكلفة ${ingredient.name} ارتفعت ${signedPercent(change)} عن متوسط سعرها السابق (${money(latest.avg_price)} ← ${money(latest.last_price)} ر.س للعبوة).`,
      })
    }
  }

  // أعلى وأقل المنتجات ربحية
  const products = productRows(data).filter((p) => p.sellPrice > 0 && p.incompleteCount === 0)
  if (products.length >= 2) {
    const best = products[0]
    const worst = products[products.length - 1]
    if (best) {
      out.push({
        tone: 'good',
        text: `${best.recipe.name} يحقق أعلى هامش ربح حالياً: ${percent(best.marginPercent)}.`,
      })
    }
    if (worst && worst.recipe.id !== best?.recipe.id) {
      out.push({
        tone: 'warn',
        text: `${worst.recipe.name} يحقق أقل هامش ربح: ${percent(worst.marginPercent)}. راجع تكلفته أو سعر بيعه.`,
      })
    }
  }

  // الهدر مقارنة بالفترة السابقة
  if (previous.wasteValue > 0) {
    const change = changePercent(totals.wasteValue, previous.wasteValue)
    if (change !== null && change >= 10) {
      out.push({
        tone: 'warn',
        text: `الهدر ${PERIOD_WORD[periodKey]} ${money(totals.wasteValue)} ر.س، أعلى بـ ${signedPercent(change)} عن ${PERIOD_PREV[periodKey]}. راجع المنتجات الأعلى هدراً قبل الدفعة القادمة.`,
      })
    } else if (change !== null && change <= -10) {
      out.push({
        tone: 'good',
        text: `الهدر انخفض ${signedPercent(change)} مقارنة بـ${PERIOD_PREV[periodKey]}، ووفّر عليك ${money(previous.wasteValue - totals.wasteValue)} ر.س.`,
      })
    }
  }

  // نسبة الهدر من التكلفة
  if (totals.totalCost > 0) {
    const share = (totals.wasteValue / totals.totalCost) * 100
    if (share >= 8) {
      out.push({
        tone: 'warn',
        text: `الهدر يمثّل ${percent(share)} من إجمالي تكلفتك ${PERIOD_WORD[periodKey]}. خفضه نقطة واحدة يضيف ${money(totals.totalCost / 100)} ر.س إلى ربحك.`,
      })
    }
  }

  // انحراف الإنتاج عن الوصفة القياسية
  if (totals.batchCount > 0 && Math.abs(totals.costVariance) >= 0.01) {
    const standard = totals.productionCost - totals.costVariance
    const pct = standard > 0 ? (totals.costVariance / standard) * 100 : 0
    out.push({
      tone: totals.costVariance > 0 ? 'warn' : 'good',
      text:
        totals.costVariance > 0
          ? `الاستهلاك الفعلي تجاوز الوصفة القياسية بـ ${money(totals.costVariance)} ر.س (${signedPercent(pct)}) في ${PERIOD_WORD[periodKey]}.`
          : `الاستهلاك الفعلي أقل من الوصفة القياسية بـ ${money(-totals.costVariance)} ر.س (${signedPercent(pct)}). معايرة جيدة.`,
    })
  }

  // مكونات بلا سعر — تعطّل دقة التكلفة
  const unpriced = data.ingredients.filter((i) => (data.latest[i.id]?.last_price ?? null) === null)
  if (unpriced.length > 0) {
    out.push({
      tone: 'info',
      text: `${unpriced.length} مكوّن بلا سعر شراء مسجّل، فتكلفة أي وصفة تستخدمه غير مكتملة.`,
    })
  }

  // تحسن الهامش
  if (previous.batchCount > 0) {
    const delta = round(totals.marginPercent - previous.marginPercent, 1)
    if (delta >= 1) {
      out.push({
        tone: 'good',
        text: `هامش الربح تحسّن من ${percent(previous.marginPercent)} إلى ${percent(totals.marginPercent)} مقارنة بـ${PERIOD_PREV[periodKey]}.`,
      })
    }
  }

  return out.slice(0, 6)
}
