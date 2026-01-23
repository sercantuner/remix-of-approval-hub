-- Add columns for üst işlem türü keys
ALTER TABLE public.profiles 
ADD COLUMN dia_ust_islem_approve_key integer,
ADD COLUMN dia_ust_islem_reject_key integer;