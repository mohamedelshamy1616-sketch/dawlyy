"""Single source of truth for the DAWLYY status dashboard data.

Edit the lists below (short, plain Egyptian Arabic), then run `python tools/dashboard/build.py`. It writes
steps.json / now.json / needs.json beside this file and `publish_request.json`, which the autopilot watchdog picks
up and uploads to the private dashboard (at most every 90 minutes). Never put env values, keys or personal data here.
"""
import json
import pathlib
from datetime import datetime, timedelta, timezone

OUT = pathlib.Path(__file__).resolve().parent
ARTIFACT_URL = 'https://claude.ai/artifact/JkbMzpKAkRbVpN4zKFdwVT'
CAIRO = timezone(timedelta(hours=2))  # Egypt is on UTC+2 in November (no DST)
NOW_LOCAL = datetime.now(CAIRO).replace(microsecond=0).isoformat()
NOW_UTC = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')

STEP_LABEL = {'done': 'خلصت', 'now': 'شغالين فيها', 'next': 'الجاية', 'later': 'بعدين'}

# (phase, step, state, low hours, high hours, note). Exactly one row is 'now'.
STEPS = [
    ('الأساس', 'الخطة ومراجعة المواصفات', 'done', 0, 0, 'اتفقنا على التقنيات وترتيب الشغل'),
    ('الأساس', 'أساس الموقع: عربي وإنجليزي، تسجيل الدخول، الـ API', 'done', 0, 0, 'اتحفظ'),
    ('الأساس', 'قاعدة البيانات الأولى، و210 تمرين و371 أكلة جاهزين', 'done', 0, 0, 'اتحفظ'),
    ('الأساس', 'عقل التطبيق: البرامج، الاشتراكات، التجميد، الاستيراد من Excel', 'done', 0, 0, '559 اختبار ناجحين'),
    ('الأمان', 'فحص أمان قاعدة البيانات', 'done', 0, 0, 'لقينا 51 ثغرة قبل ما أي عميل يستخدمها'),
    ('الأمان', 'تصميم الحل لكل الثغرات ومراجعته', 'done', 0, 0, '8 مراجعين و Codex، و Codex صلح آخر الملاحظات'),
    ('التشغيل الذاتي', 'نظام يشغّل Claude لوحده 24 ساعة ويكمل بعد كل حد', 'done', 0, 0,
     'اشتغل لوحده من 8 نوفمبر، 272 اختبار ناجحين، وبيرفع الكود على GitHub كل ساعة'),
    ('الأمان', 'بناء الحل الأمني', 'done', 0, 0, '287 قاعدة حماية و40 حارس و15 مجموعة اختبارات أمان، كلها اتحفظت. هتتشغل في مرحلة الاختبار'),
    ('المعاينة', 'نسخة تفتحها وتجربها: دخول تجريبي، صور لكل الشاشات، وملف خطوات التجربة', 'done', 0, 0,
     '64 صورة في docs/qa/screens، وخطوات التشغيل في docs/qa/HOW_TO_TEST.md'),
    ('المميزات', 'تجهيز الأرضية للموجة الجاية، ودخول تجريبي على جهازك', 'done', 0, 0,
     'اتحفظ: الدخول التجريبي، الصفحات، والاختبارات'),
    ('المميزات', 'فتح حساب المدرب، تسجيل الدخول، دعوة العملاء والمساعدين', 'now', 2, 3, 'Codex هيبنيها بعد ما حده يرجع الساعة 5:48 العصر'),
    ('المميزات', 'العملاء والباقات والاشتراكات والدفع اليدوي', 'later', 3, 4, ''),
    ('المميزات', 'مكتبة التمارين وبناء البرامج', 'later', 3, 5, ''),
    ('المميزات', 'تطبيق العميل: النهارده، برنامجي، تسجيل التمرين من غير نت', 'later', 3, 5, ''),
    ('المميزات', 'التغذية: الأكل والمكملات وخطة العميل', 'later', 3, 4, ''),
    ('المميزات', 'الفورمز: بيانات البداية، المتابعة الأسبوعية، التقييم', 'later', 2, 4, ''),
    ('المميزات', 'التقويم والتذكيرات والقياسات والصور', 'later', 3, 4, ''),
    ('المميزات', 'الرسائل والإشعارات', 'later', 2, 4, ''),
    ('المميزات', 'لوحة المدرب، ملف العميل الكامل، المهام', 'later', 3, 5, ''),
    ('المميزات', 'الإعدادات، الفريق والصلاحيات، البراند، الموافقات القانونية', 'later', 3, 4, ''),
    ('الإطلاق', 'بيانات تجريبية واختبار المشوار كله بالعربي والإنجليزي', 'later', 4, 6, ''),
    ('الاختبار', 'تشغيل كل الاختبارات، هجوم تجريبي على النظام، وإصلاح كل حاجة', 'later', 6, 10,
     'محتاج مساحة على الهارد (شوف أول طلب تحت)'),
    ('الإطلاق', 'مراجعة أمان أخيرة، وملف خطوات تجربه منه', 'later', 2, 3, 'بعدها أبلغك إنه جاهز'),
]

