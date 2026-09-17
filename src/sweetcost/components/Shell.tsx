// ============================================================
// Shell.tsx — الإطار والتنقل (جانبي على الكمبيوتر، سفلي على الجوال)
// ============================================================

import type { ReactNode } from 'react'

export type ScreenKey = 'ingredients' | 'suppliers' | 'recipes' | 'production' | 'waste' | 'dashboard'

interface NavItem {
  key: ScreenKey
  label: string
  short: string
  icon: ReactNode
}

const icon = (paths: ReactNode) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {paths}
  </svg>
)

export const NAV_ITEMS: NavItem[] = [
  {
    key: 'ingredients',
    label: 'المكونات والأسعار',
    short: 'المكونات',
    icon: icon(
      <>
        <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
        <path d="M3 8l9 5 9-5" />
        <path d="M12 13v8" />
      </>,
    ),
  },
  {
    key: 'suppliers',
    label: 'الموردين والمشتريات',
    short: 'المشتريات',
    icon: icon(
      <>
        <path d="M3 16V6h11v10" />
        <path d="M14 10h4l3 3v3h-7" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17" cy="18" r="2" />
      </>,
    ),
  },
  {
    key: 'recipes',
    label: 'الوصفات',
    short: 'الوصفات',
    icon: icon(
      <>
        <path d="M4 4h11a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2z" />
        <path d="M8 8h6" />
        <path d="M8 12h6" />
      </>,
    ),
  },
  {
    key: 'production',
    label: 'الإنتاج الفعلي',
    short: 'الإنتاج',
    icon: icon(
      <>
        <path d="M3 10h18a9 9 0 0 1-9 9 9 9 0 0 1-9-9z" />
        <path d="M9 6c0-1.6 1.4-3 3-3" />
      </>,
    ),
  },
  {
    key: 'waste',
    label: 'الهدر',
    short: 'الهدر',
    icon: icon(
      <>
        <path d="M4 7h16" />
        <path d="M9 7V5h6v2" />
        <path d="M6 7l1 13h10l1-13" />
      </>,
    ),
  },
  {
    key: 'dashboard',
    label: 'التكلفة والربح',
    short: 'التكلفة',
    icon: icon(
      <>
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M21 20H3" />
      </>,
    ),
  },
]

export function Shell({
  screen,
  onNavigate,
  children,
}: {
  screen: ScreenKey
  onNavigate: (key: ScreenKey) => void
  children: ReactNode
}) {
  return (
    <div className="min-h-screen flex bg-cream">
      {/* التنقل الجانبي — كمبيوتر */}
      <aside className="hidden lg:flex w-[236px] shrink-0 flex-col gap-7 bg-bark text-[#f3ede4] px-4 py-7 sticky top-0 h-screen">
        <div className="px-1.5">
          <div className="display text-[31px] font-bold leading-tight text-honey">سويت كوست</div>
          <div className="mt-1.5 text-[10.5px] tracking-[0.18em] text-[#a99783]">SWEET COST</div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = item.key === screen
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate(item.key)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 min-h-11 px-3 rounded-[9px] text-[14.5px] cursor-pointer text-right transition-colors border-0 ${
                  active
                    ? 'bg-bark-3 text-[#fbf3e7] font-semibold border-r-[3px] border-r-accent'
                    : 'bg-transparent text-[#d8ccbc] hover:bg-bark-2'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <p className="mt-auto m-0 border-t border-bark-3 pt-4 text-[11.5px] leading-relaxed text-[#a99783]">
          كل التكاليف تُحسب من آخر سعر شراء مسجّل. لا تُدخل تكلفة يدوياً.
        </p>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* رأس الجوال */}
        <header className="lg:hidden sticky top-0 z-20 bg-bark text-[#f3ede4] px-4 py-3">
          <div className="display text-[22px] font-bold leading-tight text-honey">سويت كوست</div>
        </header>

        <main className="flex-1 min-w-0 px-4 py-5 sm:px-7 sm:py-7 pb-24 lg:pb-7 max-w-[1400px] w-full">
          {children}
        </main>
      </div>

      {/* التنقل السفلي — جوال */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-line flex px-1 pt-1.5 pb-3">
        {NAV_ITEMS.map((item) => {
          const active = item.key === screen
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 min-w-0 min-h-13 flex flex-col items-center justify-center gap-1 cursor-pointer bg-transparent border-0 ${
                active ? 'text-accent font-semibold' : 'text-muted'
              }`}
            >
              {item.icon}
              <span className="text-[9.5px]">{item.short}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
