-- ================================================
-- Supabase 数据库表创建脚本
-- 表名: school_notices
-- 用途: 存储华南理工大学教务处通知
-- ================================================

-- 创建 school_notices 表
CREATE TABLE IF NOT EXISTS school_notices (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  source VARCHAR(50) DEFAULT 'SCUT_JW',
  source_url TEXT UNIQUE NOT NULL,
  author TEXT DEFAULT '华南理工大学本科生院',
  published_at TEXT,
  fetched_at TIMESTAMP DEFAULT NOW(),
  priority VARCHAR(10) CHECK (priority IN ('high', 'low')),
  tags TEXT[],
  is_favorited BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引以提升查询性能
CREATE INDEX IF NOT EXISTS idx_school_notices_source_url ON school_notices(source_url);
CREATE INDEX IF NOT EXISTS idx_school_notices_priority ON school_notices(priority);
CREATE INDEX IF NOT EXISTS idx_school_notices_published_at ON school_notices(published_at);
CREATE INDEX IF NOT EXISTS idx_school_notices_created_at ON school_notices(created_at DESC);

-- 为 tags 字段创建 GIN 索引（支持数组查询）
CREATE INDEX IF NOT EXISTS idx_school_notices_tags ON school_notices USING GIN(tags);

-- 添加注释
COMMENT ON TABLE school_notices IS '华南理工大学教务处通知数据表';
COMMENT ON COLUMN school_notices.title IS '通知标题';
COMMENT ON COLUMN school_notices.summary IS '通知摘要（前200字符）';
COMMENT ON COLUMN school_notices.content IS 'Markdown 格式的完整内容';
COMMENT ON COLUMN school_notices.source IS '数据来源标识';
COMMENT ON COLUMN school_notices.source_url IS '通知原文链接（唯一约束）';
COMMENT ON COLUMN school_notices.author IS '发布单位';
COMMENT ON COLUMN school_notices.published_at IS '通知发布日期';
COMMENT ON COLUMN school_notices.fetched_at IS '数据抓取时间';
COMMENT ON COLUMN school_notices.priority IS '优先级（high/low）';
COMMENT ON COLUMN school_notices.tags IS '标签数组';
COMMENT ON COLUMN school_notices.is_favorited IS '是否收藏';

-- 启用行级安全策略 (RLS)
ALTER TABLE school_notices ENABLE ROW LEVEL SECURITY;

-- 创建公开读取策略（允许所有人查看）
CREATE POLICY "Allow public read access" ON school_notices
  FOR SELECT
  USING (true);

-- 创建仅服务角色可写入策略（仅 Service Role Key 可写入）
CREATE POLICY "Allow service role insert" ON school_notices
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

-- 显示创建结果
SELECT
  'school_notices 表创建成功！' as status,
  COUNT(*) as row_count
FROM school_notices;
