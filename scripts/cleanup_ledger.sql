-- 一次性清理脚本：去重分类/规则，补账单 ledger_id 为默认账本
-- PowerShell 用法：
--   Get-Content .\scripts\cleanup_ledger.sql -Raw | sqlite3 .\output\ledger.db

-- 1) 补齐 bills 里的 ledger_id（默认账本 = ledgers 表里最小 id）
WITH default_ledger AS (
  SELECT id FROM ledgers ORDER BY id LIMIT 1
)
UPDATE bills
SET ledger_id = (SELECT id FROM default_ledger)
WHERE ledger_id IS NULL
  AND EXISTS (SELECT 1 FROM default_ledger);

-- 2) 去重 categories：同 (major, minor, ledger_id/NULL) 保留最小 id
DELETE FROM categories
WHERE id NOT IN (
  SELECT MIN(id) FROM categories
  GROUP BY major, minor, IFNULL(ledger_id, 0)
);

-- 3) 去重 category_rules：同 (keyword, ledger_id/NULL) 保留最小 id
DELETE FROM category_rules
WHERE id NOT IN (
  SELECT MIN(id) FROM category_rules
  GROUP BY keyword, IFNULL(ledger_id, 0)
);

-- 4) 如果你确实需要“再补一次”（比如中间你会插入 ledgers），那就必须再次 WITH
WITH default_ledger AS (
  SELECT id FROM ledgers ORDER BY id LIMIT 1
)
UPDATE bills
SET ledger_id = (SELECT id FROM default_ledger)
WHERE ledger_id IS NULL
  AND EXISTS (SELECT 1 FROM default_ledger);
