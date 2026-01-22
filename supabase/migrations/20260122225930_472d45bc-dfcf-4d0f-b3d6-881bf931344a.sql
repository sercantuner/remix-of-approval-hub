-- Change notification_hour to notification_hours array to support 1-3 times
ALTER TABLE public.notification_settings 
DROP COLUMN notification_hour;

ALTER TABLE public.notification_settings 
ADD COLUMN notification_hours integer[] NOT NULL DEFAULT '{10}';