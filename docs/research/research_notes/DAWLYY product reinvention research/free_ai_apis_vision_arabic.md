# Free and cheap AI APIs for vision (meal photos), Arabic text and Egyptian voice notes: provider comparison for DAWLYY (read 2026-11-13)

Method: official pages read live with WebFetch on 2026-11-13; OpenRouter model list/prices from its public JSON endpoint https://openrouter.ai/api/v1/models (no key). Exa returned an overloaded error on its one allowed try, so WebSearch/WebFetch were used. No signups, keys or test calls. Where a page could not be read it is listed under Gaps, with secondary sources marked **[SECONDARY]**. Numbers in "Inferences" are my arithmetic on cited prices and my stated assumptions, not cited facts.

## 1. Which vision/Arabic-capable models are available free now, and what are the free-tier limits, per provider?

### Takeaway
Free vision exists on OpenRouter (7 `:free` image models), Gemini API (every Flash/Flash-Lite listed is "free of charge"), Cloudflare (10,000 neurons/day), Cerebras (Free Trial, 2 images/request) and Groq (Qwen3.8-27B). GitHub Models is retired (30 Jul 2026), Together has no documented free tier, Hugging Face gives free users no credits. Published numeric limits are thin: Gemini's page gives no free-tier numbers, Mistral's are unpublished, and NVIDIA's 40 RPM is community-reported only.