NOW_LABEL = {'running': 'شغال', 'done': 'خلص', 'failed': 'وقع', 'waiting': 'مستني'}

# (what, state code, detail)
NOW = [
    ('نظام التشغيل الذاتي', 'running',
     'شغال من 8 نوفمبر. لو حد الـ 5 ساعات خلص بيستنى ويكمل لوحده. الجهاز اتقفل من 4:51 لـ 11:39 بالليل، ورجع كمل لوحده'),
    ('البناء الأمني لقاعدة البيانات', 'done', 'اتجرب على قاعدة جديدة وعلى نسخة من قاعدتك القديمة، والاتنين اشتغلوا'),
    ('Codex', 'waiting', 'خلص حده النهارده، راجع الساعة 5:48 العصر ويكمل بناء المميزات'),
    ('نقاط ضعف المنافسين بقت شروط في التطبيق', 'done',
     '10 نقاط من Hevy و Strong و Beprime و FitXpert و Trainerize: الدفع اليدوي، تكرار التمارين، الأكل المصري، العربي'),
    ('الكود على GitHub', 'done', 'ريبو خاص، وبيترفع لوحده كل ساعة بعد فحص إن مفيش أسرار'),
    ('مساحة الهارد', 'done', 'بعد الريستارت وقفل الـ hibernate بقى فاضل حوالي 14 جيجا'),
    ('مراجعة Codex لتصميم الأمان', 'done',
     'صلح الـ SQL في 13 جزء. فاضل سؤالين صغيرين ليك، أخدت فيهم الاختيار الأأمن (OPEN_DECISIONS)'),
    ('Fable 5.1', 'waiting', 'محتاج رصيد مدفوع دلوقتي، فالشغل ماشي بـ Opus و Sonnet و Codex'),
]

