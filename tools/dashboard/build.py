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
    ('الأساس', 'الخطة، أساس الموقع بالعربي والإنجليزي، وقاعدة البيانات', 'done', 0, 0, 'اتحفظ'),
    ('الأمان', 'فحص أمان قاعدة البيانات وبناء الحل', 'done', 0, 0, '287 قاعدة حماية و40 حارس و15 مجموعة اختبارات أمان'),
    ('المميزات', 'كل مميزات البيتا: العملاء، الباقات، الدفع، البرامج، التغذية، الفورمز، الرسائل، الإعدادات', 'done', 0, 0, 'اتحفظ'),
    ('الإطلاق', 'البيتا الخاصة: كل الاختبارات والمراجعة الأخيرة', 'done', 0, 0, 'خلصت 12 نوفمبر، والـ 8 فحوصات نجحت'),
    ('التطوير الجديد', 'الأساس: الأرشيف والاسترجاع وسجل التعديلات في قاعدة البيانات', 'done', 0, 0, 'اتحفظ 14 نوفمبر'),
    ('التطوير الجديد', 'صندوق المدرب والتنقل الجديد', 'done', 0, 0, 'اتحفظ 14 نوفمبر'),
    ('التطوير الجديد', 'شاشة "النهارده" للعميل و4 تابات', 'done', 0, 0, 'اتحفظ 15 نوفمبر'),
    ('التطوير الجديد', 'الأرشيف والتراجع والتعديل الجماعي في قوائم المدرب', 'done', 0, 0, 'اتحفظ 15 نوفمبر'),
    ('التطوير الجديد', 'سجل النشاط، ومساعد المدرب بقواعد ثابتة من غير ذكاء اصطناعي مدفوع', 'now', 3, 6,
     'Codex بيبنيهم، وبيقف عند حد اشتراك ChatGPT ويكمل بعده'),
    ('التطوير الجديد', 'باقي شاشات العميل والمدرب، والتصميم الموحد', 'later', 6, 10, ''),
    ('الاختبار', 'اختبار كل حاجة ومراجعة الأمان للتحديث الجديد', 'later', 4, 8, 'بعدها أبلغك إنه جاهز'),
    ('الإطلاق', 'النشر على staging مع الجلسة اللي معاك', 'later', 1, 2, 'محتاج موافقتك'),
]

NOW_LABEL = {'running': 'شغال', 'done': 'خلص', 'failed': 'وقع', 'waiting': 'مستني'}

# (what, state code, detail)
NOW = [
    ('نظام التشغيل الذاتي', 'running', 'شغال. الجهاز اتعمله ريستارت الساعة 3 العصر 15 نوفمبر، ورجع كمل لوحده'),
    ('Codex', 'waiting', 'خلص حد اشتراك ChatGPT الساعة 3:31 العصر، وبيرجع 8:13 بالليل. هيكمل سجل النشاط من مكان ما وقف'),
    ('حد Claude الأسبوعي', 'waiting', 'وصل 86%، فلحد التجديد يوم التلات 6 الصبح بعمل مراجعة واختبارات وحفظ بس، والبناء على Codex'),
    ('آخر حاجة اتحفظت', 'done', 'شاشة النهارده للعميل، والأرشيف والتراجع في قوائم المدرب، واتجربوا: 908 اختبار ناجحين'),
    ('الكود على GitHub', 'done', 'ريبو خاص، وبيترفع لوحده كل ساعة بعد فحص إن مفيش أسرار'),
    ('Fable', 'waiting', 'محتاج رصيد مدفوع، فالشغل ماشي بـ Opus و Sonnet و Codex'),
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
