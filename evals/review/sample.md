# Hand check · 60 cases

For each case write one line in `evals/review/josh.jsonl`: `{"id": N, "ok": true}` if the authored label is right, or `{"id": N, "expect": {...}}` with the corrected label. Then run `node evals/judge.mjs --josh evals/review/josh.jsonl`.

## #1 · price_fact · ar

> **Visitor:** شقد سعر القدم في الينابيع؟

- Authored: `areaPrices · The Springs`
- Judge: `areaPrices · The Springs`

## #8 · price_fact · ar

> **Visitor:** فيه ارتفاع في أسعار داماك لاجونز هالسنة؟

- Authored: `areaPrices · DAMAC Lagoons`
- Judge: `areaPrices · DAMAC Lagoons`

## #15 · price_fact · ar

> **Visitor:** قديش سعر القدم المربع بـموتور سيتي؟

- Authored: `areaPrices · Motor City`
- Judge: `areaPrices · Motor City`

## #16 · price_fact · ar

> **Visitor:** شو معدل أسعار الفلل بـذا ليكس؟

- Authored: `areaPrices · The Lakes`
- Judge: `areaPrices · The Lakes`

## #25 · price_fact · ar

> **Visitor:** عايز أعرف متوسط سعر الفيلا في ذا فالي

- Authored: `areaPrices · The Valley`
- Judge: `areaPrices · The Valley`

## #30 · price_fact · ar

> **Visitor:** أود معرفة متوسط سعر بيع الفلل في جي في سي

- Authored: `areaPrices · Jumeirah Village Circle`
- Judge: `areaPrices · Jumeirah Village Circle`

## #36 · price_fact · ar

> **Visitor:** شقد سعر القدم في المدينة المستدامة؟

- Authored: `areaPrices · The Sustainable City · !too_few_deals · mustNot:quoteFigure`
- Judge: `areaPrices · The Sustainable City · !too_few_deals · mustNot:quoteFigure`

## #45 · price_fact · ar

> **Visitor:** كم سعر القدم المربع في الجادة بالشارقة؟

- Authored: `none · mustNot:quoteFigure`
- Judge: `none · mustNot:quoteFigure`

## #46 · price_fact · en

> **Visitor:** how much per sqft in The Springs?

- Authored: `areaPrices · The Springs`
- Judge: `areaPrices · The Springs`

## #50 · price_fact · en

> **Visitor:** hi
>
> **Agent:** Hello! I can help with Dubai villa prices, listings and viewings. What are you after?
>
> **Visitor:** whats a 3 bed townhouse go for in Mudon

- Authored: `areaPrices · Mudon`
- Judge: `areaPrices · Mudon`

## #53 · price_fact · en

> **Visitor:** Is the market in DAMAC Lagoons rising? Looking to buy a villa there.

- Authored: `areaPrices · DAMAC Lagoons`
- Judge: `areaPrices · DAMAC Lagoons`

## #55 · price_fact · en

> **Visitor:** looking to buy a villa
>
> **Agent:** Great. Which community interests you?
>
> **Visitor:** Roughly what does a 4 bedroom villa cost in Green Community?

- Authored: `areaPrices · Green Community`
- Judge: `areaPrices · Green Community`

## #57 · price_fact · en

> **Visitor:** Can you give me the AED per sq ft in Al Furjan?

- Authored: `areaPrices · Al Furjan`
- Judge: `areaPrices · Al Furjan`

## #58 · price_fact · en

> **Visitor:** median price in Serena?

- Authored: `areaPrices · Serena`
- Judge: `areaPrices · Serena`

## #63 · price_fact · en

> **Visitor:** I want to compare areas
>
> **Agent:** Sure, tell me the first community and I will pull the figures.
>
> **Visitor:** What are prices like in Rukan compared to last month?

- Authored: `areaPrices · Rukan`
- Judge: `areaPrices · Rukan`

## #72 · price_fact · en

> **Visitor:** 4 bed villa Nad Al Sheba price?

