import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore - web-push npm import for Deno
import webpush from "npm:web-push@3.6.7";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface PushPayload {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface WebPushSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configure web-push with VAPID keys
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:hello@cannect.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

/**
 * Send push notification via Expo Push API (for mobile)
 */
async function sendExpoPush(token: string, title: string, body: string, data: Record<string, unknown>) {
  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: token,
      title,
      body,
      sound: "default",
      badge: 1,
      data: data || {},
      priority: "high",
      channelId: "default",
    }),
  });

  return await response.json();
}

/**
 * Send push notification via Web Push API (for browsers)
 */
async function sendWebPush(subscription: WebPushSubscription, title: string, body: string, data: Record<string, unknown>) {
  const payload = JSON.stringify({
    title,
    body,
    data,
  });

  try {
    await webpush.sendNotification(subscription, payload);
    return { success: true };
  } catch (error: any) {
    console.error("Web Push error:", error);
    return { success: false, error: error.message, statusCode: error.statusCode };
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, title, body, data } = (await req.json()) as PushPayload;

    if (!userId || !title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: userId, title, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get user's push tokens (both Expo and Web)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("expo_push_token, web_push_subscription")
      .eq("id", userId)
      .single();

    if (profileError) {
      console.error("Profile fetch error:", profileError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch user profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: { expo?: any; web?: any } = {};
    let anySuccess = false;

    // ========================================
    // Send Expo Push (Mobile)
    // ========================================
    if (profile?.expo_push_token?.startsWith("ExponentPushToken[")) {
      console.log("Sending Expo Push to:", profile.expo_push_token);
      const expoResult = await sendExpoPush(profile.expo_push_token, title, body, data || {});
      results.expo = expoResult;

      // Check for errors and clean up invalid tokens
      if (expoResult.data?.[0]?.status === "error") {
        console.error("Expo push error:", expoResult.data[0]);
        if (expoResult.data[0].details?.error === "DeviceNotRegistered") {
          await supabaseAdmin
            .from("profiles")
            .update({ expo_push_token: null })
            .eq("id", userId);
        }
      } else {
        anySuccess = true;
      }
    }

    // ========================================
    // Send Web Push (Browser)
    // ========================================
    if (profile?.web_push_subscription && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      const subscription = profile.web_push_subscription as WebPushSubscription;
      
      if (subscription.endpoint && subscription.keys) {
        console.log("Sending Web Push to:", subscription.endpoint);
        const webResult = await sendWebPush(subscription, title, body, data || {});
        results.web = webResult;

        // Clean up expired/invalid subscriptions
        if (!webResult.success && (webResult.statusCode === 404 || webResult.statusCode === 410)) {
          console.log("Web Push subscription expired, removing...");
          await supabaseAdmin
            .from("profiles")
            .update({ web_push_subscription: null })
            .eq("id", userId);
        } else if (webResult.success) {
          anySuccess = true;
        }
      }
    }

    // If neither token exists, return skipped
    if (!profile?.expo_push_token && !profile?.web_push_subscription) {
      return new Response(
        JSON.stringify({ error: "User has no push tokens", skipped: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: anySuccess, 
        results,
        sentTo: {
          expo: !!profile?.expo_push_token,
          web: !!profile?.web_push_subscription,
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Push notification error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
