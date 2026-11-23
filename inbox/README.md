# inbox/

ضعي هنا ملف JSON (أو تضيفه المهمة المجدولة)، وعند الـ push يرفعه GitHub Action
(`.github/workflows/inbox.yml`) إلى جدول `items` في Supabase ثم يحذف الملف من المجلد.

- الملفات التي تبدأ بـ `_` لا تُرفع (مثل `_example.json`).
- قبل الرفع: `npm run inbox:check` يتحقق من الصيغة بدون اتصال.
- **تنبيه:** الريبو عام، والملف يبقى في تاريخ git بعد حذفه. لا تضعي هنا ملاحظات شخصية؛ للبيانات الخاصة استخدمي `scripts/seed.mjs`.

## الصيغة
```json
{
  "items": [ { "id": "c-jobs-acme-soc", "title": "...", "tab": "c-jobs", "type": "job", "url": "https://...", "due": "2026-12-15" } ],
  "delete": ["id-to-remove"],
  "prune_expired": ["c-jobs", "c-madinah"]
}
```
أو مصفوفة عناصر فقط، أو عنصر واحد.

الحقول: `id` (حروف إنجليزية صغيرة وأرقام و`-`)، `title`، `title_en`، `tab`، `type`، `sub`،
`summary_ar`، `summary_en`، `url`، `file_url`، `status` (0/1/2)، `due` و`added` (YYYY-MM-DD)، `notes`.

## القواعد
- `id` جديد: يُضاف بـ `status: 0`، ويُتخطى إن كان نفس الرابط أو نفس العنوان في نفس التبويب موجوداً.
- `id` موجود: تُحدَّث الحقول المكتوبة فقط (حالتك وملاحظاتك لا تُمسح).
- `prune_expired`: يحذف من هذه التبويبات ما status=0 ومضى على موعده أكثر من 7 أيام.

## الإعداد (مرة واحدة)
GitHub → Settings → Secrets and variables → Actions → New repository secret:
`SUPABASE_SECRET_KEY` = مفتاح الخادم من Supabase (Project Settings → API Keys).