# (item, why, what I do if there is no answer, when label, urgency code)
NEEDS = [
    ('سيب الجهاز شغال وعلى الشاحن (ممكن الغطا مقفول)', 'لما الجهاز بيتقفل الشغل بيقف لحد ما يفتح تاني',
     'بيكمل لوحده أول ما الجهاز يفتح', 'دايماً', 'now'),
    ('اعمل تسجيل دخول جديد في Claude Code قبل يوم 10 نوفمبر', 'تسجيل الدخول بيخلص، والتشغيل الذاتي هيقف لو خلص',
     'هيقف ويبلغك برسالة على الشاشة', 'قبل 10 نوفمبر', 'soon'),
    ('حساب Supabase: رابط المشروع والمفاتيح وباسورد قاعدة البيانات',
     'قاعدة البيانات الحقيقية أونلاين وتسجيل الدخول الحقيقي',
     'بكمل على قاعدة بيانات على جهازك، ودخول تجريبي للتجربة', 'قبل النشر أونلاين', 'later'),
    ('تسجيل دخول Vercel', 'عشان نرفع نسخة أونلاين تجربها من الموبايل', 'بتجرب على جهازك الأول', 'قبل النشر أونلاين', 'later'),
    ('حساب Resend للإيميلات', 'دعوات العملاء ونسيت الباسورد والتذكيرات', 'الإيميلات بتتسجل بس ومش بتتبعت', 'قبل النشر أونلاين', 'later'),
    ('البراند والدومين: اللوجو والألوان والخط واسم الموقع', 'عشان الشكل النهائي',
     'بشتغل بشكل بسيط مؤقت، وإنت تحط تصميمك بعدين', 'قبل الإطلاق', 'later'),
    ('باقات أول مدرب حقيقي: الأسماء والأسعار والمدد', 'بدل البيانات التجريبية', 'بيانات تجريبية', 'قبل الإطلاق', 'later'),
    ('محامي مصري يراجع قانون حماية البيانات 151/2020', 'قبل ما أي عميل حقيقي يحط بياناته',
     'البيتا تفضل بعملاء تجريبيين بس', 'قبل أول عميل حقيقي', 'later'),
    ('5 قرارات صغيرة في المنتج (التجميد، صلاحيات المساعد، مسح بيانات الدفع)', 'مكتوبين في OPEN_DECISIONS',
     'أخدت في كل واحد الاختيار الأأمن، وتقدر تغيره بعدين', 'وقت ما تحب', 'later'),
    ('الميزانية كلها (أسعار 8 نوفمبر، اتأكد قبل الدفع): دلوقتي لحد ما تجربه على جهازك 0 دولار زيادة. '
     'تجربة أونلاين بكام مدرب: من 0 لـ 45 دولار في الشهر (Supabase 25 + Vercel 20) + دومين 10-15 دولار في السنة. '
     'الإطلاق في مصر: حوالي 65-85 دولار في الشهر (+ Resend 20 لو الإيميلات عدت 3000) + واتساب حوالي 0.004 دولار للرسالة، '
     'و Paymob بياخد 2.75% + 3 جنيه من كل دفعة بالكارت. ومحامي لقانون حماية البيانات (عرض سعر). التفاصيل في docs/plans/BUDGET.md',
     'عشان تعرف التكلفة من أول لآخر قبل ما نفتح أي حساب',
     'مش هدفع ولا أفتح أي حساب. الشغل كله بيكمل على جهازك', 'قبل النشر أونلاين', 'later'),
    ('حدود اشتراك Claude: النظام بيشتغل لحد ما الحد يخلص، وبعدين يستنى الريست ويكمل',
     'كده الحد الأسبوعي بيخلص أسرع، وده بيأثر على شغلك إنت كمان',
     'بيشتغل لوحده. لو عايز توقفه: اضغط "DAWLYY autopilot - PAUSE" على الديسكتوب', 'وقت ما تحب', 'later'),
]


def hours_text(low, high):
    if low == high:
        return {1: 'حوالي ساعة', 2: 'حوالي ساعتين'}.get(low, f'حوالي {low} ساعات')
    if high == 2:
        return 'من ساعة لساعتين'
    return f'من {low} لـ {high} ساعات'


def main():
    steps = []
    for n, (phase, step, state, low, high, note) in enumerate(STEPS, start=1):
        steps.append({
            'n': n, 'phase': phase, 'step': step, 'state': state, 'status': STEP_LABEL[state],
            'h_min': 0 if state == 'done' else low, 'h_max': 0 if state == 'done' else high,
            'time': '' if state == 'done' else hours_text(low, high), 'note': note,
        })
    assert sum(1 for s in steps if s['state'] == 'now') == 1, 'exactly one step must be now'
    now = [{'n': n, 'what': what, 'state': NOW_LABEL[code], 'state_code': code, 'detail': detail, 'updated': NOW_LOCAL}
           for n, (what, code, detail) in enumerate(NOW, start=1)]
    needs = [{'n': n, 'item': item, 'why': why, 'if_silent': silent, 'urgency': when, 'urgency_code': code}
             for n, (item, why, silent, when, code) in enumerate(NEEDS, start=1)]
    datasets = []
    for name, rows in (('steps', steps), ('now', now), ('needs', needs)):
        path = OUT / f'{name}.json'
        path.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding='utf-8', newline='\n')
        datasets.append({'doc_id': name, 'path': str(path)})
    request = {'created_at_iso': NOW_LOCAL, 'artifact_url': ARTIFACT_URL, 'datasets': datasets}
    (OUT / 'publish_request.json').write_text(json.dumps(request, ensure_ascii=False, indent=1), encoding='utf-8',
                                              newline='\n')
    left = [s for s in steps if s['state'] != 'done']
    print('utc', NOW_UTC, 'local', NOW_LOCAL)
    print('steps', len(steps), 'done', len(steps) - len(left), 'hours', sum(s['h_min'] for s in left),
          sum(s['h_max'] for s in left))
    print('now', len(now), 'needs', len(needs), 'request', OUT / 'publish_request.json')


if __name__ == '__main__':
    main()
