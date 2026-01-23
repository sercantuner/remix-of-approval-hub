import { useState, useEffect } from "react";
import { Bell, Clock, Mail, Plus, X, Loader2, FileText, Users, Building, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface NotificationSettings {
  id?: string;
  is_enabled: boolean;
  notification_hours: number[];
  invoice_emails: string[];
  order_emails: string[];
  current_account_emails: string[];
  bank_emails: string[];
  cash_emails: string[];
  check_note_emails: string[];
}

interface CategoryConfig {
  key: keyof Pick<NotificationSettings, 'invoice_emails' | 'order_emails' | 'current_account_emails' | 'bank_emails' | 'cash_emails' | 'check_note_emails'>;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CATEGORIES: CategoryConfig[] = [
  { key: "invoice_emails", label: "Faturalar", icon: FileText },
  { key: "current_account_emails", label: "Cari Hareketler", icon: Users },
  { key: "bank_emails", label: "Banka Hareketleri", icon: Building },
  { key: "cash_emails", label: "Kasa Hareketleri", icon: Wallet },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i.toString(),
  label: `${i.toString().padStart(2, "0")}:00`,
}));

export function NotificationSettingsForm() {
  const [settings, setSettings] = useState<NotificationSettings>({
    is_enabled: false,
    notification_hours: [10],
    invoice_emails: [],
    order_emails: [],
    current_account_emails: [],
    bank_emails: [],
    cash_emails: [],
    check_note_emails: [],
  });
  const [emailInputs, setEmailInputs] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const { toast } = useToast();

  // Load existing settings
  useEffect(() => {
    const loadSettings = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data } = await supabase
        .from("notification_settings")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (data) {
        setSettings({
          id: data.id,
          is_enabled: data.is_enabled,
          notification_hours: data.notification_hours || [10],
          invoice_emails: data.invoice_emails || [],
          order_emails: data.order_emails || [],
          current_account_emails: data.current_account_emails || [],
          bank_emails: data.bank_emails || [],
          cash_emails: data.cash_emails || [],
          check_note_emails: data.check_note_emails || [],
        });
        setHasExisting(true);
      }
    };

    loadSettings();
  }, []);

  const handleAddHour = (hour: number) => {
    if (settings.notification_hours.length >= 3) {
      toast({
        title: "Limit",
        description: "En fazla 3 farklı saat ekleyebilirsiniz.",
        variant: "destructive",
      });
      return;
    }
    if (settings.notification_hours.includes(hour)) {
      toast({
        title: "Zaten Ekli",
        description: "Bu saat zaten listede.",
        variant: "destructive",
      });
      return;
    }
    setSettings(prev => ({
      ...prev,
      notification_hours: [...prev.notification_hours, hour].sort((a, b) => a - b),
    }));
  };

  const handleRemoveHour = (hour: number) => {
    if (settings.notification_hours.length <= 1) {
      toast({
        title: "Minimum",
        description: "En az 1 saat belirlenmeli.",
        variant: "destructive",
      });
      return;
    }
    setSettings(prev => ({
      ...prev,
      notification_hours: prev.notification_hours.filter(h => h !== hour),
    }));
  };

  const handleAddEmail = (category: CategoryConfig['key']) => {
    const email = emailInputs[category]?.trim();
    if (!email) return;

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({
        title: "Geçersiz E-posta",
        description: "Lütfen geçerli bir e-posta adresi girin.",
        variant: "destructive",
      });
      return;
    }

    // Check if already exists
    if (settings[category].includes(email)) {
      toast({
        title: "Zaten Ekli",
        description: "Bu e-posta adresi zaten listede.",
        variant: "destructive",
      });
      return;
    }

    setSettings(prev => ({
      ...prev,
      [category]: [...prev[category], email],
    }));
    setEmailInputs(prev => ({ ...prev, [category]: "" }));
  };

  const handleRemoveEmail = (category: CategoryConfig['key'], email: string) => {
    setSettings(prev => ({
      ...prev,
      [category]: prev[category].filter(e => e !== email),
    }));
  };

  const handleKeyPress = (e: React.KeyboardEvent, category: CategoryConfig['key']) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddEmail(category);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Oturum bulunamadı");

      const payload = {
        user_id: session.user.id,
        is_enabled: settings.is_enabled,
        notification_hours: settings.notification_hours,
        invoice_emails: settings.invoice_emails,
        order_emails: settings.order_emails,
        current_account_emails: settings.current_account_emails,
        bank_emails: settings.bank_emails,
        cash_emails: settings.cash_emails,
        check_note_emails: settings.check_note_emails,
      };

      if (hasExisting && settings.id) {
        const { error } = await supabase
          .from("notification_settings")
          .update(payload)
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("notification_settings")
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        setSettings(prev => ({ ...prev, id: data.id }));
        setHasExisting(true);
      }

      toast({
        title: "Kaydedildi",
        description: "Bildirim ayarları başarıyla kaydedildi.",
      });
    } catch (error) {
      toast({
        title: "Hata",
        description: error instanceof Error ? error.message : "Ayarlar kaydedilemedi.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const totalEmails = CATEGORIES.reduce((sum, cat) => sum + settings[cat.key].length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Otomatik Bildirimler
        </CardTitle>
        <CardDescription>
          Belirlenen saatlerde onay bekleyen işlemler için otomatik mail bildirimi alın.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="space-y-0.5">
            <Label htmlFor="notifications_enabled" className="text-base font-medium">
              Bildirimleri Aktifleştir
            </Label>
            <p className="text-sm text-muted-foreground">
              Her gün belirlenen saatlerde otomatik bildirim gönderilir
            </p>
          </div>
          <Switch
            id="notifications_enabled"
            checked={settings.is_enabled}
            onCheckedChange={(checked) => setSettings(prev => ({ ...prev, is_enabled: checked }))}
            disabled={isLoading}
          />
        </div>

        {/* Notification Hours - Multiple Selection */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Bildirim Saatleri (1-3 saat)
          </Label>
          
          {/* Selected hours */}
          <div className="flex flex-wrap gap-2">
            {settings.notification_hours.map(hour => (
              <Badge 
                key={hour} 
                variant="secondary" 
                className="gap-1 pr-1 text-sm py-1"
              >
                {hour.toString().padStart(2, "0")}:00
                <button
                  type="button"
                  onClick={() => handleRemoveHour(hour)}
                  className="ml-1 hover:bg-muted rounded p-0.5"
                  disabled={isLoading || !settings.is_enabled}
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>

          {/* Add hour selector */}
          {settings.notification_hours.length < 3 && (
            <div className="flex gap-2 items-center">
              <Select
                onValueChange={(v) => handleAddHour(parseInt(v))}
                disabled={isLoading || !settings.is_enabled}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Saat ekle" />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.filter(h => !settings.notification_hours.includes(parseInt(h.value))).map(h => (
                    <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                {3 - settings.notification_hours.length} saat daha ekleyebilirsiniz
              </span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Bildirimler şu saatlerde gönderilecek: {settings.notification_hours.map(h => `${h.toString().padStart(2, "0")}:00`).join(", ")}
          </p>
        </div>

        {/* Category Email Addresses */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Kategori Bazlı Mail Adresleri</Label>
            <Badge variant="secondary">{totalEmails} alıcı</Badge>
          </div>
          
          <div className="space-y-4">
            {CATEGORIES.map(category => {
              const Icon = category.icon;
              const emails = settings[category.key];
              
              return (
                <div key={category.key} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <Label className="font-medium">{category.label}</Label>
                    {emails.length > 0 && (
                      <Badge variant="outline" className="ml-auto">{emails.length}</Badge>
                    )}
                  </div>
                  
                  {/* Email badges */}
                  {emails.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {emails.map(email => (
                        <Badge 
                          key={email} 
                          variant="secondary" 
                          className="gap-1 pr-1"
                        >
                          {email}
                          <button
                            type="button"
                            onClick={() => handleRemoveEmail(category.key, email)}
                            className="ml-1 hover:bg-muted rounded p-0.5"
                            disabled={isLoading}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  
                  {/* Add email input */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder="mail@firma.com"
                        value={emailInputs[category.key] || ""}
                        onChange={(e) => setEmailInputs(prev => ({ ...prev, [category.key]: e.target.value }))}
                        onKeyPress={(e) => handleKeyPress(e, category.key)}
                        className="pl-9"
                        disabled={isLoading || !settings.is_enabled}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleAddEmail(category.key)}
                      disabled={isLoading || !settings.is_enabled || !emailInputs[category.key]}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Save Button */}
        <Button onClick={handleSave} className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Kaydediliyor...
            </>
          ) : (
            "Bildirim Ayarlarını Kaydet"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
