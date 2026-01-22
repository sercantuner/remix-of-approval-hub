-- Create mail_settings table for SMTP configuration
CREATE TABLE public.mail_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_secure BOOLEAN NOT NULL DEFAULT true,
  smtp_user TEXT NOT NULL,
  smtp_password TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  sender_name TEXT DEFAULT 'Sümen Onay Sistemi',
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create notification_settings table for notification preferences
CREATE TABLE public.notification_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  notification_hour INTEGER NOT NULL DEFAULT 10 CHECK (notification_hour >= 0 AND notification_hour <= 23),
  invoice_emails TEXT[] DEFAULT '{}',
  order_emails TEXT[] DEFAULT '{}',
  current_account_emails TEXT[] DEFAULT '{}',
  bank_emails TEXT[] DEFAULT '{}',
  cash_emails TEXT[] DEFAULT '{}',
  check_note_emails TEXT[] DEFAULT '{}',
  last_notification_sent TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE public.mail_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for mail_settings
CREATE POLICY "Users can view own mail settings" 
ON public.mail_settings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own mail settings" 
ON public.mail_settings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own mail settings" 
ON public.mail_settings 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own mail settings" 
ON public.mail_settings 
FOR DELETE 
USING (auth.uid() = user_id);

-- RLS Policies for notification_settings
CREATE POLICY "Users can view own notification settings" 
ON public.notification_settings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification settings" 
ON public.notification_settings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification settings" 
ON public.notification_settings 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notification settings" 
ON public.notification_settings 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_mail_settings_updated_at
BEFORE UPDATE ON public.mail_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notification_settings_updated_at
BEFORE UPDATE ON public.notification_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();