// Public values only. The anon key is safe in the browser; Row Level Security protects the data.
export const SUPABASE_URL = "https://faetctxgwkqytxukoweu.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhZXRjdHhnd2txeXR4dWtvd2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NDY1ODgsImV4cCI6MjEwOTAyMjU4OH0.KdgVIaJojSRZuFT5FdoFewCTFT7DUApTUfG6AeR_bGw";
export const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
export const BUCKET = "chat-media";

// Web Push public key (the private half lives only on the server).
export const VAPID_PUBLIC = "BOlCzsRGdZD23XBHYFCq5lrtgWAhQX1Utfq65jI7kGgB3-eXf-jnsEC15p6UQ5ov6gZ0suoOP0MXSGMsdEiYUgs";

// Optional TURN relay so calls connect on strict networks. Leave empty until you have credentials, e.g.:
// [{ urls: "turn:YOUR_HOST:443?transport=tcp", username: "YOUR_USER", credential: "YOUR_PASSWORD" }]
export const TURN_SERVERS = [];

// Address of your Cloudflare Worker (it stores the chats). Replace after you deploy the Worker, e.g.
// "https://private-chat-api.YOUR-SUBDOMAIN.workers.dev"
export const API_URL = "https://REPLACE-WITH-YOUR-WORKER.workers.dev";
