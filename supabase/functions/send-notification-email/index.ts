import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CategoryCount {
  type: string;
  label: string;
  count: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  invoice: "Fatura",
  order: "Sipariş",
  current_account: "Cari Hareket",
  bank: "Banka Hareketi",
  cash: "Kasa Hareketi",
  check_note: "Çek/Senet",
};

const CATEGORY_EMAIL_FIELDS: Record<string, string> = {
  invoice: "invoice_emails",
  order: "order_emails",
  current_account: "current_account_emails",
  bank: "bank_emails",
  cash: "cash_emails",
  check_note: "check_note_emails",
};

async function sendEmailToRecipients(
  client: SMTPClient,
  senderEmail: string,
  senderName: string,
  recipients: string[],
  userName: string,
  category: CategoryCount,
  _dashboardUrl: string
) {
  if (recipients.length === 0) return;

  // Fixed dashboard URL
  const dashboardUrl = "https://sumen.diauygulama.com";

  // Build HTML without line breaks to avoid =20 encoding issues
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.6;color:#333;margin:0;padding:0}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:30px;border-radius:8px 8px 0 0;text-align:center}.content{background:#ffffff;padding:30px;border:1px solid #e9ecef;border-top:none}.footer{background:#f8f9fa;padding:20px;border-radius:0 0 8px 8px;text-align:center;border:1px solid #e9ecef;border-top:none}.stat-box{background:#f8f9fa;border:1px solid #e9ecef;border-radius:8px;padding:20px;text-align:center;margin:20px 0}.stat-number{font-size:48px;font-weight:700;color:#667eea}.stat-label{font-size:14px;color:#6c757d;margin-top:5px}.btn{display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:600;margin-top:15px}</style></head><body><div class="container"><div class="header"><h1 style="margin:0;font-size:24px;">🔔 Onay Bekleyen İşlemler</h1></div><div class="content"><p>Sayın ' + userName + ',</p><p>Onayınızı bekleyen <strong>' + category.label + '</strong> işlemleri bulunmaktadır:</p><div class="stat-box"><div class="stat-number">' + category.count + '</div><div class="stat-label">' + category.label + '</div></div><p>Bu işlemleri onaylamak veya reddetmek için aşağıdaki bağlantıya tıklayın:</p><div style="text-align:center;"><a href="' + dashboardUrl + '" class="btn" style="color:#ffffff;">Onay Paneline Git →</a></div></div><div class="footer"><p style="margin:0;color:#6c757d;font-size:12px;">Bu mail otomatik olarak gönderilmiştir.<br>Sümen Onay Sistemi</p></div></div></body></html>';

  for (const recipient of recipients) {
    try {
      await client.send({
        from: `${senderName} <${senderEmail}>`,
        to: recipient,
        subject: `Onay Bekleyen ${category.count} ${category.label} - Sümen`,
        content: "auto",
        html,
      });
      console.log(`Email sent to ${recipient} for ${category.type}`);
    } catch (error) {
      console.error(`Failed to send email to ${recipient}:`, error);
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check for force parameter to bypass dedup
    let forceResend = false;
    try {
      const body = await req.json();
      forceResend = body?.force === true;
    } catch {
      // No body or invalid JSON, that's fine
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current hour (Turkey timezone - UTC+3)
    const now = new Date();
    const turkeyTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
    const currentHour = turkeyTime.getHours();
    const todayDateString = turkeyTime.toDateString();

    console.log(`Running notification check for hour: ${currentHour}${forceResend ? " (FORCE MODE)" : ""}`);

    // Get all users who have notifications enabled
    const { data: notificationSettings, error: settingsError } = await supabase
      .from("notification_settings")
      .select("*")
      .eq("is_enabled", true);

    if (settingsError) {
      throw new Error(`Failed to fetch notification settings: ${settingsError.message}`);
    }

    if (!notificationSettings || notificationSettings.length === 0) {
      console.log("No users with notifications enabled");
      return new Response(
        JSON.stringify({ success: true, message: "No notifications to send", sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter users whose notification_hours array contains the current hour
    const usersToNotify = notificationSettings.filter(settings => {
      const hours = settings.notification_hours as number[] || [];
      return hours.includes(currentHour);
    });

    if (usersToNotify.length === 0) {
      console.log(`No users scheduled for notifications at hour ${currentHour}`);
      return new Response(
        JSON.stringify({ success: true, message: "No notifications for this hour", sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalSent = 0;

    for (const settings of usersToNotify) {
      try {
        // Check if already sent for this hour today (skip if force mode)
        if (!forceResend && settings.last_notification_sent) {
          const lastSent = new Date(settings.last_notification_sent);
          const lastSentTurkey = new Date(lastSent.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
          const lastSentDateString = lastSentTurkey.toDateString();
          const lastSentHour = lastSentTurkey.getHours();
          
          // Skip if already sent at this hour today
          if (lastSentDateString === todayDateString && lastSentHour === currentHour) {
            console.log(`Already sent notification at ${currentHour}:00 today for user ${settings.user_id}`);
            continue;
          }
        }

        // Get user profile first to get dia_firma_kodu
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email, dia_firma_kodu")
          .eq("id", settings.user_id)
          .single();

        const userName = profile?.full_name || profile?.email || "Kullanıcı";
        const firmaKodu = profile?.dia_firma_kodu;

        // Get mail settings for this user
        const { data: mailSettings, error: mailError } = await supabase
          .from("mail_settings")
          .select("*")
          .eq("user_id", settings.user_id)
          .single();

        if (mailError || !mailSettings) {
          console.log(`No mail settings for user ${settings.user_id}`);
          continue;
        }

        // Get pending transaction counts by type (filter by dia_firma_kodu if available)
        let txQuery = supabase
          .from("pending_transactions")
          .select("transaction_type")
          .eq("status", "pending");
        
        if (firmaKodu !== null && firmaKodu !== undefined) {
          txQuery = txQuery.eq("dia_firma_kodu", firmaKodu);
        }
        
        const { data: transactions, error: txError } = await txQuery;

        if (txError) {
          console.error(`Failed to fetch transactions for user ${settings.user_id}:`, txError);
          continue;
        }

        if (!transactions || transactions.length === 0) {
          console.log(`No pending transactions for user ${settings.user_id}`);
          continue;
        }

        // Count by type
        const counts: Record<string, number> = {};
        for (const tx of transactions) {
          counts[tx.transaction_type] = (counts[tx.transaction_type] || 0) + 1;
        }

        // Create SMTP client
        // Port 465 uses implicit SSL (tls: true from start)
        // Port 587 uses STARTTLS (tls: false, then upgrade)
        const useTls = mailSettings.smtp_port === 465 ? true : false;
        
        console.log(`[notification] Connecting to ${mailSettings.smtp_host}:${mailSettings.smtp_port} with TLS=${useTls}`);
        
        const client = new SMTPClient({
          connection: {
            hostname: mailSettings.smtp_host,
            port: mailSettings.smtp_port,
            tls: useTls,
            auth: {
              username: mailSettings.smtp_user,
              password: mailSettings.smtp_password,
            },
          },
        });

        const dashboardUrl = `${supabaseUrl.replace('.supabase.co', '')}/dashboard`;

        let emailsSentForUser = 0;
        
        // Send emails for each category
        for (const [type, count] of Object.entries(counts)) {
          const emailField = CATEGORY_EMAIL_FIELDS[type];
          if (!emailField) continue;

          const recipients = settings[emailField] as string[] || [];
          if (recipients.length === 0) continue;

          const category: CategoryCount = {
            type,
            label: CATEGORY_LABELS[type] || type,
            count,
          };

          await sendEmailToRecipients(
            client,
            mailSettings.sender_email,
            mailSettings.sender_name || "Sümen Onay Sistemi",
            recipients,
            userName,
            category,
            dashboardUrl
          );

          emailsSentForUser += recipients.length;
          totalSent += recipients.length;
        }

        // Only close client if we actually sent emails (connection was established)
        if (emailsSentForUser > 0) {
          try {
            await client.close();
          } catch (closeError) {
            console.warn("Error closing SMTP client:", closeError);
          }
        }

        // Update last notification sent
        await supabase
          .from("notification_settings")
          .update({ last_notification_sent: new Date().toISOString() })
          .eq("id", settings.id);

      } catch (userError) {
        console.error(`Error processing user ${settings.user_id}:`, userError);
      }
    }

    console.log(`Total emails sent: ${totalSent}`);

    return new Response(
      JSON.stringify({ success: true, message: "Notifications processed", sent: totalSent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Send notification error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to send notifications";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
