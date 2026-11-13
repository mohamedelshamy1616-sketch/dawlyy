import { localize } from '../types';
import type { WeekReview, WeekReviewInput } from './types';
import { percent } from './math';

// All authored draft copy stays here so tone can be edited without changing review rules.
export const REVIEW_TEMPLATES = {
  ar: {
    egyptian: {
      greeting: 'إزيك يا {name}، دي متابعتنا للأسبوع.',
      workouts: 'خلصت {done} من {planned} تمارين.',
      praise: 'التزامك حلو جدًا، كمل كده!',
      encouragement: 'نرجع واحدة واحدة، كل تمرينة بتفرق.',
      meals: 'سجّلت وجباتك {logged} من {days} أيام.',
      weightChange: 'فرق وزنك بين أول وآخر تسجيل {delta} كجم.',
      weight: {
        lose: {
          down: 'وزنك نازل بمعدل {rate} كجم في الأسبوع، في اتجاه هدف النزول.',
          up: 'وزنك طالع بمعدل {rate} كجم في الأسبوع، وهدفنا النزول؛ نراجع الأرقام سوا.',
          flat: 'اتجاه وزنك ثابت تقريبًا، وهدفنا النزول؛ نراجع الأرقام سوا.',
        },
        gain: {
          down: 'وزنك نازل بمعدل {rate} كجم في الأسبوع، وهدفنا الزيادة؛ نراجع الأرقام سوا.',
          up: 'وزنك طالع بمعدل {rate} كجم في الأسبوع، في اتجاه هدف الزيادة.',
          flat: 'اتجاه وزنك ثابت تقريبًا، وهدفنا الزيادة؛ نراجع الأرقام سوا.',
        },
        maintain: {
          down: 'وزنك نازل بمعدل {rate} كجم في الأسبوع، وهدفنا التثبيت؛ نراجع الأرقام سوا.',
          up: 'وزنك طالع بمعدل {rate} كجم في الأسبوع، وهدفنا التثبيت؛ نراجع الأرقام سوا.',
          flat: 'اتجاه وزنك ثابت تقريبًا، وده ماشي مع هدف التثبيت.',
        },
        none: {
          down: 'وزنك نازل بمعدل {rate} كجم في الأسبوع.',
          up: 'وزنك طالع بمعدل {rate} كجم في الأسبوع.',
          flat: 'اتجاه وزنك ثابت تقريبًا.',
        },
      },
      prs: 'أرقام جديدة في {names}، شغل حلو!',
      stalls: 'نراجع {names} سوا، التقدم محتاج متابعة.',
      separator: '، ',
      closing: 'إيه اللي يساعدك تلتزم أكتر الأسبوع الجاي؟',
    },
    gulf: {
      greeting: 'هلا يا {name}، هذي متابعتنا للأسبوع.',
      workouts: 'خلّصت {done} من {planned} تمارين.',
      praise: 'التزامك ممتاز، استمر!',
      encouragement: 'نرجع خطوة خطوة، كل تمرين يفرق.',
      meals: 'سجّلت وجباتك {logged} من {days} أيام.',
      weightChange: 'فرق وزنك بين أول وآخر تسجيل {delta} كجم.',
      weight: {
        lose: {
          down: 'وزنك نازل بمعدل {rate} كجم بالأسبوع، باتجاه هدف النزول.',
          up: 'وزنك طالع بمعدل {rate} كجم بالأسبوع، وهدفنا النزول؛ نراجع الأرقام سوا.',
          flat: 'اتجاه وزنك ثابت تقريبًا، وهدفنا النزول؛ نراجع الأرقام سوا.',
        },
        gain: {
          down: 'وزنك نازل بمعدل {rate} كجم بالأسبوع، وهدفنا الزيادة؛ نراجع الأرقام سوا.',
          up: 'وزنك طالع بمعدل {rate} كجم بالأسبوع، باتجاه هدف الزيادة.',
          flat: 'اتجاه وزنك ثابت تقريبًا، وهدفنا الزيادة؛ نراجع الأرقام سوا.',
        },
        maintain: {
          down: 'وزنك نازل بمعدل {rate} كجم بالأسبوع، وهدفنا التثبيت؛ نراجع الأرقام سوا.',
          up: 'وزنك طالع بمعدل {rate} كجم بالأسبوع، وهدفنا التثبيت؛ نراجع الأرقام سوا.',
          flat: 'اتجاه وزنك ثابت تقريبًا، وهذا يناسب هدف التثبيت.',
        },
        none: {
          down: 'وزنك نازل بمعدل {rate} كجم بالأسبوع.',
          up: 'وزنك طالع بمعدل {rate} كجم بالأسبوع.',
          flat: 'اتجاه وزنك ثابت تقريبًا.',
        },
      },
      prs: 'أرقام جديدة في {names}، كفو عليك!',
      stalls: 'نراجع {names} سوا، التقدم يحتاج متابعة.',
      separator: '، ',
      closing: 'وش يساعدك تلتزم أكثر الأسبوع الجاي؟',
    },
  },
  en: {
    greeting: 'Hi {name}, here is our weekly review.',
    workouts: 'You completed {done} of {planned} workouts.',
    praise: 'Great consistency, keep it going!',
    encouragement: 'Let’s build back one session at a time.',
    meals: 'You logged meals on {logged} of {days} days.',
    weightChange: 'Your weight changed by {delta} kg between your first and last entries.',
    weight: {
      lose: {
        down: 'Weight is trending down by {rate} kg/week, towards your loss goal.',
        up: 'Weight is trending up by {rate} kg/week; let’s review it together against your loss goal.',
        flat: 'Weight is roughly steady; let’s review it together against your loss goal.',
      },
      gain: {
        down: 'Weight is trending down by {rate} kg/week; let’s review it together against your gain goal.',
        up: 'Weight is trending up by {rate} kg/week, towards your gain goal.',
        flat: 'Weight is roughly steady; let’s review it together against your gain goal.',
      },
      maintain: {
        down: 'Weight is trending down by {rate} kg/week; let’s review it together against your maintenance goal.',
        up: 'Weight is trending up by {rate} kg/week; let’s review it together against your maintenance goal.',
        flat: 'Weight is roughly steady, in line with your maintenance goal.',
      },
      none: {
        down: 'Weight is trending down by {rate} kg/week.',
        up: 'Weight is trending up by {rate} kg/week.',
        flat: 'Weight is roughly steady.',
      },
    },
    prs: 'New bests in {names}. Nice work!',
    stalls: 'Let’s review {names} together and check progress.',
    separator: ', ',
    closing: 'What would help you stay consistent in the coming week?',
  },
} as const;

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? ''));
}

