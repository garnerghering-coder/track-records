import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/call-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      return new Response(JSON.stringify({ error: "Firecrawl not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { seriesName, seasonYear, jobId } = await req.json();
    if (!seriesName || !seasonYear) {
      return new Response(JSON.stringify({ error: "seriesName and seasonYear are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If no jobId provided, create a job row
    let activeJobId = jobId;
    if (!activeJobId) {
      const { data: job, error: jobErr } = await adminClient.from("discovery_jobs").insert({
        series_name: seriesName,
        season_year: seasonYear,
        status: "queued",
        created_by: userId,
      }).select("id").single();
      if (jobErr || !job) {
        return new Response(JSON.stringify({ error: "Failed to create job" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      activeJobId = job.id;
    }

    // Helper to append a log entry and update job fields
    async function updateJob(fields: Record<string, any>, logMessage?: string) {
      if (logMessage) {
        // Append to progress_log using raw SQL via RPC isn't available,
        // so we fetch current log, append, and update
        const { data: current } = await adminClient
          .from("discovery_jobs")
          .select("progress_log")
          .eq("id", activeJobId)
          .single();
        const log = (current?.progress_log as any[]) || [];
        log.push({ time: new Date().toISOString(), message: logMessage });
        fields.progress_log = log;
      }
      await adminClient.from("discovery_jobs").update(fields).eq("id", activeJobId);
    }

    // Fire-and-forget: start background processing
    const backgroundWork = async () => {
      try {
        await updateJob({ status: "running" }, `Searching for ${seriesName} ${seasonYear} results...`);

        // Step 1: Search for season results
        const searchQuery = `${seriesName} ${seasonYear} full season race results`;
        const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchQuery, limit: 10, scrapeOptions: { formats: ["markdown"] } }),
        });

        if (!searchResponse.ok) {
          await updateJob({ status: "failed" }, `Search failed: ${await searchResponse.text()}`);
          return;
        }

        const searchData = await searchResponse.json();
        const searchResults = searchData.data || [];
        await updateJob({}, `Found ${searchResults.length} search results. Analyzing with AI...`);

        if (searchResults.length === 0) {
          await updateJob({ status: "failed" }, "No results found for this series/year");
          return;
        }

        // Combine search result content for AI analysis
        const combinedContent = searchResults.map((r: any, i: number) =>
          `--- Result ${i + 1}: ${r.url} ---\nTitle: ${r.title || ""}\n${(r.markdown || r.description || "").slice(0, 5000)}`
        ).join("\n\n");

        // Step 2: Ask AI to extract race events
        const aiResponse = await callAI({
          max_tokens: 8192,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are a motorsport data researcher. Given search results about a racing series season, extract a list of individual race events with URLs where their full results can be found.

Return JSON: { "events": [{ "event_name": "string", "result_url": "string or null", "event_date": "YYYY-MM-DD or null", "location": "string or null" }] }

Rules:
- List every round/race you can identify from the season
- Only include URLs that look like they lead to actual race results pages (not news articles or previews)
- If you can't find a result URL for an event, set result_url to null
- Use the official event name
- Order events chronologically`,
            },
            {
              role: "user",
              content: `Extract all race events from the ${seasonYear} ${seriesName} season from these search results:\n\n${combinedContent.slice(0, 60000)}`,
            },
          ],
        });

        if (!aiResponse.ok) {
          await updateJob({ status: "failed" }, `AI failed to extract events: ${await aiResponse.text()}`);
          return;
        }

        const aiData = await aiResponse.json();
        const rawContent = aiData.choices?.[0]?.message?.content;
        if (!rawContent) {
          await updateJob({ status: "failed" }, "AI returned no content");
          return;
        }

        let discovered;
        try {
          discovered = JSON.parse(rawContent);
        } catch {
          await updateJob({ status: "failed" }, "AI returned invalid JSON");
          return;
        }

        const events = discovered.events || [];
        await updateJob({ events_found: events.length }, `✅ Discovered ${events.length} events`);

        if (events.length === 0) {
          await updateJob({ status: "failed" }, "No events found for this series/year");
          return;
        }

        // Step 3: Check which events already exist
        const { data: existingEvents } = await adminClient
          .from("race_events")
          .select("event_name, series_name, season_year")
          .eq("season_year", seasonYear)
          .ilike("series_name", `%${seriesName.split(" ").slice(0, 2).join(" ")}%`);

        const existingSet = new Set(
          (existingEvents || []).map(e => `${e.event_name.toLowerCase()}|${e.season_year}`)
        );

        // Step 4: Import each event
        let imported = 0, skipped = 0, failed = 0, noUrl = 0;

        for (let i = 0; i < events.length; i++) {
          // Check if job was cancelled
          const { data: jobCheck } = await adminClient.from("discovery_jobs").select("status").eq("id", activeJobId).single();
          if (jobCheck?.status === "cancelled") {
            await updateJob({ status: "cancelled" }, "🛑 Job cancelled by user");
            return;
          }

          const event = events[i];
          const key = `${event.event_name.toLowerCase()}|${seasonYear}`;

          if (existingSet.has(key)) {
            skipped++;
            await updateJob(
              { events_skipped: skipped },
              `⏭️ [${i + 1}/${events.length}] ${event.event_name} — skipped (already exists)`
            );
            continue;
          }

          if (!event.result_url) {
            noUrl++;
            await updateJob(
              { events_no_url: noUrl },
              `⚠️ [${i + 1}/${events.length}] ${event.event_name} — no results URL found`
            );
            continue;
          }

          try {
            await updateJob({}, `⏳ [${i + 1}/${events.length}] ${event.event_name} — importing...`);

            const importResponse = await fetch(`${SUPABASE_URL}/functions/v1/scrape-race-results`, {
              method: "POST",
              headers: {
                Authorization: authHeader,
                "Content-Type": "application/json",
                apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
              },
              body: JSON.stringify({ url: event.result_url }),
            });

            const importResult = await importResponse.json();
            if (importResponse.ok && importResult.success) {
              imported++;
              existingSet.add(key);
              await updateJob(
                { events_imported: imported },
                `✅ [${i + 1}/${events.length}] ${event.event_name} — ${importResult.entriesCount} entries imported`
              );
            } else {
              failed++;
              await updateJob(
                { events_failed: failed },
                `❌ [${i + 1}/${events.length}] ${event.event_name} — ${importResult.error || "Import failed"}`
              );
            }
          } catch (err) {
            failed++;
            await updateJob(
              { events_failed: failed },
              `❌ [${i + 1}/${events.length}] ${event.event_name} — ${err instanceof Error ? err.message : "Unknown error"}`
            );
          }
        }

        // Final summary
        await updateJob(
          { status: "completed", events_imported: imported, events_skipped: skipped, events_failed: failed, events_no_url: noUrl },
          `✅ Complete — ${imported} imported, ${skipped} skipped, ${failed} failed, ${noUrl} no URL`
        );
      } catch (e) {
        console.error("discover-series background error:", e);
        await updateJob({ status: "failed" }, `Fatal error: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    // Use EdgeRuntime.waitUntil if available, otherwise detached promise
    if (typeof (globalThis as any).EdgeRuntime !== "undefined" && (globalThis as any).EdgeRuntime.waitUntil) {
      (globalThis as any).EdgeRuntime.waitUntil(backgroundWork());
    } else {
      // Fire and forget - don't await
      backgroundWork();
    }

    // Return immediately with the job ID
    return new Response(JSON.stringify({ jobId: activeJobId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("discover-series error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

