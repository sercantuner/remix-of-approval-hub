import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestSmtpRequest {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_password?: string;
  sender_email: string;
  sender_name: string;
  test_email: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Yetkilendirme başlığı bulunamadı");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("Yetkilendirme hatası");
    }

    const body: TestSmtpRequest = await req.json();
    const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, sender_email, sender_name, test_email } = body;

    // If no password provided, get from database
    let finalPassword = smtp_password || "";
    if (!finalPassword) {
      const { data: mailSettings } = await supabase
        .from("mail_settings")
        .select("smtp_password")
        .eq("user_id", user.id)
        .single();

      if (!mailSettings?.smtp_password) {
        throw new Error("Mail şifresi bulunamadı. Lütfen ayarları kaydedin.");
      }
      finalPassword = mailSettings.smtp_password;
    }

    // Create SMTP client
    const client = new SMTPClient({
      connection: {
        hostname: smtp_host,
        port: smtp_port,
        tls: smtp_secure,
        auth: {
          username: smtp_user,
          password: finalPassword,
        },
      },
    });

    // Send test email
    await client.send({
      from: `${sender_name} <${sender_email}>`,
      to: test_email,
      subject: "Sümen Onay Sistemi - Mail Test",
      content: "auto",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
            .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 6px; color: #155724; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #6c757d; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">✅ Mail Testi Başarılı</h1>
            </div>
            <div class="content">
              <div class="success">
                <strong>Tebrikler!</strong> Mail ayarlarınız doğru yapılandırılmış.
              </div>
              <p>Bu mail, SMTP ayarlarınızın doğru çalıştığını doğrulamak için gönderilmiştir.</p>
              <p><strong>Ayarlar:</strong></p>
              <ul>
                <li>Sunucu: ${smtp_host}</li>
                <li>Port: ${smtp_port}</li>
                <li>SSL/TLS: ${smtp_secure ? "Aktif" : "Pasif"}</li>
                <li>Gönderen: ${sender_name} &lt;${sender_email}&gt;</li>
              </ul>
              <p>Artık otomatik bildirimler bu ayarlar üzerinden gönderilecektir.</p>
            </div>
            <div class="footer">
              Sümen Onay Sistemi
            </div>
          </div>
        </body>
        </html>
      `,
    });

    await client.close();

    return new Response(
      JSON.stringify({ success: true, message: "Test maili gönderildi" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Test SMTP error:", error);
    const errorMessage = error instanceof Error ? error.message : "Mail gönderilemedi";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
