import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { startImage, endImage, prompt, duration } = await request.json();

    if (!startImage) {
      return NextResponse.json({ error: 'Başlangıç görseli gereklidir' }, { status: 400 });
    }

    const FAL_KEY = process.env.FAL_KEY;
    if (!FAL_KEY) {
      return NextResponse.json({ error: 'FAL API anahtarı yapılandırılmamış' }, { status: 500 });
    }

    console.log("=== LUXORA VIDEO ===");
    console.log("Duration:", duration || "auto");
    console.log("Has end frame:", !!endImage);
    console.log("Prompt:", prompt || "(default)");

    // Upload images to CDN
    let startUrl = startImage;
    let endUrl = endImage || null;

    if (startImage.startsWith('data:')) {
      startUrl = await uploadToFalCDN(startImage, FAL_KEY);
    }
    if (endImage && endImage.startsWith('data:')) {
      endUrl = await uploadToFalCDN(endImage, FAL_KEY);
    }

    const videoPrompt = prompt && prompt.trim()
      ? prompt.trim()
      : "Slow cinematic camera movement through an elegant interior space, smooth dolly shot, gentle panning, professional architectural videography, ambient lighting";

    // Build request body
    const body: Record<string, unknown> = {
      prompt: videoPrompt,
      image_url: startUrl,
      duration: duration || 5,
      resolution: "720p",
      aspect_ratio: "16:9",
    };

    if (endUrl) {
      body.end_image_url = endUrl;
    }

    console.log("Calling Seedance 2.0...");

    // Submit to queue (video generation is long-running)
    const submitRes = await fetch("https://queue.fal.run/bytedance/seedance-2.0/image-to-video", {
      method: "POST",
      headers: { "Authorization": `Key ${FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      console.error("Seedance submit error:", errText);
      throw new Error(`Video kuyruğa eklenemedi: ${submitRes.status}`);
    }

    const { request_id } = await submitRes.json();
    console.log("Queue request_id:", request_id);

    // Poll for result (max 5 minutes)
    const maxWait = 300_000;
    const pollInterval = 5_000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));

      const statusRes = await fetch(`https://queue.fal.run/bytedance/seedance-2.0/image-to-video/requests/${request_id}/status`, {
        headers: { "Authorization": `Key ${FAL_KEY}` },
      });

      if (!statusRes.ok) continue;
      const statusData = await statusRes.json();

      if (statusData.status === "COMPLETED") {
        // Fetch result
        const resultRes = await fetch(`https://queue.fal.run/bytedance/seedance-2.0/image-to-video/requests/${request_id}`, {
          headers: { "Authorization": `Key ${FAL_KEY}` },
        });

        if (!resultRes.ok) throw new Error("Sonuç alınamadı");
        const resultData = await resultRes.json();

        if (resultData.video?.url) {
          console.log("✅ Video başarılı:", resultData.video.url);
          return NextResponse.json({ success: true, videoUrl: resultData.video.url });
        }
        throw new Error("Video URL bulunamadı");
      }

      if (statusData.status === "FAILED") {
        throw new Error("Video üretimi başarısız");
      }

      // IN_QUEUE or IN_PROGRESS — keep polling
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`Polling... ${elapsed}s elapsed, status: ${statusData.status}`);
    }

    throw new Error("Video üretimi zaman aşımına uğradı (5 dakika)");

  } catch (error) {
    console.error('Video error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Video üretilemedi'
    }, { status: 500 });
  }
}

// CDN Upload
async function uploadToFalCDN(base64Data: string, apiKey: string): Promise<string> {
  const matches = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid base64");
  const mimeType = matches[1];
  const base64 = matches[2];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

  const ext = mimeType.split('/')[1] || 'png';
  const initRes = await fetch("https://fal.run/fal-ai/fal-storage/upload/initiate", {
    method: "POST",
    headers: { "Authorization": `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ file_name: `video_${Date.now()}.${ext}`, content_type: mimeType }),
  });
  if (!initRes.ok) return base64Data;
  const { upload_url, file_url } = await initRes.json();
  const uploadRes = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": mimeType }, body: bytes });
  return uploadRes.ok ? file_url : base64Data;
}