### Cited Findings
**OpenRouter**
- Free models (IDs ending `:free`): under 10 credits purchased all-time = 20 requests/min and 50 requests/day; at least 10 credits = 20 RPM and 1,000 requests/day. The paid variant "has no platform-level request cap." Negative balance can error even on free models — [OpenRouter limits](https://openrouter.ai/docs/api-reference/limits) (read 2026-11-13)
- Public model list on 2026-11-13: 13 `:free` models, 7 with image input: `thinkingmachines/inkling-2-small:free` (1,048,576 ctx), `particle-ai/particle-1:free` (1,048,576), `nvidia/nemotron-3.5-super-vl:free` (1,000,000; text+image+video), `dots-studio/dots-3-note-preview:free` (512,000), `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` (256,000; text+audio+image+video), `google/gemma-4-26b-a4b-it:free` (262,144), `google/gemma-4-31b-it:free` (262,144). Non-vision free: baidu/ernie-5.5-flash-preview, liquid/lfm-3-1.7b, recursive/flint-v1.0, nvidia/nemotron-3.5-lightning, cohere/north-mini-code, nvidia/nemotron-3-ultra-550b-a55b (plus others) — [OpenRouter models API](https://openrouter.ai/api/v1/models)
- Paid sibling prices per 1M tokens (in/out): google/gemma-4-26b-a4b-it $0.09/$0.30; google/gemma-4-31b-it $0.20/$0.40; mistralai/mistral-small-2603 $0.15/$0.60; qwen/qwen3-vl-30b-a3b-instruct $0.15/$0.60; qwen/qwen3-vl-8b-instruct $0.25/$0.75; meta-llama/llama-4-scout $0.10/$0.30 — [OpenRouter models API](https://openrouter.ai/api/v1/models)

**Google AI Studio / Gemini API**
- Free tier "Free of charge" for Gemini 3.8 Flash, 3.6 Flash, 3 Flash Preview, 3.5 Flash-Lite, 3.1 Flash-Lite, 2.5 Flash-Lite; Gemini 3.1 Pro Preview has no free tier. Paid input per 1M (text/image/video): 3.8 Flash $0.75 through Dec 31 2026 then $1.50 from Jan 1 2027; output $3.75 then $7.50; 3.5 Flash-Lite $0.30 in (covers text, image, video, audio) and $2.50 out; 3.1 Flash-Lite $0.25 in, audio $0.50, $1.50 out; 2.5 Flash-Lite $0.10 in, audio $0.30, $0.40 out. Page says Gemini 2.5 Flash and 2.5 Pro route to other models on Dec 1 2026. Output price includes thinking tokens — [Gemini pricing](https://aistudio.google.com/docs/pricing) (first 100,000 of 114,586 characters read)
- Free-tier limits: the rate-limits page lists no free-tier figures for Flash models (only "Gemini Decision 1": 200 RPM, 50,000 TPM, 10,000 RPD). Limits are per project, RPD resets midnight Pacific; exceeding any of RPM/TPM/RPD triggers an error — [Gemini rate limits](https://aistudio.google.com/docs/rate-limits)

**Groq**
- Vision pages list two models: `qwen/qwen3.8-27b` (max 3 images per request) and `meta-models/muse-spark-open` (limited preview, contact Groq, max 5 images); requests with an image URL max 20MB; no pixel limit or separate base64 limit stated — [Groq vision](https://console.groq.com/docs/vision)
- Rate-limit table (page says these are "base limits for the Developer plan"; free-plan toggle values not captured): qwen/qwen3.8-27b 30 RPM, 1K RPD, 8K TPM, 200K TPD; openai/gpt-oss-120b same; whisper-large-v3 and -turbo 20 RPM, 2K RPD, 7.2K audio seconds/hour, 28.8K audio seconds/day; also lists `canopylabs/orpheus-arabic-saudi` (TTS) 10 RPM, 100 RPD — [Groq rate limits](https://console.groq.com/docs/rate-limits)

**Cloudflare Workers AI**
- "10,000 Neurons per day at no charge"; "$0.011 / 1,000 Neurons" on Workers Paid. Per M tokens (input/output neurons): gemma-4-26b-a4b-it 9,091/27,273; llama-3.2-11b-vision-instruct 4,410/61,493; gemma-3-12b-it 31,371/50,560; mistral-small-3.1-24b 31,876/50,488. Whisper 41.14 neurons/audio-min, whisper-large-v3-turbo 46.63 — [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

**Cerebras**
- Free Trial: gpt-oss-120b and qwen-3.8-27b only, each 5 RPM, 30K uncached TPM, 90K total TPM, 1M tokens/hour, 1M tokens/day. qwen-3.8-27b is the vision model: "Image limits: 2 per request, 10 MiB total request payload" on Free Trial — [Cerebras rate limits](https://inference-docs.cerebras.ai/support/rate-limits)

**NVIDIA build.nvidia.com**
- Official docs fetched did not state free-tier terms. Community-reported only: free hosted access capped at 40 RPM, "unlimited but RPM"; one forum user claims ToS say not for production — [NVIDIA forum thread](https://forums.developer.nvidia.com/t/is-nim-free/369368) **[SECONDARY, user posts, not staff]**. OpenRouter lists NVIDIA vision models free: nemotron-3.5-super-vl and nemotron-3-nano-omni (above)

**Mistral**
- Experiment (free) tier limits not published on pages that could be read; the figures repeated online (1 req/s, 500K TPM, 1B tokens/month) are 2024-era and unverified — [WebSearch summary of help.mistral.ai and third-party pages](https://help.mistral.ai/en/articles/392924-how-do-api-rate-limits-work-and-how-can-i-increase-them) **[SECONDARY]**. OpenRouter lists paid mistral-small-2603 with image input (price above)

**GitHub Models**
- "As of July 30, 2026, GitHub Models has been fully retired." Playground, catalog, inference API and BYOK "are no longer available to any customer" — [GitHub docs](https://docs.github.com/en/github-models/use-github-models/prototyping-with-ai-models)

**Hugging Face Inference Providers**
- Free users: no monthly credits, must buy credits; PRO $2.00/month of credits (also Team/Enterprise $2.00 per seat); billed at provider rates, no markup — [HF pricing](https://huggingface.co/docs/inference-providers/pricing)

**Together**
- Pricing page shows no free tier or credits; only "NVIDIA Nemotron 3.5 Super VL" as serverless vision at $0.15 in / $0.02 cached / $0.50 out per 1M; Whisper Large v3 $0.0015/audio min (streaming $0.0035) — [Together pricing](https://www.together.ai/pricing)

### Inferences
- One Gemma-4 family model (26B-A4B or 31B) is the common denominator: free on OpenRouter, paid on OpenRouter, on Cloudflare, so a dev prototype and a cheap paid production path can use the same model.
- Qwen3.8-27B is the common free vision model on Groq and Cerebras (and possibly OpenRouter paid), useful as a second dev fallback.
- Free-tier daily volume at 3 photos/client/day: OpenRouter 1,000 RPD supports ~333 clients at most, 50 RPD only ~16; Cloudflare free 10,000 neurons/day is roughly 380 photos/day on gemma-4-26b (my arithmetic, section 6 assumptions). No free tier reaches 1,000 active clients.

### Gaps
- Gemini free-tier RPM/RPD/TPM per model, and image size limits: not on the pages read; AI Studio per-project limits page needs a login.
- Mistral Experiment tier numbers, NVIDIA official trial terms and limits, Together free credits: not verifiable from official text.
- Groq free-plan (not Developer plan) values; whether Groq qwen3.8-27b is on the free plan.
- Cloudflare per-image size limit, Gemini image token counts, OpenAI image token counts: not read.
- Arabic quality of Gemma 4, Qwen3.8, Nemotron, Inkling, Particle: no source found.

## 2. Terms that decide production use: commercial use, training, retention, region, health data

### Takeaway
Free tiers are not safe for client health photos: Gemini's free service uses content to improve products, with human review, and tells you not to send personal information; Mistral's Experiment plan may train on requests; OpenRouter free routing depends on upstream provider policies. Paid Gemini, Groq, Cloudflare and OpenRouter-with-deny-routing are the credible production paths. No page I could read lists Egypt, Saudi or the UAE as supported or blocked.

### Cited Findings
**Google Gemini API**
- Free plan card: "Content used to improve our products"; the pricing table row "Used to improve our products" is "Yes" on free-tier Flash columns — [Gemini pricing](https://aistudio.google.com/docs/pricing) (read 2026-11-13)
- Terms: "Google uses the content you submit to the Services and any generated responses to provide, improve, and develop"; "human reviewers may read, annotate, and process your API input and output"; "Do not submit sensitive, confidential, or personal information to the Unpaid Services." — [Gemini API terms](https://aistudio.google.com/docs/terms) (2026-11-13; the fetch tool paraphrases around some quotes, verify wording on the page)
- Paid: Google "doesn't use your prompts" or "responses to improve our products"; "Google logs prompts and responses for a limited period of time, solely for detecting and preventing violations"; Search grounding stores prompts/output 30 days — same terms page
- "You may not use the Services in clinical practice, to provide medical advice"; "Don't rely on the Services for medical, mental health, legal, financial, or other professional advice." Regions: "You may only access the Services... within an available region"; EEA users of API clients require Paid Services — same terms page. The list of available regions was not on the page.

**OpenRouter**
- Training: "Wherever possible, OpenRouter works with providers to ensure that prompts will not be trained on"; account settings let you block routing to providers that may train, with "separate settings for paid and free models"; "OpenRouter does not have routing rules that change based on data retention policies of providers"; ZDR = "no routine storage after processing" — [OpenRouter provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging)
- Per-request restriction: `"provider": {"data_collection": "deny"}` ("use only providers which do not collect user data"); `"provider": {"zdr": true}` (only ZDR endpoints); also `only`, `ignore`, `order`, `allow_fallbacks: false`, `require_parameters: true` — [OpenRouter provider selection](https://openrouter.ai/docs/guides/routing/provider-selection)
- ToS: s6.1 "Where possible, OpenRouter has opted out of model training with the Models it uses." and "Some Models may store or train on your Inputs for improving their own large language models"; s6.5 "Unless explicitly opted in to prompt logging, we do not store your Inputs after categorizing them"; s10.2 points commercial users to its Data Processing Agreement; s7(4) bans reselling API access or building a competing service; s16(2) "YOU ARE SOLELY RESPONSIBLE FOR EVALUATING OUTPUTS, IMPLEMENTING APPROPRIATE HUMAN REVIEW AND SAFEGUARDS"; s16(1) disclaimer lists "MEDICAL" among unsuitable uses. No free-tier-specific commercial clause found — [OpenRouter terms](https://openrouter.ai/terms) (2026-11-13; fetch-tool paraphrase)

**Groq**
- "By default, Groq does not retain customer data for inference requests."; logs may be kept for a limited window for reliability/abuse; "All customers may enable Zero Data Retention (ZDR) in Data Controls settings." Page does not say whether Groq trains on customer data — [Groq your-data](https://console.groq.com/docs/your-data)

**Cloudflare Workers AI**
- "Cloudflare does not use Customer Content processed by Workers AI to train AI models."; processed "only for as long as needed to provide the service"; storage can occur if you use R2/KV/Durable Objects or AI Gateway logging/caching. Page does not address region or residency — [Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/)

**Mistral**
- Help-centre article (via search summary): Experiment-plan API requests "may be used to train Mistral's models"; sign-up needs a phone number. Another source says an opt-out toggle exists; accounts conflict — [Mistral help](https://help.mistral.ai/en/articles/450104-how-can-i-try-the-api-for-free-with-the-experiment-plan) **[SECONDARY via search snippet; direct fetch returned 404]**

**NVIDIA** — see section 1; community claim of "not for production" is unverified.

**Anthropic, OpenAI, Hugging Face, Together, Cerebras**: data-use pages not read in this run (see Gaps).

### Inferences
- Any DAWLYY client meal photo is personal health data. Gemini free tier, Mistral Experiment and OpenRouter free routes without `data_collection: deny` must not receive real client data. Use them with synthetic or consented test photos only.
- On OpenRouter, send `provider: {data_collection: "deny", allow_fallbacks: false}` and pin `only` to named providers whose policy was read; a `:free` model with `deny` may simply have no available endpoint (untested).
- Coach summaries and tips are advice-adjacent: Gemini terms bar "medical advice" use and OpenRouter disclaims medical suitability, so the app should show estimates as editable, coach-reviewed drafts (matches the sibling note's "AI estimates, human confirms" design).
- Terms clauses about Egypt/Saudi/UAE availability: none found, so a one-time check in the console of the chosen paid provider is needed before launch.

### Gaps
- Official data-use, retention and regional-availability pages for Anthropic API, OpenAI API, Cerebras, Together, Hugging Face (and per-provider on HF), NVIDIA trial ToS, Mistral terms/DPA.
- Whether Gemini's "available region" list includes Egypt, Saudi Arabia, UAE (the page did not enumerate it).
- Health-data clauses for Groq, Cloudflare, OpenRouter upstream providers (HIPAA/BAA-style statements) not found.
- OpenRouter's actual upstream policy for each `:free` model not read (it is per endpoint in the model page JSON, not fetched).

## 3. Paid baselines: Claude Haiku 5.5, a GPT-5.x mini, Gemini Flash

### Takeaway
Claude Haiku 5.5 is $0.10 in / $0.50 out per 1M tokens (up to 100K-token prompts), the same as OpenAI's gpt-6-luna; GPT-5.4-mini is $0.75/$4.50; Gemini 3.8 Flash is $0.75/$3.75 (doubling on 1 Jan 2027). Haiku 5.5 is cheaper than every Gemini Flash tier listed and than OpenAI's older minis.

### Cited Findings
- Claude Haiku 5.5: input $0.10/MTok, 5m cache write $0.125, 1h cache write $0.20, cache hit $0.01, output $0.50 (prompts up to 100,000 tokens); over 100,000 tokens $0.50 in / $2.50 out. Haiku 4.5 is $1/$5. Batch API is 50% off: Haiku 5.5 $0.05 in / $0.25 out. US-only inference (`inference_geo`) adds a 1.1x multiplier — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) (read 2026-11-13; OpenRouter lists the same $0.0000001/$0.0000005 per token)
- Claude image cost: each image costs ⌈width/28⌉ × ⌈height/28⌉ visual tokens; 1000x1000 px = 1,296 tokens; 1092x1092 = 1,521; 1920x1080 = 2,691 on the high-resolution tier (Claude 4.7 and later; max long edge 2,576 px, 4,784 tokens). Images over the API: JPEG, PNG, GIF, WebP — [Anthropic vision](https://platform.claude.com/docs/en/build-with-claude/vision)
- OpenAI standard per 1M (input/cached/output): gpt-6-luna $0.10/$0.01/$0.50; gpt-5.6-luna $0.20/$0.02/$1.20; gpt-5.4-mini $0.75/$0.075/$4.50; gpt-5.4-nano $0.20/$0.02/$1.25; gpt-5-mini $0.25/$0.025/$2.00; gpt-5-nano $0.05/$0.005/$0.40. Batch is half. Transcription: whisper $0.006/min; gpt-4o-transcribe est. $0.006/min; gpt-4o-mini-transcribe est. $0.003/min — [OpenAI pricing](https://developers.openai.com/api/docs/pricing) (read 2026-11-13; "gpt-6-luna" and "gpt-5.6-luna" are what the page lists; whether luna is the "mini" tier of its line is my reading of the table, not stated)
- Gemini paid per 1M (see section 1 for full list): 3.8 Flash $0.75/$3.75 to Dec 31 2026, then $1.50/$7.50; 3.5 Flash-Lite $0.30/$2.50; 3.1 Flash-Lite $0.25/$1.50 (audio $0.50) — [Gemini pricing](https://aistudio.google.com/docs/pricing)

### Inferences
- Image token counts for OpenAI and Gemini were not read, so cross-provider photo costs in section 6 use one assumed input size for all; only Anthropic's image formula is sourced.

### Gaps
- OpenAI and Gemini image-token formulas; whether Haiku 5.5 has vision quality sufficient for food (see section 4: no benchmark).
- Haiku 5.5 data-use/retention terms and regional availability.

## 4. Quality evidence: food-image benchmarks and Arabic/dialect benchmarks

### Takeaway
Independent studies show LLMs identify foods well (F1 about 89%) but under-estimate portions and energy (MAPE 36-64%). I found no 2026 head-to-head of the current candidate models on Nutrition5k, and no Arabic or dialect benchmark that includes Haiku 5.5, Gemma 4 or Qwen3.8. The models' relative quality on Egyptian and Gulf Arabic is unproven; DAWLYY needs its own test set.

### Cited Findings
**Food**
- 2025 study of ChatGPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro on 52 photos: energy MAPE 35.8% / 35.8% / 64.2%; underestimation grows with portion size — [PMC12513282](https://pmc.ncbi.nlm.nih.gov/articles/PMC12513282/) (figures as reported in the sibling note, not re-read)
- Search results (snippets only): SnappyMeal (arXiv 2511.03907) evaluated Gemini via Batch API over full Nutrition5k; a Virginia Tech thesis zero-shot tested eight MLLMs (GPT-4o, Qwen 2/2.5, DeepSeek, LLaVA) on Nutrition5k and MetaFood3D; an ODU study benchmarked seven LMMs (GPT, Gemini, Llama); CalorieVoL notes MLLMs "struggle to accurately recognize volume information"; a June 2026 preprint adds CalorieBench-80K and Food-R1 (arXiv 2606.04986); FAM-Bench is arXiv 2605.31410 — [SnappyMeal](https://arxiv.org/pdf/2511.03907); [VT thesis](https://vtechworks.lib.vt.edu/items/b67c2a61-f283-41ba-9602-9798306b9529); [Food-R1](https://arxiv.org/html/2606.04986v1); [FAM-Bench](https://arxiv.org/pdf/2605.31410) **[SECONDARY, abstracts/snippets only, numbers not read]**

**Arabic**
- AraDiCE (arXiv 2409.11404, COLING 2025): dialect and culture benchmark covering Gulf, Egyptian and Levantine; Arabic-centric models vary by dialect, doing best on Gulf generation (attributed to Gulf's closeness to MSA); Jais and AceGPT beat multilingual models on dialect tasks; LLMs struggle most with dialect identification, generation, translation — [AraDiCE v3](https://arxiv.org/html/2409.11404v3); [ACL anthology](https://aclanthology.org/2025.coling-main.283) **[SECONDARY via search summary]**
- DialectalArabicMMLU (arXiv 2510.27543, Oct 2025): Syrian, Egyptian, Emirati, Saudi, Moroccan across 32 domains, 22K QA pairs — [arXiv](https://arxiv.org/html/2510.27543v1) **[SECONDARY, snippet]**
- OALL: press claims TII Falcon-H1 Arabic 34B scored 75.36% and 7B 71.47%, ranked first as of April 2026; a separate arXiv paper (April 2026) claims Arabic-DeepSeek-R1 beats the previous best and GPT-5.1; these conflict and are unverified. OALL v2 scores are not comparable with v1 — [IT Brief](https://itbrief.co.uk/story/uae-s-falcon-h1-arabic-tops-open-arabic-llm-rankings); [arXiv 2604.06421](https://arxiv.org/html/2604.06421v1) **[SECONDARY]**

### Inferences
- The only dialect-specific result I can use: Gulf is easier than Egyptian for generation. Egyptian coach drafts are the higher risk and should be checked by a speaker.
- Practical plan: build a 100-photo food set (koshari, ful, molokhia, mahshi, kabsa, mandi, etc. with weighed portions) and a 50-prompt Arabic set (Egyptian and Gulf), then score Haiku 5.5, Gemini 3.5 Flash-Lite/3.8 Flash and Gemma 4 on it before committing. Prices differ 10x, so the test is cheap relative to a wrong choice.

### Gaps
- No quality numbers for Haiku 5.5, Gemini 3.x Flash, Gemma 4, Qwen3.8, Nemotron VL on food or Arabic dialect.
- Live OALL/AraDiCE leaderboard tables and Nutrition5k per-model numbers were not read.
- Nothing on Egyptian or Gulf dish accuracy for any model (also a gap in the sibling note).

## 5. Speech-to-text for Egyptian Arabic voice notes

### Takeaway
Whisper large-v3 is weak on Egyptian and Gulf speech (30.60 and 46.14 WER in Cohere's own evaluation); Cohere Transcribe Arabic (July 2026, Apache 2.0) roughly halves that, but is vendor-reported. Groq's free Whisper (20 RPM, 2K RPD) is fine for dev; paid Whisper is $0.0015 to $0.006 per minute depending on host.

### Cited Findings
- Cohere Transcribe Arabic (2B, Apache 2.0, July 2026) WER, Cohere internal evals (lower is better): Gulf / Egyptian = Cohere Transcribe Arabic 24.36 / 16.24; OmniASR-LLM-7B 36.45 / 16.47; Cohere Transcribe 37.89 / 22.86; Whisper v3 Large 46.14 / 30.60. Weights on Hugging Face; Cohere API "free access subject to rate limits" (no price; Model Vault priced per instance-hour) — [Cohere on HF](https://huggingface.co/blog/CohereLabs/cohere-transcribe-arabic-07-2026-release) **[VENDOR]**
- Third-party: zero-shot whisper-large-v3-turbo on FLEURS ar_eg (427 samples) 71.8% normalized WER; Whisper-medium fine-tuned on ~72 h Egyptian speech 18.03% WER on its own validation split — [friendli.ai FLEURS result](https://friendli.ai/models/zainab11/whisper-small-ar-fleurs); [HF MAdel121/whisper-medium-egy](https://huggingface.co/MAdel121/whisper-medium-egy) **[SECONDARY, different test sets, not comparable]**
- Prices: Groq whisper-large-v3 / turbo free-plan-table limits above (20 RPM, 2K RPD, 7.2K audio sec/hour, 28.8K sec/day); OpenAI whisper $0.006/min, gpt-4o-mini-transcribe est. $0.003/min; Together Whisper Large v3 $0.0015/min; Cloudflare whisper-large-v3-turbo 46.63 neurons/min = about $0.0005/min paid (my arithmetic at $0.011 per 1,000 neurons), 10,000 neurons/day free covers about 214 minutes/day — sources in sections 1 and 3
- Gemini accepts audio input (Flash and Flash-Lite model cards list audio; paid audio price 3.1 Flash-Lite $0.50/M, 2.5 Flash-Lite $0.30/M, 3.5 Flash-Lite one $0.30 rate for all) — [Gemini pricing](https://aistudio.google.com/docs/pricing); no Egyptian Arabic accuracy figure found for Gemini audio

### Inferences
- Voice-note-to-plan-edit should be two steps: ASR transcript shown to the coach, then an LLM turns it into structured edits. Because Whisper is weak on dialect, show the transcript for confirmation.
- Cost per 1,000 minutes: Together Whisper $1.50, Cloudflare about $0.51, OpenAI mini $3, whisper $6 (my arithmetic).

### Gaps
- Gemini audio accuracy on Egyptian Arabic, and token-per-second audio rate: not read.
- Groq paid Whisper price and free-plan vs Developer-plan limits.
- Cohere API terms, licence file for commercial use (article says Apache 2.0 only).
- No independent (non-vendor) multi-model Egyptian ASR benchmark found.

## 6. Recommendation, costs per 1,000 items, scale scenarios, and freellmapi split

### Takeaway
Do not build production on free tiers. Prototype on free routes with synthetic photos; run production on a paid, no-training endpoint. Primary for meal photos and Arabic summaries: Claude Haiku 5.5 at $0.10/$0.50 (about $0.37 per 1,000 photos and $1.00 per 1,000 weekly summaries under my assumptions), pending a quality test; fallback Gemini 3.5 Flash-Lite (paid) or gpt-6-luna. Voice notes: Groq/Together Whisper for dev, and test Cohere Transcribe Arabic or Gemini audio before paid launch. Even at 10,000 clients the AI bill is a few hundred dollars a month.

### Cited Findings
(All prices from sections 1 and 3; no additional cited facts here.)

### Inferences
Assumptions (mine): photo = 1000x1000 image (Haiku 1,296 tokens) + 400 prompt tokens, so about 1,700 input tokens for every provider (OpenAI/Gemini image counts unverified), 400 output tokens (ingredient list plus range). Weekly summary = 6,000 input tokens (a week of logs in Arabic) and 800 output. Gemini output includes thinking tokens, so Gemini photo and summary costs may be higher than shown.

Cost per 1,000 items:

| Model (input/output per 1M) | 1,000 photos | 1,000 weekly summaries |
|---|---|---|
| Claude Haiku 5.5 ($0.10/$0.50) | $0.37 | $1.00 |
| gpt-6-luna ($0.10/$0.50) | $0.37 | $1.00 |
| gpt-5.6-luna ($0.20/$1.20) | $0.82 | $2.16 |
| Gemma 4 26B-A4B on OpenRouter paid ($0.09/$0.30) | $0.27 | $0.78 |
| Gemma 4 31B on OpenRouter paid ($0.20/$0.40) | $0.50 | $1.52 |
| Mistral Small 2603 on OpenRouter paid ($0.15/$0.60) | $0.50 | $1.38 |
| Gemini 3.5 Flash-Lite ($0.30/$2.50) | $1.51 | $3.80 |
| Gemini 3.8 Flash through Dec 2026 ($0.75/$3.75) | $2.78 | $7.50 |
| Gemini 3.8 Flash from Jan 2027 ($1.50/$7.50) | $5.55 | $15.00 |
| gpt-5.4-mini ($0.75/$4.50) | $3.08 | $8.10 |
| Cloudflare gemma-4-26b-a4b (26.4 neurons per photo) | $0.29 | not computed |

Monthly cost (30 days; 3 photos/client/day = 90 photos/client/month; 1 summary/client/week = 4.33/month):

| Active clients | Photos/month | Summaries/month | Haiku 5.5 photos + summaries | Gemini 3.5 Flash-Lite | Gemini 3.8 Flash (2027 price) |
|---|---|---|---|---|---|
| 100 | 9,000 | 433 | $3.33 + $0.43 = about $3.8 | $13.6 + $1.6 = about $15 | $50 + $6.5 = about $56 |
| 1,000 | 90,000 | 4,333 | $33 + $4.3 = about $37 | $136 + $16 = about $152 | $500 + $65 = about $565 |
| 10,000 | 900,000 | 43,333 | $333 + $43 = about $376 | $1,359 + $165 = about $1,524 | $4,995 + $650 = about $5,645 |

Recommendations (primary then fallback; all marked "pending quality test"):
- (a) Meal photos: primary Claude Haiku 5.5 (lowest verified price among major paid models, formula-based image cost, Batch 50% off available for non-urgent work); fallback Gemini 3.5 Flash-Lite paid, or gpt-6-luna. Keep estimates as editable ranges with coach review. Cache nothing sensitive in logs; apply the section 2 provider settings.
- (b) Arabic coach summaries and tip drafts: same primary and fallback. For Gulf Arabic expect fewer problems; Egyptian dialect needs human check. Use Batch (50% off) for the weekly summaries: Haiku 5.5 about $0.50 per 1,000.
- (c) Voice notes: dev on Groq whisper-large-v3 (free 20 RPM/2K RPD) or Cloudflare; production candidates Cohere Transcribe Arabic (self-host or API, check terms) and Gemini audio, with Together Whisper ($0.0015/min) as cheap fallback. Choose after a 30-clip Egyptian test.

freellmapi (dev) vs production:
- Add or keep for dev, with synthetic/consented photos only: OpenRouter `google/gemma-4-31b-it:free` and `gemma-4-26b-a4b-it:free` (plus `nvidia/nemotron-3.5-super-vl:free`), Gemini free Flash-Lite, Groq `qwen/qwen3.8-27b` and whisper, Cerebras `qwen-3.8-27b` (2 images/request), Cloudflare gemma-4-26b.
- Remove: `github` provider (service retired 30 Jul 2026). Hugging Face needs paid credits for free users, so low value. Mistral free trains on data.
- Production cannot use the local router; it needs hosted keys for the paid Haiku 5.5 primary and one fallback in Vercel env vars.
- Vercel Hobby note: I did not check Vercel's non-commercial Hobby terms or function timeouts; both matter and are outside these sources.

### Gaps
- No quality test run: the price ranking is verified, the accuracy ranking is not.
- Token assumptions for OpenAI/Gemini images and Arabic tokenization (Arabic can cost more tokens per word) are unverified; real invoices may differ by 1.5-2x.
- Anthropic data policy, rate limits/tier for a new account, and Egypt/Saudi/UAE availability must be confirmed in the console before launch.
- The sibling note's food APIs (Passio, LogMeal, Nutritionix, Edamam, FatSecret, Calorie Mama) were not re-verified in this run: the assignment asked for it, but the budget went to LLM providers. They remain "unverified" as flagged there. Next step: read each vendor's live pricing and terms page.