export function draftReply(input: WeekReviewInput, summary: WeekReview['summary'], locale: 'ar' | 'en'): WeekReview['draft'] {
  const copy = locale === 'en' ? REVIEW_TEMPLATES.en : REVIEW_TEMPLATES.ar[input.coach.dialect];
  const lines = [fill(copy.greeting, { name: input.client.firstName })];
  const workouts = summary.adherence.workouts;
  const adherence = percent(workouts.done, workouts.planned);
  if (workouts.planned > 0 || workouts.done > 0) {
    let line = fill(copy.workouts, { done: workouts.done, planned: workouts.planned });
    if (adherence !== null && adherence >= 80) line += ` ${copy.praise}`;
    else if (adherence !== null && adherence < 50) line += ` ${copy.encouragement}`;
    lines.push(line);
  }
  const meals = summary.adherence.meals;
  if (meals) lines.push(fill(copy.meals, { logged: meals.daysLogged, days: meals.daysInPeriod }));
  const weight = summary.weight;
  if (weight.trend !== null && weight.kgPerWeek !== null) {
    lines.push(fill(copy.weight[input.client.goal ?? 'none'][weight.trend], { rate: Math.abs(weight.kgPerWeek) }));
  } else if (weight.deltaKg !== null) {
    lines.push(fill(copy.weightChange, { delta: weight.deltaKg }));
  }
  const names = (exercises: { name: WeekReviewInput['exercises'][number]['name'] }[]) => exercises.slice(0, 2)
    .map(exercise => localize(exercise.name, locale)).join(copy.separator);
  if (summary.prs.length > 0) lines.push(fill(copy.prs, { names: names(summary.prs) }));
  if (summary.stalls.length > 0) lines.push(fill(copy.stalls, { names: names(summary.stalls) }));
  // R4a: flags and check-in free text are never interpolated into a client message.
  // R4b blocks sending separately until every open flag is handled.
  lines.push(copy.closing, ...input.coach.signaturePhrases);
  return { locale, dialect: locale === 'en' ? null : input.coach.dialect, text: lines.join('\n') };
}
