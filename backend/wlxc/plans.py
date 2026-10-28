"""Plans, limits and prices. Edit LIMITS to change what each plan allows."""
from __future__ import annotations

import copy

from .config import env, integrations

# "unlimited" learning sessions: a cap high enough that nobody reaches it (the apps show it as Unlimited)
UNLIMITED = 9999

LIMITS: dict[str, dict] = {
    # classroomPerMonth: how many different topics a plan without the full 3D classroom may open in it each month
    "prototype": dict(classroom=False, classroomPerMonth=1, concurrent=1, ads=True, examsPerDay=0, jobsPerDay=2, topicsPerJob=5, candidates=1, imagesPerDay=0, watermark=True, maxSyllabusChars=15_000,
                      pdfDocx=False, customInstructions=False, libraryItems=25, sessionGapHours=0, sessionsPerDay=UNLIMITED, genPerDay=6, voiceCharsPerDay=4_000,
                      games=False, quizzes=False, maxCourses=1, pptx=False),
    "learner": dict(classroom=True, classroomPerMonth=0, concurrent=2, ads=False, examsPerDay=12, jobsPerDay=20, topicsPerJob=25, candidates=2, imagesPerDay=8, watermark=False, maxSyllabusChars=60_000,
                    pdfDocx=True, customInstructions=True, libraryItems=500, sessionGapHours=0, sessionsPerDay=UNLIMITED, genPerDay=60, voiceCharsPerDay=60_000,
                    games=True, quizzes=True, maxCourses=50, pptx=False),
    "classroom": dict(classroom=True, classroomPerMonth=0, concurrent=3, ads=False, examsPerDay=40, jobsPerDay=100, topicsPerJob=40, candidates=3, imagesPerDay=25, watermark=False, maxSyllabusChars=120_000,
                      pdfDocx=True, customInstructions=True, libraryItems=3000, sessionGapHours=0, sessionsPerDay=UNLIMITED, genPerDay=200, voiceCharsPerDay=200_000,
                      games=True, quizzes=True, maxCourses=50, pptx=False),
}


def price_inr(plan: str, billing: str):
    p = env().price
    v = {"learner": (p.learner_month, p.learner_year), "plus": (p.plus_month, p.plus_year), "classroom": (p.classroom_month, p.classroom_year)}.get(plan, (0, 0))[0 if billing == "month" else 1]
    return v if v > 0 else None


def period_days(billing: str) -> int:
    return 30 if billing == "month" else 365


# Three public plans: Free (with ads), Beta (paid, the 3D classroom) and Beta Plus (Beta plus the Study pack at one lower price).
# "learner" is Beta's internal id; "plus" is bought as a Beta plan with the Study pack add-on switched on with it.
DEFAULT_PLANS = [
    {"id": "prototype", "name": "Free", "tagline": "Learn one subject, with ads.", "status": "available", "price": 0, "yearly": None,
     "priceLabel": "Free", "icon": "flask",
     "items": ["Unlimited learning sessions", "One subject at a time", "Text and Markdown syllabi", "AI-written lesson for every topic",
               "Ads while you learn, including video ads", "No games, quizzes or practice exams",
               "Each month: 1 classroom session, 2 tutor questions, 2 unit notes"],
     "cta": {"label": "Get started", "action": "start"}},
    {"id": "learner", "name": "Beta", "tagline": "Everything, including the 3D classroom.", "status": "planned", "price": None, "yearly": None,
     "badge": "Paid", "icon": "cube", "inherits": "Everything in Free, plus",
     "items": ["Unlimited 3D classroom sessions", "No ads", "Unlimited subjects", "Games and quizzes", "Practice exams with timed window and handwritten-sheet marking",
               "PDF and Word syllabi", "AI illustrations", "2 tutor questions and 2 unit notes every month"],
     "cta": {"label": "Notify me", "action": "contact", "topic": "beta"}},
    {"id": "plus", "name": "Beta Plus", "tagline": "Beta and the Study pack, at one lower price.", "status": "planned", "price": None, "yearly": None,
     "featured": True, "badge": "Best value", "icon": "sparkles", "inherits": "Everything in Beta, plus",
     "items": ["AI class chat: ask in any lesson or classroom", "Unlimited unit notes by marks", "4 support sessions a month"],
     "cta": {"label": "Notify me", "action": "contact", "topic": "plus"}},
]

DEFAULT_COMPARE = [
    {"label": "Learning sessions", "values": {"prototype": "Unlimited", "learner": "Unlimited", "plus": "Unlimited"}},
    {"label": "Subjects (courses)", "values": {"prototype": "1", "learner": "Unlimited", "plus": "Unlimited"}},
    {"label": "Ads while you learn", "values": {"prototype": "Yes, incl. video", "learner": "None", "plus": "None"}},
    {"label": "3D classroom", "values": {"prototype": "1 session a month", "learner": "Unlimited", "plus": "Unlimited"}},
    {"label": "Games and quizzes", "values": {"prototype": False, "learner": True, "plus": True}},
    {"label": "Practice exams and handwritten marking", "values": {"prototype": False, "learner": True, "plus": True}},
    {"label": "Text and Markdown syllabi", "values": {"prototype": True, "learner": True, "plus": True}},
    {"label": "PDF and Word syllabi", "values": {"prototype": False, "learner": True, "plus": True}},
    {"label": "AI class chat (tutor)", "values": {"prototype": "2 a month", "learner": "2 a month", "plus": "Unlimited"}},
    {"label": "Unit notes by marks", "values": {"prototype": "2 a month", "learner": "2 a month", "plus": "Unlimited"}},
    {"label": "Support sessions a month", "values": {"prototype": "1", "learner": "4", "plus": "4"}},
]


def server_plans(country: str = "IN") -> dict:
    pay = integrations().razorpay
    from . import addons as ad, pricing
    reg = pricing.region(country)

    plans = []
    for p in copy.deepcopy(DEFAULT_PLANS):
        if p["id"] in ("learner", "plus"):
            m, y = pricing.plan_amount(country, p["id"], "month"), pricing.plan_amount(country, p["id"], "year")
            if m:
                # always on sale: if the payment provider is not set up yet, checkout says so plainly instead of hiding the plan
                p.update(status="live", price=m, yearly=y)
                p["cta"] = {"label": "Buy", "action": "checkout"}
                if y and y < m * 12:
                    p["yearlySavePct"] = round((m * 12 - y) / (m * 12) * 100)
                    p["yearlySaveInr"] = round(m * 12 - y, 2)
            if p["id"] == "plus" and m:
                # what Beta and the Study pack cost bought separately, and what the combined plan saves each month
                sep = (pricing.plan_amount(country, "learner", "month") or 0) + (pricing.sku_amount(country, "pack") or 0)
                if sep > m:
                    p.update(listPrice=sep, savePct=round((sep - m) / sep * 100), saveInr=round(sep - m, 2))
        plans.append(p)
    extras = [{"sku": s, "name": ad.SKU_INFO[s]["name"], "description": ad.SKU_INFO[s]["description"], **ad.pricing(s, country)} for s in ad.SKUS if pricing.sku_amount(country, s)]
    return {"plans": plans, "compare": list(DEFAULT_COMPARE), "addons": extras, "paymentsOn": bool(pay) or integrations().paypal, "currency": reg["currency"], "symbol": reg["symbol"],
            "country": reg["country"], "countryName": __import__("wlxc.geo", fromlist=["COUNTRIES"]).COUNTRIES.get(reg["country"], ("", 0, 0))[0], "tier": reg["tier"]}
