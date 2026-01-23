-- Add dia_firma_kodu column to pending_transactions for multi-company support
ALTER TABLE public.pending_transactions 
ADD COLUMN dia_firma_kodu integer;

-- Add an index for efficient filtering by firma_kodu
CREATE INDEX idx_pending_transactions_firma_kodu 
ON public.pending_transactions(user_id, dia_firma_kodu);

-- Update existing records to have a default firma_kodu (will be updated on next sync)
COMMENT ON COLUMN public.pending_transactions.dia_firma_kodu IS 'DIA company code for multi-company filtering';