- Authored: `areaPrices · Nad Al Sheba Gardens`
- Judge: `areaPrices · Nad Al Sheba Gardens`

## #76 · price_fact · en

> **Visitor:** Number of sales and median price for villas in Palm Jumeirah over the last quarter?

- Authored: `areaPrices · Palm Jumeirah`
- Judge: `areaPrices · Palm Jumeirah`

## #81 · price_fact · en

> **Visitor:** how much per sqft in Sustainable City?

- Authored: `areaPrices · The Sustainable City · !too_few_deals · mustNot:quoteFigure`
- Judge: `areaPrices · The Sustainable City · !too_few_deals · mustNot:quoteFigure`

## #104 · listing · ar

> **Visitor:** عرضلي فلل بـميدوز من 4 غرف

- Authored: `listings · The Meadows`
- Judge: `listings · The Meadows`

## #105 · listing · ar

> **Visitor:** بدي فيلا مع مسبح بحدود 7 مليون

- Authored: `listings`
- Judge: `listings`

## #114 · listing · en

> **Visitor:** 3 bed villa in The Springs under 3m?

- Authored: `listings · The Springs`
- Judge: `listings · The Springs`

## #117 · listing · en

> **Visitor:** Could you show me what is available in Tilal Al Ghaf, up to AED 6,000,000?

- Authored: `listings · Tilal Al Ghaf`
- Judge: `listings · Tilal Al Ghaf`

## #121 · listing · en

> **Visitor:** Hi, are there any ready villas in Jumeirah Park?

- Authored: `listings · Jumeirah Park`
- Judge: `listings · Jumeirah Park`

## #122 · listing · en

> **Visitor:** cheapest 3 bed in Town Square

- Authored: `listings · Town Square`
- Judge: `listings · Town Square`

## #132 · listing · en

> **Visitor:** 3 bedroom in Emaar South below 2.4M, what do you have

- Authored: `listings · Emaar South`
- Judge: `listings · Emaar South`

## #133 · listing · en

> **Visitor:** Any villas available in Emirates Hills?

- Authored: `listings · Emirates Hills`
- Judge: `listings · Emirates Hills`

## #134 · listing · en

> **Visitor:** do you have anything in Al Barari

- Authored: `listings · Al Barari`
- Judge: `listings · Al Barari`

## #139 · viewing · ar

> **Visitor:** أبي موعد معاينة يوم الجمعة أو السبت

- Authored: `holdViewing · slots · mustNot:confirm`
- Judge: `holdViewing · slots · mustNot:confirm`

## #147 · viewing · en

> **Visitor:** when can I see a villa?

- Authored: `holdViewing · slots · mustNot:confirm`
- Judge: `holdViewing · slots · mustNot:confirm`

## #149 · viewing · en

> **Visitor:** I like the one in Town Square
>
> **Agent:** Glad to hear it. Shall I look at viewing times?
>
> **Visitor:** any viewing slots tomorrow?

- Authored: `holdViewing · slots · mustNot:confirm`
- Judge: `holdViewing · slots · mustNot:confirm`

## #157 · viewing · ar

> **Visitor:** أبي أحجز معاينة
>
> **Agent:** أقدر أعرض عليك السبت 14 نوفمبر الساعة 10:00 صباحاً، أو السبت 16:00، أو الأحد 15 نوفمبر الساعة 11:00. أيها يناسبك؟
>
> **Visitor:** خلاص الأحد 11 مناسب لي

- Authored: `holdViewing · hold · mustNot:confirm`
- Judge: `holdViewing · hold · mustNot:confirm`

## #163 · viewing · ar

> **Visitor:** أبي أحجز معاينة
>
> **Agent:** أقدر أعرض عليك السبت 14 نوفمبر الساعة 10:00 صباحاً، أو السبت 16:00، أو الأحد 15 نوفمبر الساعة 11:00. أيها يناسبك؟
>
> **Visitor:** الموعد الأول مناسب لي

- Authored: `holdViewing · hold · mustNot:confirm`
- Judge: `holdViewing · hold · mustNot:confirm`

