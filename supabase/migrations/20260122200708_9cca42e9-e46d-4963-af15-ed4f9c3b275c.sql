-- Mevcut constraint'i kaldır
ALTER TABLE pending_transactions 
DROP CONSTRAINT IF EXISTS pending_transactions_transaction_type_check;

-- Yeni constraint ekle (order dahil)
ALTER TABLE pending_transactions 
ADD CONSTRAINT pending_transactions_transaction_type_check 
CHECK (transaction_type = ANY (ARRAY['invoice', 'current_account', 'bank', 'cash', 'check_note', 'order']));