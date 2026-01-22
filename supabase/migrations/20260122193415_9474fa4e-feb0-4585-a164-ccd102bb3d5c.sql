-- Profiles tablosu - DIA bağlantı bilgileri ve kullanıcı ayarları
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'approver' CHECK (role IN ('admin', 'approver', 'viewer')),
  
  -- DIA ERP Bağlantı Bilgileri
  dia_sunucu_adi TEXT,
  dia_api_key TEXT,
  dia_ws_kullanici TEXT,
  dia_ws_sifre TEXT,
  dia_session_id TEXT,
  dia_session_expires TIMESTAMPTZ,
  dia_firma_kodu INTEGER DEFAULT 1,
  dia_donem_kodu INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Onay bekleyen işlemler tablosu (DIA'dan çekilen veriler için cache)
CREATE TABLE public.pending_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  dia_record_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('invoice', 'current_account', 'bank', 'cash', 'check_note')),
  document_no TEXT NOT NULL,
  description TEXT,
  counterparty TEXT,
  amount DECIMAL(18,2) NOT NULL,
  currency TEXT DEFAULT 'TRY',
  transaction_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'analyzing')),
  dia_raw_data JSONB,
  attachment_url TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  rejected_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES auth.users(id),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, dia_record_id)
);

-- Enable RLS
ALTER TABLE public.pending_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pending_transactions
CREATE POLICY "Users can view own transactions"
  ON public.pending_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON public.pending_transactions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.pending_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON public.pending_transactions FOR DELETE
  USING (auth.uid() = user_id);

-- Onay geçmişi tablosu
CREATE TABLE public.approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES public.pending_transactions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected', 'analyzed')),
  notes TEXT,
  dia_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.approval_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own approval history"
  ON public.approval_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own approval history"
  ON public.approval_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pending_transactions_updated_at
  BEFORE UPDATE ON public.pending_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create profile on signup trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();