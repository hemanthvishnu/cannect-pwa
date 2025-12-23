import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Process Jetstream Event
 * 
 * Receives events from the Jetstream consumer running on VPS.
 * Creates notifications for Cannect users when external Bluesky
 * users interact with their content.
 */

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const CANNECT_DOMAIN = "cannect.space";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface JetstreamEvent {
  actorDid: string;
  collection: string;
  operation: string;
  record: Record<string, unknown>;
  rkey: string;
  time_us: number;
}

async function getActorProfile(did: string) {
  try {
    const response = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`
    );
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.error("Failed to fetch actor profile:", e);
  }
  return null;
}

async function findUserByDid(did: string): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("did", did)
    .maybeSingle();
  
  if (error) {
    console.error("Error finding user:", error);
    return null;
  }
  return data;
}

async function findPostByUri(uri: string): Promise<{ id: string; user_id: string; content: string } | null> {
  const { data, error } = await supabase
    .from("posts")
    .select("id, user_id, content")
    .eq("atproto_uri", uri)
    .maybeSingle();
  
  if (error) {
    console.error("Error finding post:", error);
    return null;
  }
  return data;
}

async function createNotification(params: {
  userId: string;
  actorDid: string;
  reason: "like" | "repost" | "reply" | "quote" | "follow";
  postId?: string;
}) {
  const { userId, actorDid, reason, postId } = params;
  
  // Get actor profile for display
  const actorProfile = await getActorProfile(actorDid);
  const actorHandle = actorProfile?.handle || actorDid;
  const actorName = actorProfile?.displayName || actorHandle;
  
  // Check if notification already exists (dedup)
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("reason", reason)
    .eq("actor_did", actorDid)
    .eq("is_external", true)
    .limit(1);
  
  if (existing && existing.length > 0) {
    console.log("Notification already exists, skipping");
    return { created: false, reason: "duplicate" };
  }
  
  // Create notification (actor_id is null for external notifications)
  const insertData: Record<string, unknown> = {
    user_id: userId,
    reason: reason,
    post_id: postId || null,
    is_external: true,
    actor_did: actorDid,
    actor_handle: actorHandle,
    actor_display_name: actorName,
    actor_avatar: actorProfile?.avatar || null,
    is_read: false,
    created_at: new Date().toISOString(),
  };
  
  const { error } = await supabase.from("notifications").insert(insertData);
  
  if (error) {
    console.error("Error creating notification:", error);
    return { created: false, reason: error.message };
  }
  
  console.log(`Created ${reason} notification for user ${userId}`);
  return { created: true, type: reason };
}

async function processLike(event: JetstreamEvent) {
  const subjectUri = (event.record as { subject?: { uri?: string } })?.subject?.uri;
  if (!subjectUri || !subjectUri.includes(CANNECT_DOMAIN)) {
    return { created: false, reason: "not cannect content" };
  }
  
  // Find the post being liked
  const post = await findPostByUri(subjectUri);
  if (!post) {
    return { created: false, reason: "post not found" };
  }
  
  // Don't notify if user is liking their own post
  const actor = await findUserByDid(event.actorDid);
  if (actor?.id === post.user_id) {
    return { created: false, reason: "self-like" };
  }
  
  return createNotification({
    userId: post.user_id,
    actorDid: event.actorDid,
    reason: "like",
    postId: post.id,
  });
}

async function processRepost(event: JetstreamEvent) {
  const subjectUri = (event.record as { subject?: { uri?: string } })?.subject?.uri;
  if (!subjectUri || !subjectUri.includes(CANNECT_DOMAIN)) {
    return { created: false, reason: "not cannect content" };
  }
  
  // Find the post being reposted
  const post = await findPostByUri(subjectUri);
  if (!post) {
    return { created: false, reason: "post not found" };
  }
  
  // Don't notify if user is reposting their own post
  const actor = await findUserByDid(event.actorDid);
  if (actor?.id === post.user_id) {
    return { created: false, reason: "self-repost" };
  }
  
  return createNotification({
    userId: post.user_id,
    actorDid: event.actorDid,
    reason: "repost",
    postId: post.id,
  });
}

async function processPost(event: JetstreamEvent) {
  const record = event.record as {
    reply?: {
      parent?: { uri?: string };
      root?: { uri?: string };
    };
    embed?: {
      record?: { uri?: string };
    };
  };
  
  // Check for reply to Cannect post
  const parentUri = record?.reply?.parent?.uri;
  if (parentUri && parentUri.includes(CANNECT_DOMAIN)) {
    const post = await findPostByUri(parentUri);
    if (post) {
      const actor = await findUserByDid(event.actorDid);
      if (actor?.id !== post.user_id) {
        return createNotification({
          userId: post.user_id,
          actorDid: event.actorDid,
          reason: "reply",
          postId: post.id,
        });
      }
    }
  }
  
  // Check for quote of Cannect post
  const quotedUri = record?.embed?.record?.uri;
  if (quotedUri && quotedUri.includes(CANNECT_DOMAIN)) {
    const post = await findPostByUri(quotedUri);
    if (post) {
      const actor = await findUserByDid(event.actorDid);
      if (actor?.id !== post.user_id) {
        return createNotification({
          userId: post.user_id,
          actorDid: event.actorDid,
          reason: "quote",
          postId: post.id,
        });
      }
    }
  }
  
  return { created: false, reason: "not relevant" };
}

async function processFollow(event: JetstreamEvent) {
  const subjectDid = (event.record as { subject?: string })?.subject;
  if (!subjectDid) {
    return { created: false, reason: "no subject" };
  }
  
  // Find if subject is a Cannect user
  const targetUser = await findUserByDid(subjectDid);
  if (!targetUser) {
    return { created: false, reason: "target not cannect user" };
  }
  
  // Don't notify if following self (shouldn't happen but just in case)
  const actor = await findUserByDid(event.actorDid);
  if (actor?.id === targetUser.id) {
    return { created: false, reason: "self-follow" };
  }
  
  return createNotification({
    userId: targetUser.id,
    actorDid: event.actorDid,
    reason: "follow",
  });
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  try {
    const event: JetstreamEvent = await req.json();
    
    console.log(`Processing ${event.collection} ${event.operation} from ${event.actorDid.slice(0, 20)}...`);
    
    // Only process create operations
    if (event.operation !== "create") {
      return new Response(JSON.stringify({ created: false, reason: "not create operation" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    let result: { created: boolean; type?: string; reason?: string };
    
    switch (event.collection) {
      case "app.bsky.feed.like":
        result = await processLike(event);
        break;
        
      case "app.bsky.feed.repost":
        result = await processRepost(event);
        break;
        
      case "app.bsky.feed.post":
        result = await processPost(event);
        break;
        
      case "app.bsky.graph.follow":
        result = await processFollow(event);
        break;
        
      default:
        result = { created: false, reason: "unknown collection" };
    }
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    
  } catch (error) {
    console.error("Error processing event:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
