// ============================================================
// App.tsx — تحميل البيانات والتنقل بين الشاشات
// ============================================================

import { useCallback, useEffect, useState } from 'react'

import { Login } from './components/Login.tsx'
import { Shell, type ScreenKey } from './components/Shell.tsx'
import { ErrorBanner, Spinner } from './components/UI.tsx'
import { Wordmark } from './components/Wordmark.tsx'
import { loadAll } from './lib/api.ts'
import { dbErrorMessage, isConfigured, requireAuth, supabase } from './lib/supabase.ts'
import type { SweetCostData } from './types.ts'

import DashboardScreen from './screens/Dashboard.tsx'
import IngredientsScreen from './screens/Ingredients.tsx'
import InvoicesScreen from './screens/Invoices.tsx'
import ProductionScreen from './screens/Production.tsx'
import RecipesScreen from './screens/Recipes.tsx'
import SuppliersScreen from './screens/Suppliers.tsx'
import WasteScreen from './screens/Waste.tsx'

export interface ScreenProps {
  data: SweetCostData
  reload: () => Promise<void>
  onError: (message: string) => void
  goTo: (screen: ScreenKey) => void
}

export default function App() {
  const [data, setData] = useState<SweetCostData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fatal, setFatal] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [screen, setScreen] = useState<ScreenKey>('dashboard')
  const [signedIn, setSignedIn] = useState(!requireAuth)
  const [authReady, setAuthReady] = useState(!requireAuth)

  const reload = useCallback(async () => {
    try {
      setData(await loadAll())
      setFatal(null)
    } catch (e) {
      setFatal(dbErrorMessage(e))
    }
  }, [])

  // حالة الجلسة — تُتابَع فقط عندما يكون الدخول مطلوباً
  useEffect(() => {
    if (!requireAuth || !supabase) return
    const sb = supabase

    void sb.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session))
      setAuthReady(true)
    })

    const { data: listener } = sb.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session))
      setAuthReady(true)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!isConfigured || !signedIn) {
      setLoading(false)
      return
    }
    setLoading(true)
    void reload().finally(() => setLoading(false))
  }, [reload, signedIn])

  if (!isConfigured) return <SetupNotice />
  if (!authReady) return <Spinner label="جاري التحقّق…" />
  if (!signedIn) return <Login />
  if (loading) return <Spinner />

  if (fatal && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-lg w-full flex flex-col gap-4">
          <ErrorBanner message={fatal} />
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-xl bg-accent text-white font-semibold cursor-pointer border-0"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    )
  }

  if (!data) return <Spinner />

  const props: ScreenProps = { data, reload, onError: setError, goTo: setScreen }

  const SCREENS: Record<ScreenKey, React.ReactElement> = {
    dashboard: <DashboardScreen {...props} />,
    ingredients: <IngredientsScreen {...props} />,
    suppliers: <SuppliersScreen {...props} />,
    recipes: <RecipesScreen {...props} />,
    production: <ProductionScreen {...props} />,
    waste: <WasteScreen {...props} />,
    invoices: <InvoicesScreen {...props} />,
  }

  return (
    <Shell screen={screen} onNavigate={setScreen} storeName={data.settings.store_name}>
      <div className="flex flex-col gap-5">
        {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}
        {SCREENS[screen]}
      </div>
    </Shell>
  )
}

function SetupNotice() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl min-w-0 bg-surface border border-line rounded-2xl p-5 sm:p-6">
        <Wordmark className="w-[170px] h-auto text-bark" />
        <p className="mt-3 mb-4 text-[14px] leading-loose text-soft">
          قاعدة البيانات غير مهيأة بعد. خطوتان فقط:
        </p>
        <ol className="m-0 ps-5 list-decimal text-[14px] leading-loose text-soft flex flex-col gap-2 min-w-0">
          <li>
            شغّل ملف{' '}
            <code dir="ltr" className="inline-block bg-sand px-1.5 py-0.5 rounded break-all align-middle">
              supabase/migrations/0001_sweet_cost.sql
            </code>{' '}
            في محرّر SQL داخل مشروع Supabase.
          </li>
          <li>
            أنشئ ملف{' '}
            <code dir="ltr" className="inline-block bg-sand px-1.5 py-0.5 rounded align-middle">.env.local</code>{' '}
            في جذر المشروع وضع فيه:
          </li>
        </ol>
        <pre
          dir="ltr"
          className="mt-3 max-w-full bg-bark text-[#ede3d7] rounded-xl p-4 text-[11.5px] sm:text-[12.5px] leading-relaxed whitespace-pre-wrap break-all"
        >
{`VITE_SWEETCOST_SUPABASE_URL=https://xxxx.supabase.co
VITE_SWEETCOST_SUPABASE_ANON_KEY=eyJhbGci...`}
        </pre>
        <p className="mt-4 mb-0 text-[13px] text-muted">ثم أعد تشغيل الخادم.</p>
      </div>
    </div>
  )
}
