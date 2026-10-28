"""Server configuration, read from the environment on every call so tests can change it.

Every integration is optional: a missing key switches that integration off instead of crashing the app.
"""
from __future__ import annotations

import os
from types import SimpleNamespace as NS


def _s(k: str, d: str = "") -> str:
    return (os.environ.get(k) if os.environ.get(k) is not None else d).strip()


def _n(k: str, d: float):
    v = os.environ.get(k)
    if v is None or v.strip() == "":
        return d
    try:
        x = float(v)
    except ValueError:
        return d
    return int(x) if x == int(x) else x


def _list(k: str, d: str) -> list[str]:
    return [x.strip() for x in _s(k, d).split(",") if x.strip()]


def _keys(name: str) -> list[str]:
    """API keys from KEY and KEYS (comma separated), de-duplicated, so free-tier keys can be pooled and rotated."""
    out: list[str] = []
    for part in (os.environ.get(name, "") + "," + os.environ.get(name + "S", "")).split(","):
        p = part.strip()
        if p and p not in out:
            out.append(p)
    return out


def env() -> NS:
    prod = os.environ.get("WLXC_ENV", os.environ.get("NODE_ENV", "")) == "production"
    return NS(
        prod=prod,
        app_url=_s("APP_URL", "http://localhost:3000").rstrip("/"),
        session_secret=_s("SESSION_SECRET"),
        cron_secret=_s("CRON_SECRET"),
        database_url=_s("DATABASE_URL"),
        sqlite_path=_s("SQLITE_PATH", ""),
        trust_proxy=_s("TRUST_PROXY", "1") != "0",
        azure=NS(
            endpoint=_s("AZURE_OPENAI_ENDPOINT").rstrip("/"),
            key=_s("AZURE_OPENAI_API_KEY"),
            deployment=_s("AZURE_OPENAI_DEPLOYMENT"),
            embed_deployment=_s("AZURE_OPENAI_EMBED_DEPLOYMENT"),
            api_version=_s("AZURE_OPENAI_API_VERSION", "2024-10-21"),
            image_deployment=_s("AZURE_OPENAI_IMAGE_DEPLOYMENT"),
            image_api_version=_s("AZURE_OPENAI_IMAGE_API_VERSION", "2025-04-01-preview"),
        ),
        cf=NS(
            account_id=_s("CF_ACCOUNT_ID"),
            token=_s("CF_API_TOKEN"),
            text_models=_list("CF_TEXT_MODEL", "@cf/meta/llama-3.3-70b-instruct-fp8-fast,@cf/mistralai/mistral-small-3.1-24b-instruct"),
            image_models=_list(
                "CF_IMAGE_MODELS",
                "@cf/black-forest-labs/flux-1-schnell,@cf/bytedance/stable-diffusion-xl-lightning",
            ),
        ),
        compat=NS(
            base_url=_s("COMPAT_LLM_BASE_URL").rstrip("/"),
            key=_s("COMPAT_LLM_API_KEY"),
            model=_s("COMPAT_LLM_MODEL"),
        ),
        hf=NS(
            token=_s("HF_TOKEN"),
            base=_s("HF_API_BASE", "https://router.huggingface.co/hf-inference/models").rstrip("/"),
            image_models=_list("HF_IMAGE_MODELS", "black-forest-labs/FLUX.1-schnell"),
        ),
        pollinations=_s("POLLINATIONS_ENABLED", "1") != "0",
        # LLM_MODE picks the default order when LLM_ORDER is not set: "hybrid" tries the paid providers first and falls back to
        # the free ones, "free" uses only free tiers and a local model, "paid" uses only the paid providers.
        llm_order=_list("LLM_ORDER", {
            "free": "cloudflare,gemini,groq,mistral,openrouter,ollama,compat",
            "paid": "azure,openai,bedrock,compat",
        }.get(_s("LLM_MODE", "hybrid").lower(), "azure,openai,bedrock,cloudflare,gemini,groq,mistral,openrouter,ollama,compat")),
        aws=NS(
            region=_s("AWS_REGION", "us-east-1"),
            access_key=_s("AWS_ACCESS_KEY_ID"),
            secret=_s("AWS_SECRET_ACCESS_KEY"),
            session_token=_s("AWS_SESSION_TOKEN"),
            bearer=_s("AWS_BEARER_TOKEN_BEDROCK"),
            models=_list("BEDROCK_MODEL", "amazon.nova-lite-v1:0"),
        ),
        ollama=NS(
            base=_s("OLLAMA_BASE_URL", "http://localhost:11434/v1").rstrip("/"),
            models=_list("OLLAMA_MODEL", ""),
        ),
        llm=NS(
            openai=NS(
                base=_s("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
                embed_model=_s("OPENAI_EMBED_MODEL", "text-embedding-3-small"),
                image_model=_s("OPENAI_IMAGE_MODEL", "gpt-image-1"),
                keys=_keys("OPENAI_API_KEY"),
                models=_list("OPENAI_MODEL", "gpt-4o-mini"),
            ),
            gemini=NS(
                base="https://generativelanguage.googleapis.com/v1beta/openai",
                keys=_keys("GEMINI_API_KEY") + _keys("GOOGLE_API_KEY"),
                models=_list("GEMINI_MODEL", "gemini-flash-latest"),
                image_model=_s("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image"),
            ),
            groq=NS(
                base="https://api.groq.com/openai/v1",
                keys=_keys("GROQ_API_KEY"),
                models=_list("GROQ_MODEL", "llama-3.3-70b-versatile,llama-3.1-8b-instant"),
            ),
            mistral=NS(
                base="https://api.mistral.ai/v1",
                keys=_keys("MISTRAL_API_KEY"),
                models=_list("MISTRAL_MODEL", "mistral-small-latest"),
            ),
            openrouter=NS(
                base="https://openrouter.ai/api/v1",
                keys=_keys("OPENROUTER_API_KEY"),
                models=_list("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free"),
            ),
        ),
        image_order=_list("IMAGE_ORDER", "azure,openai,gemini,cloudflare,huggingface,pollinations"),
        razorpay=NS(
            key_id=_s("RAZORPAY_KEY_ID"),
            key_secret=_s("RAZORPAY_KEY_SECRET"),
            webhook_secret=_s("RAZORPAY_WEBHOOK_SECRET"),
        ),
        paypal=NS(client_id=_s("PAYPAL_CLIENT_ID"), client_secret=_s("PAYPAL_CLIENT_SECRET"), webhook_id=_s("PAYPAL_WEBHOOK_ID"), live=_s("PAYPAL_ENV", "sandbox") == "live"),
        price=NS(
            learner_month=_n("PRICE_LEARNER_MONTH_INR", 99),
            learner_year=_n("PRICE_LEARNER_YEAR_INR", 799),
            plus_month=_n("PRICE_PLUS_MONTH_INR", 179),
            plus_year=_n("PRICE_PLUS_YEAR_INR", 1499),
            classroom_month=_n("PRICE_CLASSROOM_MONTH_INR", 0),
            classroom_year=_n("PRICE_CLASSROOM_YEAR_INR", 0),
            unit_notes=_n("PRICE_ADDON_UNIT_NOTES_INR", 29),
            monthly_notes=_n("PRICE_ADDON_MONTHLY_NOTES_INR", 99),
            pack_month=_n("PRICE_ADDON_PACK_MONTH_INR", 129),
            noads_month=_n("PRICE_ADDON_NOADS_MONTH_INR", 29),
            chatbot_month=_n("PRICE_ADDON_CHATBOT_MONTH_INR", 59),
        ),
        whatsapp=NS(
            support_number="".join(c for c in _s("WHATSAPP_SUPPORT_NUMBER") if c.isdigit()),
            token=_s("WHATSAPP_TOKEN"),
            phone_id=_s("WHATSAPP_PHONE_ID"),
            ops_to="".join(c for c in _s("WHATSAPP_OPS_TO") if c.isdigit()),
            verify_token=_s("WHATSAPP_VERIFY_TOKEN"),
            public_link=_s("WHATSAPP_PUBLIC_LINK", "0") == "1",
            app_secret=_s("WHATSAPP_APP_SECRET"),
        ),
        n8n=NS(webhook_url=_s("N8N_WEBHOOK_URL"), secret=_s("N8N_SHARED_SECRET")),
        mail=NS(
            domain=_s("MAIL_DOMAIN", "worklabxc.com"),
            from_=_s("MAIL_FROM", "WorkLab XC <hello@worklabxc.com>"),
            noreply=_s("MAIL_NOREPLY", "WorkLab XC <noreply@worklabxc.com>"),
            support=_s("SUPPORT_EMAIL", "support@worklabxc.com"),
            updates=_s("MAIL_UPDATES", "WorkLab XC <hello@worklabxc.com>"),
            order=_list("MAIL_ORDER", "resend,brevo,mailgun,smtp"),
            resend_key=_s("RESEND_API_KEY"),
            brevo_key=_s("BREVO_API_KEY"),
            mailgun_key=_s("MAILGUN_API_KEY"),
            mailgun_domain=_s("MAILGUN_DOMAIN"),
            mailgun_region=_s("MAILGUN_REGION", "us"),
            smtp_url=_s("SMTP_URL"),
        ),
        abuse=NS(
            auto_block_hits=_n("AUTO_BLOCK_HITS_PER_HOUR", 20),
            signups_per_ip_day=_n("SIGNUPS_PER_IP_DAY", 5),
            require_consent=_s("REQUIRE_CONSENT", "1") != "0",
            require_profile=_s("REQUIRE_SIGNUP_PROFILE", "1") != "0",
            require_username=_s("REQUIRE_USERNAME", "1") != "0",
        ),
        ipintel=NS(
            provider=_s("IPINTEL_PROVIDER", "ipapi"),
            key=_s("IPINTEL_KEY"),
            policy=_s("VPN_POLICY", "generation"),
            fail_closed=_s("IPINTEL_FAIL", "open") == "closed",
            allowlist=_list("IP_ALLOWLIST", ""),
            paid_exempt=_s("VPN_PAID_EXEMPT", "1") != "0",
            cache_hours=_n("IPINTEL_CACHE_HOURS", 24),
        ),
        backup=NS(
            daily=_s("BACKUP_DAILY", "0") == "1",
            dir=_s("BACKUP_DIR"),
            keep=int(_n("BACKUP_KEEP", 14)),
            passphrase=_s("BACKUP_PASSPHRASE"),
            s3_endpoint=_s("BACKUP_S3_ENDPOINT").rstrip("/"),
            s3_bucket=_s("BACKUP_S3_BUCKET"),
            s3_region=_s("BACKUP_S3_REGION", "auto"),
            s3_access=_s("BACKUP_S3_ACCESS_KEY"),
            s3_secret=_s("BACKUP_S3_SECRET_KEY"),
            s3_prefix=_s("BACKUP_S3_PREFIX", "worklabxc"),
        ),
        alerts=NS(webhook=_s("ALERT_WEBHOOK_URL"), cooldown_min=_n("ALERT_COOLDOWN_MIN", 15), slow_ms=_n("ALERT_SLOW_MS", 8000)),
        gst=NS(
            enabled=_s("GST_ENABLED", "1") != "0",
            seller_name=_s("SELLER_LEGAL_NAME", "WorkLab XC"),
            seller_gstin=_s("SELLER_GSTIN"),
            seller_address=_s("SELLER_ADDRESS", ""),
            seller_state=_s("SELLER_STATE_CODE", "07"),  # 2-digit GST state code; 07 = Delhi
            rate=_n("GST_RATE_PERCENT", 18),
            inclusive=_s("PRICES_INCLUDE_GST", "1") != "0",
            sac=_s("SAC_CODE", "998439"),
            prefix=_s("INVOICE_PREFIX", "WLXC"),
        ),
        fraud=NS(
            block_disposable=_s("BLOCK_DISPOSABLE_EMAIL", "1") != "0",
            disposable_extra=[x.lower() for x in _list("DISPOSABLE_DOMAINS_EXTRA", "")],
            device_max_accounts=_n("DEVICE_MAX_ACCOUNTS", 3),
            country_allow=[x.upper() for x in _list("COUNTRY_ALLOW", "")],
            country_block=[x.upper() for x in _list("COUNTRY_BLOCK", "")],
            country_fail_closed=_s("COUNTRY_FAIL", "open") == "closed",
            phone_mode=_s("PHONE_VERIFY", "off"),  # off | generation (before AI features) | signup (before anything but reading)
            phone_exempt_paid=_s("PHONE_EXEMPT_PAID", "0") == "1",
            default_cc=_s("PHONE_DEFAULT_COUNTRY_CODE", "91"),
            sms_provider=_s("SMS_PROVIDER", "none"),  # none | msg91 | twilio | console (dev only)
            msg91_key=_s("MSG91_AUTH_KEY"),
            msg91_template=_s("MSG91_TEMPLATE_ID"),
            twilio_sid=_s("TWILIO_ACCOUNT_SID"),
            twilio_token=_s("TWILIO_AUTH_TOKEN"),
            twilio_from=_s("TWILIO_FROM"),
        ),
        addons=NS(
            monthly_notes_units=_n("ADDON_MONTHLY_NOTES_UNITS", 1_000_000),  # the monthly notes plan is unlimited in practice
            chat_per_day=_n("CHAT_MESSAGES_PER_DAY", 40),
            free_chat_per_month=_n("FREE_CHAT_PER_MONTH", 2),
            free_notes_per_month=_n("FREE_NOTES_PER_MONTH", 2),
        ),
        fair_global_heavy=_n("FAIR_GLOBAL_HEAVY", 60),
        google_client_id=_s("GOOGLE_CLIENT_ID"),
        admin_emails=[x.lower() for x in _list("ADMIN_EMAILS", "")],
        dev_emails=[x.lower() for x in _list("DEV_EMAILS", "")],
        turnstile_secret=_s("TURNSTILE_SECRET"),
        max_upload_bytes=_n("MAX_UPLOAD_BYTES", 8 * 1024 * 1024),
        job_budget_ms=_n("JOB_BUDGET_MS", 45_000),
        quota_tz_offset_min=_n("QUOTA_TZ_OFFSET_MIN", 330),
        worker_mode=_s("WORKER_MODE", "inline"),
        inprocess_tick_sec=_n("INPROCESS_TICK_SEC", 60),
        community_banned=_s("COMMUNITY_BANNED_WORDS", ""),
        feedback_grace_sessions=_n("FEEDBACK_GRACE_SESSIONS", 0),
    )


def session_secret() -> str:
    e = env()
    if len(e.session_secret) >= 32:
        return e.session_secret
    if e.prod:
        raise RuntimeError("SESSION_SECRET must be set to at least 32 characters.")
    return "dev-only-secret-dev-only-secret-dev-only"


def integrations() -> NS:
    e = env()
    return NS(
        azure=bool(e.azure.endpoint and e.azure.key and e.azure.deployment),
        openai=bool(e.llm.openai.keys),
        gemini=bool(e.llm.gemini.keys),
        groq=bool(e.llm.groq.keys),
        mistral=bool(e.llm.mistral.keys),
        openrouter=bool(e.llm.openrouter.keys),
        cloudflare=bool(e.cf.account_id and e.cf.token),
        compat=bool(e.compat.base_url and e.compat.model),
        bedrock=bool(e.aws.models and (e.aws.bearer or (e.aws.access_key and e.aws.secret))),
        ollama=bool(e.ollama.models),
        huggingface=bool(e.hf.token),
        sms=e.fraud.sms_provider in ("msg91", "twilio") and bool((e.fraud.msg91_key and e.fraud.msg91_template) or (e.fraud.twilio_sid and e.fraud.twilio_token and e.fraud.twilio_from)),
        razorpay=bool(e.razorpay.key_id and e.razorpay.key_secret),
        paypal=bool(e.paypal.client_id and e.paypal.client_secret),
        n8n=bool(e.n8n.webhook_url),
        whatsapp_link=bool(e.whatsapp.support_number),
        whatsapp_api=bool(e.whatsapp.token and e.whatsapp.phone_id and e.whatsapp.ops_to),
        turnstile=bool(e.turnstile_secret),
        mail=bool(
            e.mail.resend_key
            or e.mail.brevo_key
            or (e.mail.mailgun_key and e.mail.mailgun_domain)
            or e.mail.smtp_url
        ),
        database=bool(e.database_url),
    )
