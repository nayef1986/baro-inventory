// api/odoo-sync.js — وسيط بين النظام وأودو (يتجاوز حماية المتصفح CORS)
// يستخدم JSON-RPC — نفس اللي يستخدمه أودو نفسه

async function odooRpc(url, service, method, args) {
  const res = await fetch(`${url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Math.floor(Math.random() * 1000000),
    }),
  });
  if (!res.ok) throw new Error(`أودو ردّ بخطأ ${res.status}`);
  const data = await res.json();
  if (data.error) {
    const msg = data.error?.data?.message || data.error?.message || "خطأ غير معروف من أودو";
    throw new Error(msg);
  }
  return data.result;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { action, url, db, user, apiKey, dateFrom, port, model } = req.body || {};

  if (!url || !db || !user || !apiKey) {
    return res.status(400).json({ ok: false, error: "بيانات الاتصال ناقصة" });
  }

  let baseUrl = String(url).trim().replace(/\/+$/, "");
  // لو المشغّل يستخدم منفذ غير قياسي، نضيفه للرابط (ما نضيفه لو موجود أصلاً)
  if (port && String(port).trim() && !/:\d+$/.test(baseUrl)) {
    baseUrl = `${baseUrl}:${String(port).trim()}`;
  }

  try {
    // 1) تسجيل الدخول — مفتاح API يُستخدم مكان كلمة المرور
    const uid = await odooRpc(baseUrl, "common", "authenticate", [db, user, apiKey, {}]);

    if (!uid) {
      return res.status(401).json({ ok: false, error: "فشل تسجيل الدخول — تأكد من اسم القاعدة والمستخدم والمفتاح" });
    }

    // اختبار الاتصال فقط
    if (action === "test") {
      return res.status(200).json({ ok: true, uid });
    }

    // 2) سحب المبيعات
    if (action === "sales") {
      const targetModel = (model && String(model).trim()) || "sale.order.line";
      const domain = [];
      // فلتر الحالة ينطبق على نماذج الطلبات (بعض النماذج المخصصة ما عندها هالحقل)
      if (targetModel.startsWith("sale.order")) domain.push(["state", "in", ["sale", "done"]]);
      if (dateFrom) domain.push([targetModel.startsWith("sale.order") ? "date_order" : "create_date", ">=", dateFrom]);

      const lines = await odooRpc(baseUrl, "object", "execute_kw", [
        db, uid, apiKey,
        targetModel, "search_read",
        [domain],
        {
          fields: ["product_id", "product_uom_qty", "price_total", "order_id"],
          limit: 5000,
        },
      ]);

      return res.status(200).json({ ok: true, uid, model: targetModel, count: lines?.length ?? 0, lines: lines ?? [] });
    }

    return res.status(400).json({ ok: false, error: "action غير معروف" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}
