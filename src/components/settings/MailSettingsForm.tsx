import { useState, useEffect } from "react";
import { Mail, Server, Lock, User, Send, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface MailSettings {
  id?: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_password: string;
  sender_email: string;
  sender_name: string;
  is_verified: boolean;
}

export function MailSettingsForm() {
  const [settings, setSettings] = useState<MailSettings>({
    smtp_host: "",
    smtp_port: 587,
    smtp_secure: true,
    smtp_user: "",
    smtp_password: "",
    sender_email: "",
    sender_name: "Sümen Onay Sistemi",
    is_verified: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "success" | "error">("idle");
  const [hasExisting, setHasExisting] = useState(false);
  const { toast } = useToast();

  // Load existing settings
  useEffect(() => {
    const loadSettings = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from("mail_settings")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (data) {
        setSettings({
          id: data.id,
          smtp_host: data.smtp_host,
          smtp_port: data.smtp_port,
          smtp_secure: data.smtp_secure,
          smtp_user: data.smtp_user,
          smtp_password: "", // Don't show password
          sender_email: data.sender_email,
          sender_name: data.sender_name || "Sümen Onay Sistemi",
          is_verified: data.is_verified || false,
        });
        setHasExisting(true);
        if (data.is_verified) {
          setTestStatus("success");
        }
      }
    };

    loadSettings();
  }, []);

  const handleSave = async () => {
    if (!settings.smtp_host || !settings.smtp_user || !settings.sender_email) {
      toast({
        title: "Eksik Bilgi",
        description: "Lütfen gerekli alanları doldurun.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Oturum bulunamadı");

      const payload = {
        user_id: session.user.id,
        smtp_host: settings.smtp_host,
        smtp_port: settings.smtp_port,
        smtp_secure: settings.smtp_secure,
        smtp_user: settings.smtp_user,
        ...(settings.smtp_password && { smtp_password: settings.smtp_password }),
        sender_email: settings.sender_email,
        sender_name: settings.sender_name,
      };

      if (hasExisting && settings.id) {
        const { error } = await supabase
          .from("mail_settings")
          .update(payload)
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        if (!settings.smtp_password) {
          toast({
            title: "Şifre Gerekli",
            description: "İlk kayıt için mail şifresi gereklidir.",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("mail_settings")
          .insert({ ...payload, smtp_password: settings.smtp_password })
          .select()
          .single();

        if (error) throw error;
        setSettings(prev => ({ ...prev, id: data.id }));
        setHasExisting(true);
      }

      toast({
        title: "Kaydedildi",
        description: "Mail ayarları başarıyla kaydedildi.",
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

  const handleTest = async () => {
    if (!settings.smtp_host || !settings.smtp_user || !settings.sender_email) {
      toast({
        title: "Eksik Bilgi",
        description: "Test için önce ayarları doldurun ve kaydedin.",
        variant: "destructive",
      });
      return;
    }

    setIsTesting(true);
    setTestStatus("idle");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Oturum bulunamadı");

      const response = await supabase.functions.invoke("test-smtp", {
        body: {
          smtp_host: settings.smtp_host,
          smtp_port: settings.smtp_port,
          smtp_secure: settings.smtp_secure,
          smtp_user: settings.smtp_user,
          smtp_password: settings.smtp_password || undefined, // Will use saved password if not provided
          sender_email: settings.sender_email,
          sender_name: settings.sender_name,
          test_email: session.user.email,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Test başarısız");
      }

      if (response.data?.success) {
        setTestStatus("success");
        
        // Update verification status in DB
        if (settings.id) {
          await supabase
            .from("mail_settings")
            .update({ is_verified: true })
            .eq("id", settings.id);
        }
        
        toast({
          title: "Test Başarılı",
          description: `Test maili ${session.user.email} adresine gönderildi.`,
        });
      } else {
        throw new Error(response.data?.error || "Test başarısız");
      }
    } catch (error) {
      setTestStatus("error");
      toast({
        title: "Test Başarısız",
        description: error instanceof Error ? error.message : "Mail gönderilemedi.",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5" />
          SMTP Mail Ayarları
        </CardTitle>
        <CardDescription>
          Bildirim mailleri göndermek için SMTP sunucu ayarlarınızı yapılandırın.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="smtp_host">SMTP Sunucu</Label>
            <div className="relative">
              <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="smtp_host"
                placeholder="mail.firma.com"
                value={settings.smtp_host}
                onChange={(e) => setSettings(prev => ({ ...prev, smtp_host: e.target.value }))}
                className="pl-9"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp_port">Port</Label>
            <Select
              value={settings.smtp_port.toString()}
              onValueChange={(v) => setSettings(prev => ({ ...prev, smtp_port: parseInt(v) }))}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 (SMTP)</SelectItem>
                <SelectItem value="465">465 (SSL)</SelectItem>
                <SelectItem value="587">587 (TLS)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="space-y-0.5">
            <Label htmlFor="smtp_secure">SSL/TLS Kullan</Label>
            <p className="text-xs text-muted-foreground">Güvenli bağlantı için önerilir</p>
          </div>
          <Switch
            id="smtp_secure"
            checked={settings.smtp_secure}
            onCheckedChange={(checked) => setSettings(prev => ({ ...prev, smtp_secure: checked }))}
            disabled={isLoading}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="smtp_user">Kullanıcı Adı</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="smtp_user"
                placeholder="bildirim@firma.com"
                value={settings.smtp_user}
                onChange={(e) => setSettings(prev => ({ ...prev, smtp_user: e.target.value }))}
                className="pl-9"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp_password">Şifre</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="smtp_password"
                type="password"
                placeholder={hasExisting ? "••••••••" : "Mail şifresi"}
                value={settings.smtp_password}
                onChange={(e) => setSettings(prev => ({ ...prev, smtp_password: e.target.value }))}
                className="pl-9"
                disabled={isLoading}
              />
            </div>
            {hasExisting && (
              <p className="text-xs text-muted-foreground">Değiştirmek için yeni şifre girin</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="sender_email">Gönderen E-posta</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="sender_email"
                type="email"
                placeholder="bildirim@firma.com"
                value={settings.sender_email}
                onChange={(e) => setSettings(prev => ({ ...prev, sender_email: e.target.value }))}
                className="pl-9"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sender_name">Gönderen Adı</Label>
            <Input
              id="sender_name"
              placeholder="Sümen Onay Sistemi"
              value={settings.sender_name}
              onChange={(e) => setSettings(prev => ({ ...prev, sender_name: e.target.value }))}
              disabled={isLoading}
            />
          </div>
        </div>

        {testStatus === "success" && (
          <div className="flex items-center gap-2 p-3 bg-success/10 text-success rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-medium">Mail bağlantısı doğrulandı</span>
          </div>
        )}

        {testStatus === "error" && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm font-medium">Mail bağlantısı kurulamadı</span>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button onClick={handleSave} className="flex-1" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Kaydediliyor...
              </>
            ) : (
              "Kaydet"
            )}
          </Button>
          <Button onClick={handleTest} variant="outline" disabled={isTesting || !hasExisting}>
            {isTesting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Test Ediliyor...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Test Et
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
