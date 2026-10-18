-- ================================================
-- 数据库迁移脚本：添加 AI 摘要列
-- 表名: school_notices
-- 目的: 支持存储 AI 生成的智能摘要
-- ================================================

-- 1. 添加 ai_summary 列
ALTER TABLE school_notices
ADD COLUMN IF NOT EXISTS ai_summary TEXT;

-- 2. 添加字段注释
COMMENT ON COLUMN school_notices.ai_summary IS 'AI 生成的智能摘要（结构化 Markdown，包含核心要点、时间节点、注意事项等）';

-- 3. 验证列是否添加成功
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'school_notices'
  AND column_name = 'ai_summary';

-- 4. 显示当前表结构
SELECT
  column_name,
  data_type,
  character_maximum_length,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'school_notices'
ORDER BY ordinal_position;

-- 5. 显示结果
SELECT
  '✅ ai_summary 列添加成功！' as status,
  COUNT(*) as total_records,
  COUNT(ai_summary) as records_with_ai_summary,
  COUNT(*) - COUNT(ai_summary) as records_without_ai_summary
FROM school_notices;
