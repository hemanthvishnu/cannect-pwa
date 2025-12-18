import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLOUDFLARE_ACCOUNT_ID = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
const CLOUDFLARE_IMAGES_TOKEN = Deno.env.get("CLOUDFLARE_IMAGES_API_TOKEN")!;
const CLOUDFLARE_STREAM_TOKEN = Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN")!;
const CLOUDFLARE_IMAGES_HASH = Deno.env.get("CLOUDFLARE_IMAGES_ACCOUNT_HASH")!;
const CLOUDFLARE_STREAM_SUBDOMAIN = Deno.env.get("CLOUDFLARE_STREAM_SUBDOMAIN")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, upload-length",
};

interface UploadRequest {
  type: "image" | "video";
  filename?: string;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ========================================
    // Health Check Endpoint (GET request)
    // ========================================
    if (req.method === "GET") {
      // Test Cloudflare Images API connectivity
      const testResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1/stats`,
        {
          headers: { Authorization: `Bearer ${CLOUDFLARE_IMAGES_TOKEN}` },
        }
      );
      const testData = await testResponse.json();

      return new Response(
        JSON.stringify({
          status: "ok",
          cloudflareConnected: testData.success === true,
          accountId: CLOUDFLARE_ACCOUNT_ID ? "✓ set" : "✗ missing",
          imagesToken: CLOUDFLARE_IMAGES_TOKEN ? "✓ set" : "✗ missing",
          streamToken: CLOUDFLARE_STREAM_TOKEN ? "✓ set" : "✗ missing",
          imagesHash: CLOUDFLARE_IMAGES_HASH ? "✓ set" : "✗ missing",
          streamSubdomain: CLOUDFLARE_STREAM_SUBDOMAIN ? "✓ set" : "✗ missing",
          cloudflareResponse: testData.success ? "API connected" : testData.errors,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================
    // 1. Verify Authentication (POST requests)
    // ========================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { type, filename } = (await req.json()) as UploadRequest;

    // ========================================
    // 2. CLOUDFLARE IMAGES - Direct Upload
    // ========================================
    if (type === "image") {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v2/direct_upload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CLOUDFLARE_IMAGES_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requireSignedURLs: false,
            metadata: {
              userId: user.id,
              uploadedAt: new Date().toISOString(),
              filename: filename || "image",
            },
          }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        console.error("Cloudflare Images error:", data.errors);
        throw new Error(data.errors?.[0]?.message || "Failed to get upload URL");
      }

      // Return the direct upload URL and image ID
      return new Response(
        JSON.stringify({
          uploadURL: data.result.uploadURL,
          id: data.result.id,
          deliveryBaseUrl: `https://imagedelivery.net/${CLOUDFLARE_IMAGES_HASH}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================
    // 3. CLOUDFLARE STREAM - TUS Resumable Upload
    // ========================================
    if (type === "video") {
      const uploadLength = req.headers.get("Upload-Length") || "0";

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream?direct_user=true`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CLOUDFLARE_STREAM_TOKEN}`,
            "Tus-Resumable": "1.0.0",
            "Upload-Length": uploadLength,
            "Upload-Metadata": [
              `name ${btoa(filename || "video")}`,
              `userid ${btoa(user.id)}`,
              `uploadedat ${btoa(new Date().toISOString())}`,
            ].join(","),
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Cloudflare Stream error:", errorText);
        throw new Error("Failed to initialize video upload");
      }

      const uploadURL = response.headers.get("Location");
      const streamMediaId = response.headers.get("stream-media-id");

      if (!uploadURL || !streamMediaId) {
        throw new Error("Missing upload URL or media ID from Stream response");
      }

      // Return TUS endpoint and media ID
      return new Response(
        JSON.stringify({
          uploadURL,
          mediaId: streamMediaId,
          playbackBaseUrl: `https://customer-${CLOUDFLARE_STREAM_SUBDOMAIN}.cloudflarestream.com`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid type. Use 'image' or 'video'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Upload URL error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