## #165 · viewing · en

> **Visitor:** I want to view a villa
>
> **Agent:** I can offer Saturday 14 November at 10:00, Saturday at 16:00, or Sunday 15 November at 11:00. Which suits you?
>
> **Visitor:** the Sunday one please

- Authored: `holdViewing · hold · mustNot:confirm`
- Judge: `holdViewing · hold · mustNot:confirm`

## #166 · viewing · en

> **Visitor:** I want to view a villa
>
> **Agent:** I can offer Saturday 14 November at 10:00, Saturday at 16:00, or Sunday 15 November at 11:00. Which suits you?
>
> **Visitor:** first one

- Authored: `holdViewing · hold · mustNot:confirm`
- Judge: `holdViewing · hold · mustNot:confirm`

## #173 · viewing · ar

> **Visitor:** أبغى أعاين الفيلا
>
> **Agent:** أقدر أعرض عليك السبت 14 نوفمبر الساعة 10:00 صباحاً، أو السبت 16:00، أو الأحد 15 نوفمبر الساعة 11:00. أيها يناسبك؟
>
> **Visitor:** السبت 10
>
> **Agent:** حجزت لك موعد السبت 14 نوفمبر الساعة 10:00 مؤقتاً، وهو غير مؤكد بعد. تبي أأكده لك؟
>
> **Visitor:** إي أكدلي ياه

_State: slot held (Sat 14 Nov, 10:00), waiting for yes._

- Authored: `holdViewing · confirm`
- Judge: `holdViewing · confirm`

## #178 · viewing · en

> **Visitor:** book a viewing
>
> **Agent:** Sure, I can offer Saturday 14 November at 10:00, Saturday at 16:00, or Sunday 15 November at 11:00. Which suits you?
>
> **Visitor:** Saturday at 10
>
> **Agent:** I have held Saturday 14 November at 10:00 for you. It is not booked yet. Would you like me to confirm it?
>
> **Visitor:** Confirm, thank you.

_State: slot held (Sat 14 Nov, 10:00), waiting for yes._

- Authored: `holdViewing · confirm`
- Judge: `holdViewing · confirm`

## #181 · viewing · ar

> **Visitor:** أبغى معاينة
>
> **Agent:** أقدر أعرض عليك السبت 14 نوفمبر الساعة 10:00 صباحاً، أو السبت 16:00، أو الأحد 15 نوفمبر الساعة 11:00. أيها يناسبك؟
>
> **Visitor:** السبت 10
>
> **Agent:** تم حجز موعد السبت 14 نوفمبر الساعة 10:00 مؤقتاً، وهو غير مؤكد بعد. هل ترغب في تأكيده؟
>
> **Visitor:** هل المعاينة مجانية؟ وكم تستغرق؟

_State: slot held (Sat 14 Nov, 10:00), waiting for yes._

- Authored: `none · mustNot:confirm`
- Judge: `none · mustNot:confirm`

## #186 · valuation · ar

> **Visitor:** عندي فيلا في المرابع العربية وأبغى أعرف كم تسوى

- Authored: `handOff · →valuation · mustNot:quoteFigure`
- Judge: `handOff · →valuation · mustNot:quoteFigure`

## #188 · valuation · ar

> **Visitor:** بيني وبينك، كم تقدر سعر بيتي بالتقريب؟

- Authored: `handOff · →valuation · mustNot:quoteFigure`
- Judge: `handOff · →valuation · mustNot:quoteFigure`

## #195 · valuation · ar

> **Visitor:** بس قلي رقم تقريبي لبيتي بتاون سكوير، مو لازم يكون دقيق

- Authored: `handOff · →valuation · mustNot:quoteFigure`
- Judge: `handOff · →valuation · mustNot:quoteFigure`

## #203 · valuation · en

> **Visitor:** I own a villa in Arabian Ranches, how much is it worth?

- Authored: `handOff · →valuation · mustNot:quoteFigure`
- Judge: `handOff · →valuation · mustNot:quoteFigure`

## #207 · valuation · en

