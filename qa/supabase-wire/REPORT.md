DEMO_URL=http://127.0.0.1:48740
MOBILE_SHOTS=qa/supabase-wire/m390-subscribe.png,qa/supabase-wire/m390-article-inline.png,qa/supabase-wire/m390-article.png (pending WeChat empty-state)
CONFIRM=Anthreed UI polish live (no book logo, no 我的订阅, inline body, Playfair Display Italic)
SUPABASE_STATUS=wired
MIGRATE_COUNT=34
BODY_INGEST=33/34 articles have extracted content in Supabase; 1 WeChat page pending (null content → UI 正文尚未同步)
PROJECT_NOTE=Original .env project ref was API-reachable but dashboard account had no access (403). Created accessible project anthreed under org 1psum, applied schema, migrated data, updated .env (DATA_PROVIDER=supabase). Keys only in .env mode 600.
NETWORK=Vite --host 0.0.0.0 --port 48740
