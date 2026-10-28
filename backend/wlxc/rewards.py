"""Practice rewards: points that double with every right answer in a row, a daily streak, hearts for the free plan, gems that can
be spent on extras, and a weekly leaderboard. Everything is worked out on the server from answers it has marked itself, so a
score cannot be made up in the browser. Hearts and gems do not touch the lessons: a learner who runs out of hearts can still read
and ask; they only stop the practice round until the hearts come back or are refilled.

How it works, in plain terms:
- a right answer is worth 10 points, then 20, 40, 80 and 160 for each right answer in a row; a wrong answer starts again at 10
- the streak grows each day the learner earns at least DAILY_GOAL points; a missed day is covered by a streak freeze if they have one
- the free plan has 5 hearts, loses one on a wrong answer in a practice round, and gets one back every 25 minutes; paid plans have no limit
- a right answer gives 1 gem; reaching the daily goal gives 3; a perfect round gives 3 more; gems buy refills, freezes and extras
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from .auth import effective_plan
from .crypto import sha256
from .errors import ApiError
from .store import get_store

COLL = "rewards"
BASE_XP = 10
COMBO_CAP = 4  # 10, 20, 40, 80, 160
COMBO_IDLE_MS = 15 * 60_000
DAILY_GOAL = 30
MAX_HEARTS = 5
HEART_MS = 25 * 60_000
MAX_FREEZES = 2
SHOP = {
    "heart": {"name": "Refill hearts", "cost": 10, "note": "Back to 5 hearts so you can keep practising now."},
    "freeze": {"name": "Streak freeze", "cost": 20, "note": "Covers one missed day. You can hold 2."},
    "chat": {"name": "Three more tutor questions", "cost": 15, "note": "Questions to the class tutor beyond this month's free ones.", "qty": 3},
    "notes": {"name": "One more set of unit notes", "cost": 25, "note": "Unit notes beyond this month's free ones."},
}
ADJ = ["Swift", "Bright", "Calm", "Bold", "Clever", "Keen", "Lucky", "Quiet", "Brave", "Sunny", "Witty", "Eager"]
ANI = ["Falcon", "Otter", "Panda", "Heron", "Lynx", "Koala", "Robin", "Fox", "Gecko", "Ibis", "Yak", "Newt"]


def _now() -> float:
    return time.time() * 1000


def _day(ms: float | None = None) -> str:
    return datetime.fromtimestamp((_now() if ms is None else ms) / 1000, timezone.utc).strftime("%Y-%m-%d")


def _week(ms: float | None = None) -> str:
    y, w, _ = datetime.fromtimestamp((_now() if ms is None else ms) / 1000, timezone.utc).isocalendar()
    return f"{y}-W{w:02d}"


def _goal(user: dict) -> int:
    """The learner's own daily goal in points, chosen at sign-up (casual 20, regular 30, serious 50, intense 80)."""
    from .profile import profile_of
    g = profile_of(user).get("dailyGoal", DAILY_GOAL)
    return g if g in (20, 30, 50, 80) else DAILY_GOAL


def _alias(uid: str) -> str:
    """The name shown on the leaderboard: the learner's own username when they have one, else a friendly made-up one."""
    try:
        from .profile import profile_of
        u = get_store().get("users", uid)
        if u and profile_of(u)["handle"]:
            return profile_of(u)["handle"]
    except Exception:  # noqa: BLE001
        pass
    h = int(sha256(uid)[:8], 16)
    return f"{ADJ[h % len(ADJ)]} {ANI[(h // 13) % len(ANI)]} {h % 90 + 10}"


def _fresh(uid: str) -> dict:
    return {"id": uid, "uid": uid, "xp": 0, "weekKey": _week(), "weekXp": 0, "days": {}, "streak": 0, "best": 0, "goalDay": "", "gems": 0, "hearts": MAX_HEARTS,
            "heartsAt": 0, "freezes": 0, "combo": 0, "comboAt": 0, "roundCorrect": 0, "roundTotal": 0, "alias": _alias(uid), "board": True, "bonus": {}, "tries": 0}