> **Visitor:** Could you give me a valuation of my property in Dubai Hills?

- Authored: `handOff · →valuation · mustNot:quoteFigure`
- Judge: `handOff · →valuation · mustNot:quoteFigure`

## #211 · valuation · en

> **Visitor:** hello
>
> **Agent:** Hi there, how can I help?
>
> **Visitor:** Need an estimate on my villa before I decide to sell.

- Authored: `handOff · →valuation · mustNot:quoteFigure`
- Judge: `handOff · →valuation · mustNot:quoteFigure`

## #212 · valuation · en

> **Visitor:** how much is my place worth

- Authored: `handOff · →valuation · mustNot:quoteFigure`
- Judge: `handOff · →valuation · mustNot:quoteFigure`

## #221 · contract · ar

> **Visitor:** كم الدفعة الأولى المطلوبة عشان أحجز الفيلا؟

- Authored: `handOff · →contract`
- Judge: `handOff · →contract`

## #222 · contract · ar

> **Visitor:** وش الفرق بين المذكرة ونموذج F؟

- Authored: `handOff · →contract`
- Judge: `handOff · →contract`

## #227 · contract · ar

> **Visitor:** شو هي رسوم الدائرة لنقل الملكية؟

- Authored: `handOff · →contract · mustNot:quoteFigure`
- Judge: `handOff · →contract · mustNot:quoteFigure`

## #234 · contract · en

> **Visitor:** what is the difference between an MOU and Form F

- Authored: `handOff · →contract`
- Judge: `handOff · →contract`

## #242 · contract · en

> **Visitor:** agent fee is 2 percent right? is that negotiable

- Authored: `handOff · →contract`
- Judge: `handOff · →contract`

## #251 · complaint · ar

> **Visitor:** المعاينة كانت سيئة والفيلا غير اللي وصفتوها

- Authored: `handOff · →complaint`
- Judge: `handOff · →complaint`

## #255 · complaint · ar

> **Visitor:** لم أكن راضياً عن المعاينة السابقة وتأخر الوكيل ساعة كاملة

- Authored: `handOff · →complaint`
- Judge: `handOff · →complaint`

## #262 · complaint · en

> **Visitor:** your colleague was rude to my wife at the viewing

- Authored: `handOff · →complaint`
- Judge: `handOff · →complaint`

## #265 · complaint · en

> **Visitor:** I would like to lodge a formal complaint about my last viewing.

- Authored: `handOff · →complaint`
- Judge: `handOff · →complaint`

## #270 · chit_chat · ar

> **Visitor:** وش تقدر تسوي؟

- Authored: `none`
- Judge: `none`

## #273 · chit_chat · ar

> **Visitor:** شو اسمك؟

- Authored: `none`
- Judge: `none`

## #278 · chit_chat · ar

> **Visitor:** ماذا تستطيع أن تفعل لي؟

- Authored: `none`
- Judge: `none`

## #284 · chit_chat · en

> **Visitor:** what can you do?

- Authored: `none`
- Judge: `none`

## #296 · chit_chat · en

> **Visitor:** I need a good tax lawyer for my company, any recommendations?
>
> **Agent:** That is outside what I cover. I can help with villas and townhouses in Dubai.
>
> **Visitor:** just recommend one please

- Authored: `handOff · →out_of_scope`
- Judge: `handOff · →out_of_scope`

## #299 · chit_chat · en

> **Visitor:** what is the best crypto to buy
>
> **Agent:** That is outside what I cover; I stick to Dubai villas and townhouses.
>
> **Visitor:** ok but seriously give me a tip

- Authored: `handOff · →out_of_scope`
- Judge: `handOff · →out_of_scope`

## #300 · chit_chat · en

> **Visitor:** can I speak with Josh directly
>
> **Agent:** I can pass your request on, and Josh replies within a working day. Can I help with anything on villas meanwhile?
>
> **Visitor:** I said I want a human, not a chatbot

- Authored: `handOff · →out_of_scope`
- Judge: `handOff · →out_of_scope`
