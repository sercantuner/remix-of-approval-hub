import { useState } from "react";
import { Server, Key, User, Hash, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { diaLogin } from "@/lib/diaApi";

interface DiaConnectionFormProps {
  onSuccess: () => void;
  existingConnection?: {
    sunucuAdi?: string;
    firmaKodu?: number;
    donemKodu?: number;
  };
}

export function DiaConnectionForm({ onSuccess, existingConnection }: DiaConnectionFormProps) {
  const [sunucuAdi, setSunucuAdi] = useState(existingConnection?.sunucuAdi || "");
  const [apiKey, setApiKey] = useState("");
  const [wsKullanici, setWsKullanici] = useState("");
  const [wsSifre, setWsSifre] = useState("");
  const [firmaKodu, setFirmaKodu] = useState(existingConnection?.firmaKodu?.toString() || "1");
  const [donemKodu, setDonemKodu] = useState(existingConnection?.donemKodu?.toString() || "0");
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!sunucuAdi || !apiKey || !wsKullanici || !wsSifre) {
      toast({
        title: "Eksik Bilgi",
        description: "Lütfen tüm alanları doldurun.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setConnectionStatus("idle");

    try {
      const result = await diaLogin({
        sunucuAdi,
        apiKey,
        wsKullanici,
        wsSifre,
        firmaKodu: parseInt(firmaKodu),
        donemKodu: parseInt(donemKodu),
      });

      if (result.success) {
        setConnectionStatus("success");
        toast({
          title: "Bağlantı Başarılı",
          description: "Dia ERP bağlantısı kuruldu.",
        });
        onSuccess();
      } else {
        setConnectionStatus("error");
        toast({
          title: "Bağlantı Hatası",
          description: result.error || "Dia ERP bağlantısı kurulamadı.",
          variant: "destructive",
        });
      }
    } catch (error) {
      setConnectionStatus("error");
      toast({
        title: "Hata",
        description: error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="w-5 h-5" />
          Dia ERP Bağlantısı
        </CardTitle>
        <CardDescription>
          Dia ERP web servis bilgilerinizi girerek bağlantı kurun.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sunucuAdi">Sunucu Adı</Label>
            <div className="relative">
              <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="sunucuAdi"
                placeholder="demo (sadece sunucu adı)"
                value={sunucuAdi}
                onChange={(e) => setSunucuAdi(e.target.value)}
                className="pl-9"
                disabled={isLoading}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Örn: https://<strong>demo</strong>.dia.com.tr için "demo" yazın
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="apiKey"
                type="password"
                placeholder="DIA API anahtarınız"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="pl-9"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="wsKullanici">Web Servis Kullanıcı</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="wsKullanici"
                  placeholder="ws_user"
                  value={wsKullanici}
                  onChange={(e) => setWsKullanici(e.target.value)}
                  className="pl-9"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wsSifre">Web Servis Şifre</Label>
              <Input
                id="wsSifre"
                type="password"
                placeholder="••••••••"
                value={wsSifre}
                onChange={(e) => setWsSifre(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firmaKodu">Firma Kodu</Label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="firmaKodu"
                  type="number"
                  placeholder="1"
                  value={firmaKodu}
                  onChange={(e) => setFirmaKodu(e.target.value)}
                  className="pl-9"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="donemKodu">Dönem Kodu</Label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="donemKodu"
                  type="number"
                  placeholder="0"
                  value={donemKodu}
                  onChange={(e) => setDonemKodu(e.target.value)}
                  className="pl-9"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          {connectionStatus === "success" && (
            <div className="flex items-center gap-2 p-3 bg-success/10 text-success rounded-lg">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm font-medium">Bağlantı başarılı!</span>
            </div>
          )}

          {connectionStatus === "error" && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm font-medium">Bağlantı kurulamadı</span>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Bağlantı Kuruluyor...
              </>
            ) : (
              "Bağlantıyı Test Et ve Kaydet"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