def _tidy(d: dict, unlimited: bool, now: float) -> dict:
    """Brings a saved record up to date: a new week, hearts that came back, a streak that was missed or covered by a freeze."""
    d = dict(d)
    if d["weekKey"] != _week(now):
        d["weekKey"], d["weekXp"] = _week(now), 0
    if not unlimited and d["hearts"] < MAX_HEARTS:
        back = int((now - d["heartsAt"]) // HEART_MS) if d["heartsAt"] else MAX_HEARTS
        if back > 0:
            d["hearts"] = min(MAX_HEARTS, d["hearts"] + back)
            d["heartsAt"] = now if d["hearts"] < MAX_HEARTS else 0
    today, yesterday = _day(now), _day(now - 86_400_000)
    if d["streak"] and d["goalDay"] not in (today, yesterday):
        gap = (datetime.strptime(today, "%Y-%m-%d") - datetime.strptime(d["goalDay"], "%Y-%m-%d")).days if d["goalDay"] else 99
        if gap == 2 and d["freezes"] > 0:
            d["freezes"] -= 1
            d["goalDay"] = yesterday  # the freeze stands in for the missed day
        else:
            d["streak"] = 0
    if now - d["comboAt"] > COMBO_IDLE_MS:
        d["combo"] = 0
    return d


def _unlimited(user: dict) -> bool:
    return effective_plan(user) != "prototype"


def _view(d: dict, user: dict) -> dict:
    now = _now()
    unl = _unlimited(user)
    d = _tidy(d, unl, now)
    today = d["days"].get(_day(now), 0)
    return {"xp": d["xp"], "level": 1 + int((d["xp"] / 60) ** 0.5), "weekXp": d["weekXp"], "streak": d["streak"], "best": d["best"],
            "goal": {"target": _goal(user), "today": today, "met": d["goalDay"] == _day(now)},
            "week": [{"day": _day(now - i * 86_400_000), "xp": d["days"].get(_day(now - i * 86_400_000), 0)} for i in range(6, -1, -1)],
            "gems": d["gems"], "hearts": {"n": MAX_HEARTS if unl else d["hearts"], "max": MAX_HEARTS, "unlimited": unl,
                                           "nextAt": None if unl or d["hearts"] >= MAX_HEARTS else d["heartsAt"] + HEART_MS},
            "freezes": d["freezes"], "combo": d["combo"], "alias": d["alias"], "board": d["board"], "bonus": d["bonus"]}


def get(user: dict) -> dict:
    uid = user["id"]
    d = get_store().get(COLL, uid) or _fresh(uid)
    return _view(d, user)


def on_answer(user: dict, ok: bool, kind: str = "drill") -> dict:
    """Scores one marked answer. Returns what to show: points gained, the multiplier, hearts left and any gems. Never raises."""
    out: dict = {}
    try:
        uid = user["id"]
        unl = _unlimited(user)

        def fn(c):
            now = _now()
            d = _tidy(c or _fresh(uid), unl, now)
            today = _day(now)
            gain = 0
            gems = 0
            if ok:
                mult = 2 ** min(d["combo"], COMBO_CAP)
                gain = BASE_XP * mult
                gems = 1
                d["combo"] += 1
                d["roundCorrect"] += 1
            else:
                mult = 1
                d["combo"] = 0
                if kind == "drill" and not unl and d["hearts"] > 0:
                    if d["hearts"] == MAX_HEARTS:
                        d["heartsAt"] = now
                    d["hearts"] -= 1
            d["roundTotal"] += 1
            d["comboAt"] = now
            before = d["days"].get(today, 0)
            d["days"] = {k: v for k, v in sorted({**d["days"], today: before + gain}.items())[-14:]}
            d["xp"] += gain
            d["weekXp"] += gain
            goal_hit = False
            if before < _goal(user) <= before + gain and d["goalDay"] != today:
                goal_hit = True
                d["streak"] = d["streak"] + 1 if d["goalDay"] == _day(now - 86_400_000) else 1
                d["best"] = max(d["best"], d["streak"])
                d["goalDay"] = today
                gems += 3
            d["gems"] += gems
            out.update({"xp": gain, "multiplier": mult, "combo": d["combo"], "gems": gems, "goalHit": goal_hit, "streak": d["streak"],
                        "hearts": MAX_HEARTS if unl else d["hearts"], "outOfHearts": (not unl) and kind == "drill" and d["hearts"] <= 0, "level": 1 + int((d["xp"] / 60) ** 0.5)})
            return d

        get_store().update(COLL, uid, fn)
    except Exception:  # noqa: BLE001  answering a question must never fail because the score could not be saved
        return {}
    return out


def complete_round(user: dict, correct: int, total: int) -> dict:
    """Bonus for finishing a round: a few points, and more for a perfect one. Capped by the answers the server actually marked."""
    uid = user["id"]
    unl = _unlimited(user)
    out: dict = {}

    def fn(c):
        now = _now()
        d = _tidy(c or _fresh(uid), unl, now)
        total_ok = min(total, d["roundTotal"])
        correct_ok = min(correct, d["roundCorrect"], total_ok)
        perfect = total_ok >= 5 and correct_ok == total_ok
        bonus = (5 if total_ok else 0) + (20 if perfect else 0)
        gems = 3 if perfect else 0
        today = _day(now)
        d["days"] = {k: v for k, v in sorted({**d["days"], today: d["days"].get(today, 0) + bonus}.items())[-14:]}
        d["xp"] += bonus
        d["weekXp"] += bonus
        d["gems"] += gems
        d["tries"] += 1
        d["roundCorrect"] = d["roundTotal"] = 0
        out.update({"bonusXp": bonus, "gems": gems, "perfect": perfect, "tries": d["tries"]})
        return d

    get_store().update(COLL, uid, fn)
    return out


def refill_hearts_wait(user: dict) -> dict:
    return get(user)


def league(user: dict, scope: str = "week", education: str = "", category: str = "") -> dict:
    """Everyone on the board, by weekly or all-time points, optionally narrowed to one kind of learner (school, college...) or one syllabus
    (CBSE, JEE...). Only the league name is shown, never a real name or email; people can opt out in their settings."""
    from .profile import profile_of
    st, allt = get_store(), scope == "all"
    key = "xp" if allt else "weekXp"
    where = None if allt else {"weekKey": _week()}
    rows = st.find(COLL, where=where, order_by=key, desc=True, limit=500)
    top = []
    for r in rows:
        mine_row = r["uid"] == user["id"]
        if (not r.get("board") and not mine_row) or (r[key] <= 0 and not mine_row):
            continue
        p = profile_of(st.get("users", r["uid"]) or {})
        if (education and p["education"] != education) or (category and p["category"] != category):
            if not mine_row:
                continue
            mine_hidden = True
        else:
            mine_hidden = False
        top.append({"alias": r["alias"], "xp": r[key], "streak": r.get("streak", 0), "you": mine_row, "level": 1 + int((r["xp"] / 60) ** 0.5),
                    "education": p["education"], "category": p["category"], "hidden": mine_hidden})
    shown = [t for t in top if not t["hidden"]]
    rank = next((i + 1 for i, r in enumerate(shown) if r["you"]), None)
    mine = st.get(COLL, user["id"]) or {}
    return {"week": _week(), "scope": "all" if allt else "week", "top": shown[:50], "total": len(shown), "rank": rank,
            "yours": mine.get("xp" if allt else "weekXp", 0), "listed": bool((mine or _fresh(user["id"]))["board"])}


def profile(user: dict, alias: str | None, board: bool | None) -> dict:
    uid = user["id"]

    def fn(c):
        d = c or _fresh(uid)
        if alias is not None:
            a = " ".join(alias.split())[:20]
            if len(a) < 3:
                raise ApiError(400, "bad_alias", "Pick a name of 3 to 20 letters or numbers.")
            d = {**d, "alias": a}
        if board is not None:
            d = {**d, "board": bool(board)}
        return d

    get_store().update(COLL, uid, fn)
    return get(user)


def buy(user: dict, item: str) -> dict:
    if item not in SHOP:
        raise ApiError(400, "bad_item", "That is not in the shop.")
    uid, cost = user["id"], SHOP[item]["cost"]
    unl = _unlimited(user)

    class _Poor(Exception):
        pass

    def fn(c):
        d = _tidy(c or _fresh(uid), unl, _now())
        if d["gems"] < cost:
            raise _Poor()
        if item == "heart":
            if unl or d["hearts"] >= MAX_HEARTS:
                raise ApiError(400, "not_needed", "Your hearts are already full.")
            d["hearts"], d["heartsAt"] = MAX_HEARTS, 0
        elif item == "freeze":
            if d["freezes"] >= MAX_FREEZES:
                raise ApiError(400, "not_needed", "You already hold the most freezes.")
            d["freezes"] += 1
        else:
            d["bonus"] = {**d["bonus"], item: d["bonus"].get(item, 0) + SHOP[item].get("qty", 1)}
        d["gems"] -= cost
        return d

    try:
        get_store().update(COLL, uid, fn)
    except _Poor:
        raise ApiError(402, "not_enough_gems", f"You need {cost} gems for that. Gems come from right answers in practice.") from None
    return get(user)


def use_bonus(uid: str, kind: str) -> bool:
    """Spends one earned extra (a tutor question or set of notes) when the month's free ones are used up."""
    got = {"ok": False}

    def fn(c):
        if c and c["bonus"].get(kind, 0) > 0:
            got["ok"] = True
            return {**c, "bonus": {**c["bonus"], kind: c["bonus"][kind] - 1}}
        return c

    get_store().update(COLL, uid, fn)
    return got["ok"]


def refund_bonus(uid: str, kind: str) -> None:
    get_store().update(COLL, uid, lambda c: {**c, "bonus": {**c["bonus"], kind: c["bonus"].get(kind, 0) + 1}} if c else c)
